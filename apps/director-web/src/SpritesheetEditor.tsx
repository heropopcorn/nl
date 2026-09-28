import { useRef, useState } from 'react';
import { ResourceDialog } from './ResourceDialog';
import { CategoryCreator } from './CategoryCreator';
import { useSpritesheet } from './useSpritesheet';
import { importMedia } from './storage';
import { projectSchema, type Project } from '../../../packages/core';
import { mediaSchema, type MediaAsset } from '../../../packages/core/media';
import { downloadBlob } from '../../../packages/spritesheet/images';
import { spriteDownloadStem } from '../../../packages/spritesheet/spriteFrames';
import './spritesheet.css';

export function SpritesheetEditor({ project, edit, close, saved, initialCategory }: { project: Project; edit: (fn: (p: Project) => void) => void; close: () => void; saved: (asset: MediaAsset) => void; initialCategory: string }) {
  const sheet = useSpritesheet(), dragging = useRef<number | null>(null);
  const [category, setCategory] = useState(initialCategory), [saving, setSaving] = useState(false), [message, setMessage] = useState('');
  const preview = sheet.playing ? sheet.active[sheet.index % Math.max(1, sheet.active.length)] : sheet.frames.find(f => f.id === sheet.selected) ?? sheet.active[0];
  async function save() {
    if (!sheet.packed) return;
    if (!project.resourceCategories.some(c => c.id === category)) { setMessage('请先新建或选择保存分类'); return; }
    if (!sheet.name.trim()) { setMessage('请输入资源名称'); return; }
    setSaving(true); setMessage('');
    try {
      const file = new File([sheet.packed.blob], `${sheet.name.trim()}.png`, { type: 'image/png' });
      const { layout } = sheet.packed;
      const asset = mediaSchema.parse({ ...await importMedia(file, 'characters'), name: sheet.name.trim(), customCategoryId: category, fps: sheet.fps, columns: layout.columns, rows: layout.rows,
        frameRects: layout.cells.map(c => ({ x: c.x, y: c.y, width: layout.cellWidth, height: layout.cellHeight })) });
      const next = { ...project, assets: [...project.assets, asset] };
      projectSchema.parse(next);
      if (JSON.stringify(next.assets).length > 100_000_000) throw new Error('项目资源总量不可超过 100MB');
      edit(p => p.assets.push(asset)); saved(asset); setMessage('已保存到自定义分类，可关闭窗口后应用到场景');
    } catch (e) { setMessage(`保存失败：${e instanceof Error ? e.message : String(e)}`); }
    finally { setSaving(false); }
  }
  return <ResourceDialog title="序列帧制作" close={() => { if (saving) return; if (sheet.frames.length && !confirm('关闭制作窗口？已保存的资源会保留，当前抽帧工作草稿将丢弃。')) return; close(); }}><div className="sprite-editor">
    <div className="sprite-controls" onDragOver={e => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); }} onDrop={e => { if (e.dataTransfer.files.length) { e.preventDefault(); if (!sheet.busy && !saving) { const f = e.dataTransfer.files[0]; sheet.chooseVideo(f); } } }}><fieldset disabled={sheet.busy || saving}>
      <label>序列帧名称<input value={sheet.name} onChange={e => sheet.setName(e.target.value)}/></label>
      <label>上传视频<input type="file" accept="video/*,.mp4,.webm,.mov,.m4v" onChange={e => { const f = e.target.files?.[0]; if (f) sheet.chooseVideo(f); e.target.value = ''; }}/></label>
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
