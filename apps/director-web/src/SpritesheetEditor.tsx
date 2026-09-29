import { useEffect, useRef, useState } from 'react';
import { ResourceDialog } from './ResourceDialog';
import { CategoryCreator } from './CategoryCreator';
import { useSpritesheet } from './useSpritesheet';
import { importMedia } from './storage';
import { isLocalWork } from './runtime';
import { readSpriteDraft, storeSpriteDraft, type SpriteWork } from './sprite-draft-storage';
import type { SpriteDraft } from '../../../packages/core/sprite-draft';
import { workspaceState, saveWorkspace } from './workspace-storage';
import { projectSchema, type Project } from '../../../packages/core';
import { mediaSchema, type MediaAsset } from '../../../packages/core/media';
import { downloadBlob } from '../../../packages/spritesheet/images';
import { spriteDownloadStem } from '../../../packages/spritesheet/spriteFrames';
import './spritesheet.css';

export function SpritesheetEditor({ project, edit, close, saved, initialCategory }: { project: Project; edit: (fn: (p: Project) => void) => void | boolean; close: () => void; saved: (asset: MediaAsset) => void; initialCategory: string }) {
  const sheet = useSpritesheet(), dragging = useRef<number | null>(null);
  const [category, setCategory] = useState(initialCategory), [saving, setSaving] = useState(false), [message, setMessage] = useState('');
  const [draftId, setDraftId] = useState(() => crypto.randomUUID() as string), [openId, setOpenId] = useState('');
  const [savedWork, setSavedWork] = useState<(SpriteWork & { category: string }) | null>(null);
  const local = isLocalWork();
  const work: SpriteWork & {category: string} = {name:sheet.name,video:sheet.video,frames:sheet.frames,extract:sheet.extract,pack:sheet.pack,threshold:sheet.threshold,crop:sheet.crop,fps:sheet.fps,packed:sheet.packed,category};
  const dirty = !!sheet.video && (!savedWork || (Object.keys(work) as (keyof typeof work)[]).some(key => work[key] !== savedWork[key]));
  useEffect(() => {
    if (!dirty && !saving && !sheet.busy) return;
    const guard = (e: BeforeUnloadEvent) => {e.preventDefault(); e.returnValue = '';};
    window.addEventListener('beforeunload',guard); return () => window.removeEventListener('beforeunload',guard);
  }, [dirty,saving,sheet.busy]);
  function chooseVideo(file: File) {
    if (dirty && !confirm('当前制作内容尚未保存，是否放弃修改并选择另一个视频？')) return;
    sheet.chooseVideo(file); setDraftId(crypto.randomUUID()); setOpenId(''); setSavedWork(null); setMessage('');
  }
  function upsertDraft(p: Project, draft: SpriteDraft) {
    const index = p.spriteDrafts.findIndex(d => d.id === draft.id);
    if (index < 0) p.spriteDrafts.push(draft); else p.spriteDrafts[index] = draft;
  }
  async function commit(change: (p: Project) => void) {
    const next = structuredClone(project); change(next); projectSchema.parse(next);
    if (edit(change) === false) throw new Error('当前不能编辑，请先暂停场景播放');
    // Wait for the real disk write; errors remain recoverable in the editor.
    await saveWorkspace(next, true, true);
  }
  async function saveDraft() {
    if (saving || sheet.busy) return;
    setSaving(true); setMessage('正在保存原视频、帧文件和制作记录…');
    try {
      const draft = await storeSpriteDraft(work,draftId,category);
      await commit(p => upsertDraft(p,draft));
      setSavedWork(work); setOpenId(draftId); setMessage('制作草稿已保存到本地磁盘，可关闭后继续编辑');
    } catch(e) {setMessage(`草稿保存失败：${e instanceof Error ? e.message : String(e)}；请保留当前窗口`);}
    finally {setSaving(false);}
  }
  async function openDraft() {
    const draft = project.spriteDrafts.find(d => d.id === openId);
    if (!draft || saving || sheet.busy) return;
    if (dirty && !confirm('当前制作内容尚未保存，是否放弃修改并打开已有草稿？')) return;
    setSaving(true); setMessage('正在读取本地制作文件…');
    try {
      const loaded = await readSpriteDraft(draft);
      const category = project.resourceCategories.some(c=>c.id===draft.categoryId) ? draft.categoryId : '';
      sheet.restore(loaded); setCategory(category); setDraftId(draft.id); setSavedWork({...loaded,category});
      setMessage('已读取本地草稿，帧顺序、去底结果及合成参数已恢复');
    } catch(e) {setMessage(`草稿读取失败：${e instanceof Error ? e.message : String(e)}`);}
    finally {setSaving(false);}
  }
  async function removeDraft() {
    if (!openId || saving || sheet.busy || !confirm('移除这份制作草稿？已保存的自定义资源不受影响；磁盘素材不会立即删除，可从项目备份恢复。')) return;
    setSaving(true);
    try {
      await commit(p => {p.spriteDrafts = p.spriteDrafts.filter(d=>d.id!==openId);});
      if (openId===draftId) {setDraftId(crypto.randomUUID()); setSavedWork(null);}
      setOpenId(''); setMessage('草稿记录已移除；素材仍保留在磁盘，可从项目备份恢复');
    } catch(e) {setMessage(`移除失败：${String(e)}`);}
    finally {setSaving(false);}
  }
  const preview = sheet.playing ? sheet.active[sheet.index % Math.max(1, sheet.active.length)] : sheet.frames.find(f => f.id === sheet.selected) ?? sheet.active[0];
  async function save() {
    if (!sheet.packed || saving || sheet.busy) return;
    if (!project.resourceCategories.some(c => c.id === category)) { setMessage('请先新建或选择保存分类'); return; }
    if (!sheet.name.trim()) { setMessage('请输入资源名称'); return; }
    setSaving(true); setMessage('');
    try {
      const file = new File([sheet.packed.blob], `${sheet.name.trim()}.png`, { type: 'image/png' });
      const { layout } = sheet.packed;
      const asset = mediaSchema.parse({ ...await importMedia(file, 'characters'), name: sheet.name.trim(), customCategoryId: category, fps: sheet.fps, columns: layout.columns, rows: layout.rows,
        frameRects: layout.cells.map(c => ({ x: c.x, y: c.y, width: layout.cellWidth, height: layout.cellHeight })) });
      const draft = local ? await storeSpriteDraft(work,draftId,category) : null;
      const next = structuredClone(project); next.assets.push(asset); if (draft) upsertDraft(next,draft);
      projectSchema.parse(next);
      if (JSON.stringify(next.assets).length > 100_000_000) throw new Error('项目资源总量不可超过 100MB');
      if (local) {await commit(p => {p.assets.push(asset); if(draft) upsertDraft(p,draft);}); setSavedWork(work); setOpenId(draftId);}
      else edit(p => p.assets.push(asset));
      saved(asset); setMessage(local ? '已保存到自定义分类；原视频、制作草稿与成品均已落盘' : '已保存到自定义分类，可关闭窗口后应用到场景');
    } catch (e) { setMessage(`保存失败：${e instanceof Error ? e.message : String(e)}`); }
    finally { setSaving(false); }
  }
  return <ResourceDialog title="序列帧制作" close={() => { if (saving || sheet.busy) return; if ((dirty || (local && workspaceState().dirty)) && !confirm(local ? '当前有未保存内容，关闭将丢弃未保存的制作修改。请先保存制作草稿，是否仍要关闭？' : '关闭制作窗口？已保存的资源会保留，当前抽帧工作草稿将丢弃。')) return; close(); }}><div className="sprite-editor">
    <div className="sprite-controls" onDragOver={e => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); }} onDrop={e => { if (e.dataTransfer.files.length) { e.preventDefault(); if (!sheet.busy && !saving) { const f = e.dataTransfer.files[0]; chooseVideo(f); } } }}><fieldset disabled={sheet.busy || saving}>
      {local ? <><h3>本地制作草稿</h3><small>视频、帧文件、成品写入工作目录，不上传云端。修改后请保存草稿。</small>
        <label>已有制作草稿<select value={openId} onChange={e=>setOpenId(e.target.value)}><option value="">请选择草稿</option>{project.spriteDrafts.map(d=><option key={d.id} value={d.id}>{d.name} · {d.frames.length} 帧 · {new Date(d.updatedAt).toLocaleString()}</option>)}</select></label>
        <button disabled={!openId} onClick={openDraft}>打开制作草稿</button><button disabled={!openId} onClick={removeDraft}>移除制作草稿</button>
        <button disabled={!sheet.video} onClick={saveDraft}>保存制作草稿到磁盘</button><small>{dirty ? '制作内容有未保存修改' : savedWork ? '当前制作内容已保存' : '选择本地视频开始制作'}</small>
      </> : <small>当前为在线演示，仅成品保存在浏览器。原视频和制作草稿的磁盘保存请使用 npm run work。</small>}
      <label>序列帧名称<input value={sheet.name} onChange={e => sheet.setName(e.target.value)}/></label>
      <label>{local ? '选择本地视频' : '上传视频'}<input type="file" accept="video/*,.mp4,.webm,.mov,.m4v,.mkv" onChange={e => { const f = e.target.files?.[0]; if (f) chooseVideo(f); e.target.value = ''; }}/></label>
      {sheet.video && <small>当前视频：{sheet.video.name} · {(sheet.video.size/1024/1024).toFixed(2)} MB</small>}
      <small>可拖入视频；浏览器本地处理，视频最多 80MB，格式支持取决于浏览器解码器。</small>
      <label>抽帧方式<select value={sheet.extract.mode} onChange={e => sheet.setExtract({ ...sheet.extract, mode: e.target.value as 'fps' | 'interval' })}><option value="fps">按 FPS</option><option value="interval">按时间间隔</option></select></label>
      {(sheet.extract.mode === 'fps' ? [['fps', '抽帧 FPS', 0.25, 60]] : [['interval', '抽帧间隔（秒）', 0.01, 10]]).concat([['maxFrames', '最大帧数', 1, 120], ['maxDimension', '最长边（0 为原尺寸）', 0, 2048]]).map(([key, title, min, max]) => <label key={key}>{title}<input type="number" min={min} max={max} step="any" value={sheet.extract[key as 'fps']} onChange={e => sheet.setExtract({ ...sheet.extract, [key]: Number(e.target.value) })}/></label>)}
      <button disabled={!sheet.video} onClick={sheet.extractNow}>开始抽帧</button>
      <h3>背景去除</h3><small>沿边缘去除相近底色，适合纯色背景；不是 AI 人像抠图。</small>
      <label>去底阈值<input type="range" min={8} max={120} value={sheet.threshold} onChange={e => sheet.setThreshold(Number(e.target.value))}/></label>
      <label className="check"><input type="checkbox" checked={sheet.crop} onChange={e => sheet.setCrop(e.target.checked)}/>裁去透明边缘（可能影响动作对齐）</label>
      <button disabled={!sheet.selected} onClick={() => sheet.cutout(false)}>选中帧去底</button><button disabled={!sheet.active.length} onClick={() => sheet.cutout(true)}>所有启用帧去底</button>
      <h3>图集合成</h3>
      {([['columns', '列数（0 为自动）', 64], ['padding', '帧内边距', 64], ['spacing', '帧间距', 64], ['cellWidth', '格宽（0 为自动）', 2048], ['cellHeight', '格高（0 为自动）', 2048]] as const).map(([key, title, max]) => <label key={key}>{title}<input type="number" min={0} max={max} value={sheet.pack[key]} onChange={e => sheet.setPack({ ...sheet.pack, [key]: Number(e.target.value) })}/></label>)}
      <label>帧对齐<select value={sheet.pack.pivot} onChange={e => sheet.setPack({ ...sheet.pack, pivot: e.target.value as typeof sheet.pack.pivot })}><option value="bottom">底部居中</option><option value="center">中心</option><option value="top-left">左上角</option></select></label>
      <label>播放 FPS<input type="number" min={0.1} max={60} step={0.1} value={sheet.fps} onChange={e => sheet.setFps(Math.max(0.1, Math.min(60, Number(e.target.value) || 12)))}/></label>
      <button disabled={!sheet.active.length} onClick={sheet.packNow}>合成序列帧</button>
      <button disabled={!sheet.packed} onClick={() => sheet.packed && downloadBlob(sheet.packed.blob, `${spriteDownloadStem(sheet.name)}.png`)}>下载 PNG</button>
      <button disabled={!sheet.packed} onClick={() => sheet.packed && downloadBlob(new Blob([JSON.stringify({ ...sheet.packed.json, image: `${spriteDownloadStem(sheet.name)}.png` }, null, 2)], { type: 'application/json' }), `${spriteDownloadStem(sheet.name)}.json`)}>下载 JSON</button>
      <h3>保存到自定义资源</h3><label>保存分类<select value={category} onChange={e => setCategory(e.target.value)}><option value="">请选择分类</option>{project.resourceCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <CategoryCreator project={project} edit={edit} created={setCategory}/>
      <button disabled={!sheet.packed || !category} onClick={save}>{saving ? '正在保存…' : '保存到自定义分类'}</button>
    </fieldset></div>
    <div className="sprite-workspace"><div className="sprite-previews"><section><h3>动画预览 · {sheet.active.length} / {sheet.frames.length} 帧</h3><div className="sprite-stage">{preview && <img alt="当前序列帧" src={preview.previewUrl}/>}</div><button onClick={() => sheet.setPlaying(!sheet.playing)} disabled={sheet.active.length < 2}>{sheet.playing ? '暂停预览' : '播放预览'}</button></section><section><h3>合成图集</h3><div className="sprite-stage">{sheet.packed ? <img alt="合成序列帧" src={sheet.packed.url}/> : <p>编辑帧后请重新合成</p>}</div>{sheet.packed && <small>{sheet.packed.layout.sheetWidth} × {sheet.packed.layout.sheetHeight} · {sheet.packed.layout.cells.length} 帧</small>}</section></div>
    <p role="status" aria-label="序列帧状态">{message || sheet.status}</p>
    <div><button disabled={sheet.busy || saving} onClick={() => sheet.enableAll(true)}>全部启用</button><button disabled={sheet.busy || saving} onClick={() => sheet.enableAll(false)}>全部禁用</button><small>拖动排序，或使用前移／后移</small></div>
    <div className="sprite-frames">{sheet.frames.map((f, i) => <article key={f.id} className={`${f.enabled ? '' : 'disabled'} ${sheet.selected === f.id ? 'selected' : ''}`} draggable={!sheet.busy && !saving} onDragStart={() => { dragging.current = i; }} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (!sheet.busy && !saving && dragging.current !== null) sheet.reorder(dragging.current, i); dragging.current = null; }}>
      <button onClick={() => { sheet.setSelected(f.id); sheet.setPlaying(false); }}><img src={f.previewUrl} alt={`帧 ${i + 1}`}/></button><label className="check"><input type="checkbox" aria-label={`启用帧 ${i + 1}`} checked={f.enabled} disabled={sheet.busy || saving} onChange={e => sheet.toggle(f.id, e.target.checked)}/>#{i + 1} · {f.time.toFixed(2)}s</label><button disabled={sheet.busy || saving || i === 0} onClick={() => sheet.reorder(i, i - 1)}>前移</button><button disabled={sheet.busy || saving || i === sheet.frames.length - 1} onClick={() => sheet.reorder(i, i + 1)}>后移</button>
    </article>)}</div></div>
  </div></ResourceDialog>;
}
