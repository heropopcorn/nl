import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { type Project } from '../../../packages/core';
import { isLocalWork } from './runtime';
import { checkWorkspaceResponse, externalizeProject, importWorkspacePackage, recoverWorkspaceDraft, saveWorkspace, workspaceDrafts, workspaceHeaders, workspaceRequest, workspaceState } from './workspace-storage';
import type { Draft } from './workspace-drafts';
import './workspace.css';
type Plan={keep:number;mediaBytes:number;backupBytes:number;backupCount:number;candidates:string[];reclaimable:number;signature:string;trash:{id:string;bytes:number}[]};
const size=(bytes:number)=>(bytes/1024/1024).toFixed(1)+' MB';
const subscribe=(fn:()=>void)=>{window.addEventListener('workspace-state',fn);return ()=>window.removeEventListener('workspace-state',fn);};
export function WorkspacePanel({project,ready,blocked,restore,notify,onBusy}:{project:Project;ready:boolean;blocked:boolean;restore:(p:Project)=>void;notify:(s:string)=>void;onBusy:(value:boolean)=>void}) {
  const state=useSyncExternalStore(subscribe,workspaceState), dialog=useRef<HTMLDialogElement>(null);
  const [busy,setBusy]=useState(false), [message,setMessage]=useState(''), [plan,setPlan]=useState<Plan|null>(null), [keep,setKeep]=useState(50), [drafts,setDrafts]=useState<Draft[]>([]);
  const busyRef=useRef(false);
  async function run(fn:()=>Promise<void>) {if(busyRef.current || !ready)return;busyRef.current=true;setBusy(true);onBusy(true);setMessage('正在处理，请勿关闭页面…');try{await fn();}catch(e){setMessage(String(e));notify(String(e));}finally{busyRef.current=false;setBusy(false);onBusy(false);}}
  useEffect(()=>{if(ready && isLocalWork()) void workspaceDrafts().then(setDrafts).catch(()=>{});},[ready]);
  async function inspect() {setPlan(await workspaceRequest('/maintenance/plan','POST',{keep}));setMessage('已生成清理预览，尚未移动或删除任何文件。');}
  async function exportPack() {
    // Ask for a disk destination during the click gesture, before any network awaits.
    const picker=(window as unknown as {showSaveFilePicker?: (options:unknown)=>Promise<{createWritable:()=>Promise<WritableStream<Uint8Array>>}>}).showSaveFilePicker;
    let destination:WritableStream<Uint8Array>|undefined;
    if(picker) destination=await (await picker({suggestedName:'director-project.nlpack',types:[{description:'元力项目包',accept:{'application/octet-stream':['.nlpack']}}]})).createWritable();
    try {
      const p=await externalizeProject(project,true);
      const res=await fetch('/api/workspace/package/export',{method:'POST',headers:{...workspaceHeaders(),'Content-Type':'application/json'},body:JSON.stringify({project:p})});
      await checkWorkspaceResponse(res,true);
      if(destination) {if(!res.body) throw new Error('项目包响应为空'); await res.body.pipeTo(destination);}
      else {
        if(Number(res.headers.get('content-length'))>256*1024*1024) {await res.body?.cancel();throw new Error('此浏览器不支持直接写入文件，超过 256MB 的项目请使用支持文件写入的浏览器，或复制工作目录');}
        const url=URL.createObjectURL(await res.blob()), link=document.createElement('a'); link.href=url;link.download='director-project.nlpack';link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
      }
      setMessage('项目包已导出，包含自定义素材；默认素材仍需配套完整软件。');
    } catch(e) {await destination?.abort().catch(()=>{});throw e;}
  }
  if(!isLocalWork()) return null;
  return <>
    <div className="workspace-controls"><button disabled={!ready} onClick={()=>{dialog.current?.showModal(); void workspaceDrafts().then(setDrafts).catch(()=>{});}}>本地文件 · {state.dirty?'未保存':'已保存'}{drafts.length?' · 有恢复草稿':''}</button></div>
    {createPortal(<>{(state.error || state.draftError || state.authRequired) && <div className="workspace-warning" role="alert"><strong>修改尚未安全保存</strong><span>{state.error || state.draftError || '登录已过期'}</span>{state.authRequired && <a href="/login" target="_blank" rel="noopener">在新窗口登录</a>}<button disabled={busy || blocked || state.conflict} onClick={()=>void run(async()=>{await saveWorkspace(project,false,true);setMessage('保存成功');})}>重试保存</button>{state.conflict && <span>存在版本冲突，请先导出项目，不能直接覆盖磁盘版本。</span>}</div>}
    <dialog ref={dialog} className="workspace-dialog" aria-label="本地文件与磁盘管理" onCancel={e=>{if(busy)e.preventDefault();}} onKeyDown={e=>e.stopPropagation()}>
      <div className="workspace-dialog-heading"><h2>本地文件与磁盘管理</h2><button disabled={busy} onClick={() => dialog.current?.close()} aria-label="关闭磁盘管理">关闭 ×</button></div><p>默认作品位于仓库的 projects/default。保存后仍需提交并推送 Git 才能跨设备同步；拉取前请停止本地服务。备份与回收区不提交，请另做独立备份。</p>
      <fieldset disabled={busy}><legend>项目包</legend><button onClick={()=>void run(exportPack)}>导出项目包</button><label className="button">导入项目包<input aria-label="导入项目包" type="file" accept=".nlpack" hidden disabled={blocked} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file && confirm('导入将替换当前工作目录项目，并保留替换前备份。是否继续？')) void run(async()=>{await saveWorkspace(project,true,true);const next=await importWorkspacePackage(file);restore(next);setPlan(null);setMessage('项目包已导入，原项目已备份。');});}}/></label><p>二进制素材不转 Base64；服务端流式读写。单素材上限 512MB，项目包上限 8GB。旧版 JSON 入口保留。</p></fieldset>
      <fieldset disabled={busy}><legend>恢复草稿</legend>{drafts.length===0?<p>暂无恢复草稿。</p>:drafts.map(d=><div key={d.id}><span>{new Date(d.time).toLocaleString()} · {d.project.name} </span><button onClick={()=>{if(confirm('用此草稿恢复编辑内容？旧版本草稿不会自动覆盖新磁盘版本。')) {restore(recoverWorkspaceDraft(d));dialog.current?.close();}}}>恢复草稿</button></div>)}</fieldset>
      <fieldset disabled={busy || blocked || state.dirty}><legend>磁盘清理（请先保存）</legend><label>保留最近备份数 <input aria-label="保留最近备份数" type="number" min="1" max="500" value={keep} onChange={e=>{setKeep(Number(e.target.value));setPlan(null);}}/></label><button onClick={()=>void run(inspect)}>检查磁盘占用</button>
        {plan && <><p>素材 {size(plan.mediaBytes)}；备份 {plan.backupCount} 份 / {size(plan.backupBytes)}；可移入回收区 {plan.candidates.length} 项 / {size(plan.reclaimable)}。</p><p>仅清理当前项目及保留备份均未引用、且写入超过 24 小时的素材。旧撤销记录需要这些素材时，可先恢复回收批次。</p><details><summary>查看候选文件</summary><ul>{plan.candidates.map(name=><li key={name}>{name}</li>)}</ul></details><button disabled={!plan.candidates.length} onClick={()=>{if(confirm(`将 ${plan.candidates.length} 项移入回收区？此操作不会立即释放磁盘空间，可恢复。`)) void run(async()=>{await workspaceRequest('/maintenance/clean','POST',{keep:plan.keep,signature:plan.signature});await inspect();setMessage('已移入回收区，可恢复；永久删除需要另行确认。');});}}>移入回收区</button>
          {plan.trash.map(batch=><div key={batch.id}><span>回收批次 {batch.id} · {size(batch.bytes)} </span><button onClick={()=>void run(async()=>{await workspaceRequest('/maintenance/restore','POST',{id:batch.id});await inspect();setMessage('此批次已恢复。');})}>恢复批次</button><button onClick={()=>{if(confirm('永久删除此回收批次？删除后无法恢复，请确认已有外部备份。')) void run(async()=>{await workspaceRequest('/maintenance/purge','POST',{id:batch.id,confirm:'永久删除'});await inspect();setMessage('此批次已永久删除，无法恢复。');});}}>永久删除批次</button></div>)}</>}
      </fieldset><p role="status">{message}</p><button disabled={busy} onClick={()=>dialog.current?.close()}>关闭本地文件</button>
    </dialog></>, document.body)}
  </>;
}
