import { useEffect, useState } from 'react';
import { MobileDrawer } from './ResponsiveLayout';
import { ResourceDialog } from './ResourceDialog';
import { ReviewSequencePreview } from './ReviewSequencePreview';
import { decideReview, loadReviewManifest, loadReviewRows, type ReviewManifest, type ReviewRow, type ReviewStatus } from './resource-review-client';
import './resource-review.css';
import './dialog-drawers.css';

const labels:Record<ReviewStatus,string>={pending:'未标记',usable:'可用',unusable:'不可用'};
function ReviewPanel({close}:{close:()=>void}) {
  const [manifest,setManifest]=useState<ReviewManifest|null>(null),[rows,setRows]=useState<Record<string,ReviewRow>>({});
  const [listOpen,setListOpen]=useState(true);
  const [selected,setSelected]=useState(''),[filter,setFilter]=useState<'all'|ReviewStatus>('pending');
  const [search,setSearch]=useState(''),[note,setNote]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[online,setOnline]=useState(false);
  const item=manifest?.items.find(a=>a.id===selected),row=rows[selected];
  const dirty=!!row && note!==row.note;
  useEffect(()=>{
    let live=true;
    (async()=>{
      try {
        const manifest=await loadReviewManifest();if(!live)return;setManifest(manifest);
        const rows=await loadReviewRows(manifest);if(!live)return;
        setRows(rows);setOnline(manifest.enabled);
        const first=manifest.items.find(a=>rows[a.id]?.status==='pending') || manifest.items[0];
        if(first){setSelected(first.id);setNote(rows[first.id]?.note || '');}
      }catch(e){if(live)setError(String(e instanceof Error?e.message:e));}
      finally{if(live)setLoading(false);}
    })();
    return ()=>{live=false;};
  },[]);
  useEffect(()=>{
    if(!dirty && !saving)return;
    const guard=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};
    window.addEventListener('beforeunload',guard);return ()=>window.removeEventListener('beforeunload',guard);
  },[dirty,saving]);
  function choose(id:string) {
    if(saving || loading)return;
    if(id===selected){setListOpen(false);return;}
    if(dirty && !confirm('备注尚未保存，是否放弃备注并切换资源？'))return;
    setListOpen(false);setSelected(id);setNote(rows[id]?.note || '');setMessage('');
  }
  async function refresh() {
    if(loading || saving)return;
    if(dirty && !confirm('刷新云端状态将替换未保存的备注，是否继续？'))return;
    setLoading(true);setOnline(false);setError('');
    try {
      // A new deployment may replace the batch entirely. Refresh its manifest
      // too, and swap manifest/status together only after both reads succeed.
      const nextManifest=await loadReviewManifest(),next=await loadReviewRows(nextManifest);
      const nextItem=nextManifest.items.find(a=>a.id===selected) || nextManifest.items.find(a=>next[a.id]?.status==='pending') || nextManifest.items[0];
      setManifest(nextManifest);setRows(next);setSelected(nextItem?.id || '');setNote(nextItem?next[nextItem.id]?.note || '':'');
      setOnline(nextManifest.enabled);setMessage(nextManifest.enabled?'已重新读取发布批次与最新云端确认状态':'当前发布未启用资源确认');
    }
    catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setLoading(false);}
  }
  async function mark(status:ReviewStatus) {
    if(!online || loading || saving || !item || !row || !manifest?.namespace)return;
    setSaving(true);setError('');setMessage('正在保存到云端…');
    try {
      const next=await decideReview(manifest.namespace,item,row,status,note);
      setRows(old=>({...old,[item.id]:next}));setNote(next.note);setMessage(`已保存到云端：${item.name} → ${labels[status]}`);
    }catch(e){setError(e instanceof Error?e.message:String(e));setMessage('未确认保存成功，请保留备注并刷新核对');setOnline(false);}
    finally{setSaving(false);}
  }
  const items=manifest?.items || [],shown=items.filter(a=>(filter==='all' || rows[a.id]?.status===filter) && a.name.toLowerCase().includes(search.toLowerCase()));
  const emptyMessage=items.length
    ? search.trim()?'没有符合当前搜索和筛选的资源。':'当前筛选没有资源；可切换“本批次全部”查看已载入的资源。'
    : manifest?.scan?.uniqueAssets===0?'本次构建的待确认目录为空，未收集到图片或视频；不代表仓库中没有素材。'
    : manifest?.scan && manifest.scan.reviewed>0?'本次扫描的资源均已有标记，因此没有进入本次发布批次。'
    : '本批次未包含待确认资源；此旧版清单未提供扫描统计，无法判断是目录为空还是资源已标记。';
  return <ResourceDialog title="资源确认" description="临时发布 → 人工确认 → bot 拉取结果；下次发布仅包含未标记资源" close={()=>{if(saving)return;if(dirty && !confirm('备注尚未保存，是否放弃并关闭？'))return;close();}}>
    <div className="review-panel">
      {!manifest?.enabled && !loading && !error ? <section><h3>资源确认尚未启用</h3><p>把待确认的图片、视频或动图放入 resource-review/inbox/。部署者需先恢复 Supabase、应用确认表迁移并配置服务端环境变量，再重新发布。</p><p>本地制作不受影响；此模块不会把标记假装保存在浏览器，也不会自动删除素材。</p></section> : <>
      <div className="review-toolbar"><label>确认状态<select aria-label="确认状态" value={filter} onChange={e=>setFilter(e.target.value as typeof filter)}><option value="pending">未标记</option><option value="usable">可用</option><option value="unusable">不可用</option><option value="all">本批次全部</option></select></label><input aria-label="搜索待确认资源" placeholder="搜索名称" value={search} onChange={e=>setSearch(e.target.value)}/><button disabled={loading||saving} title="重新读取当前发布的清单和云端标记；本地新增文件需先加入审核目录并重新发布" onClick={refresh}>刷新云端状态</button><small>{loading?'正在读取批次与状态…':!online?'确认状态未能读取，请重试；不能据此判断是否还有未标记资源。':<>本批次 {items.length} 项 · 未标记 {items.filter(a=>rows[a.id]?.status==='pending').length} · 可用 {items.filter(a=>rows[a.id]?.status==='usable').length} · 不可用 {items.filter(a=>rows[a.id]?.status==='unusable').length}</>}</small></div>
      {manifest && <details className="review-batch-info"><summary>发布范围与扫描信息</summary><p>只扫描 resource-review/inbox/，不会自动收集正式素材库、参考图或视频。批次生成时间：{Number.isFinite(Date.parse(manifest.generatedAt))?new Date(manifest.generatedAt).toLocaleString():manifest.generatedAt}。</p>{manifest.scan && <p>扫描 {manifest.scan.files} 个文件，去重后 {manifest.scan.uniqueAssets} 项：图片 {manifest.scan.images} · 动图 {manifest.scan.animations} · 视频 {manifest.scan.videos}；构建时未标记 {manifest.scan.pending} 项，排除已标记 {manifest.scan.reviewed} 项。</p>}<p>这里的状态只表示当前发布批次。新文件需加入审核目录并重新发布，再刷新批次。</p></details>}
      <nav className="mobile-sections drawer-triggers" aria-label="资源确认分区"><button aria-expanded={listOpen} aria-controls="review-list-drawer" onClick={()=>setListOpen(!listOpen)}>待确认列表</button></nav><div className="review-body review-drawer-layout"><MobileDrawer id="review-list-drawer" title="待确认列表" side="left" open={listOpen} onClose={()=>setListOpen(false)} className="review-list-drawer"><section className="review-grid" aria-label="待确认资源列表">
        {(loading || error) && <p className="drawer-feedback">{error || '正在读取确认批次与云端状态…'}</p>}
        {shown.map(a=><button key={a.id} className={a.id===selected?'selected':''} disabled={saving||loading} onClick={()=>choose(a.id)} aria-label={`查看 ${a.name}`}>
          {a.kind==='video'?<div className="review-video-placeholder">▶ 视频</div>:<img src={a.url} alt="" loading="lazy"/>}
          <span>{a.name}</span><small>{a.kind==='animation'?'动图 · ':''}{rows[a.id]?labels[rows[a.id].status]:'状态未读取'} · {(a.bytes/1024/1024).toFixed(2)} MB</small>
        </button>)}
        {!loading && !error && online && !shown.length && <p className="review-empty" role="status">{emptyMessage}{!items.length && <> 扫描来源：resource-review/inbox/；请核对需送审的目录与发布批次。</>}</p>}
      </section></MobileDrawer><section className="review-detail" aria-label="资源确认预览">
        {item?<><h3>{item.name}</h3>{item.kind==='image'?<ReviewSequencePreview key={item.id} url={item.url} name={item.name}/>:<div className="review-stage">{item.kind==='video'?<video key={item.id} src={item.url} controls playsInline preload="metadata" aria-label="待确认视频"/>:<img key={item.id} src={item.url} alt={`资源大图 ${item.name}`}/>}</div>}
          <small>当前状态：{row?labels[row.status]:'未能读取'} · 标识 {item.id.slice(0,12)} · {(item.bytes/1024/1024).toFixed(2)} MB</small>
          <label>确认备注<textarea maxLength={2000} rows={3} value={note} disabled={saving||loading||!row} onChange={e=>setNote(e.target.value)} placeholder="例如：可用于村庄；人物边缘需再处理"/></label>
          <div className="review-actions"><button disabled={!online||loading||saving||!row} onClick={()=>mark('usable')}>标记可用</button><button disabled={!online||loading||saving||!row} onClick={()=>mark('unusable')}>标记不可用</button><button disabled={!online||loading||saving||!row||row.status==='pending'} onClick={()=>mark('pending')}>重新设为未标记</button></div>
          <p>标记写入线上数据库。已标记素材仍可在本批次切换筛选查看；下次构建不再携带。新内容会自动获得新的未标记身份。</p>
        </>:<p>选择资源查看大图、图集序列帧、动图或播放视频。</p>}
      </section></div></>}
      <div className="review-feedback">{loading && <p role="status">正在读取确认批次与云端状态…</p>}{error && <p role="alert">{error} <a href="/login" target="_blank" rel="noreferrer">在新窗口登录</a></p>}<p role="status" aria-label="资源确认状态">{message}</p></div>
    </div>
  </ResourceDialog>;
}
export function ResourceReview() {
  const [open,setOpen]=useState(false);
  return <><button onClick={()=>setOpen(true)}>资源确认</button>{open && <ReviewPanel close={()=>setOpen(false)}/>}</>;
}
