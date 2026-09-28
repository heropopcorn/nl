import React, { useEffect, useRef, useState } from 'react';
import { BackupPanel } from './BackupPanel';
import { createRoot } from 'react-dom/client';
import { sample, projectSchema, totalFrames, locate, shotSchema, type Project } from '../../../packages/core';
import { LiveEffectClock } from '../../../packages/studios/live-clock';
import { DirectorRenderer } from '../../../packages/studios';
import './style.css';
import './environment.css';
import { CollisionOverlay, EnvironmentList, EnvironmentInspector, SelectionOverlay, WaterOverlapOverlay } from './EnvironmentPanel';
import { BackgroundPanel, ResolutionPicker } from './BackgroundPanel';
import { ResourceLibrary } from './ResourceLibrary';
import { useCanvasTools } from './CanvasTools';
import { ProjectTree, ExtendedInspector } from './ProjectPanels';
import { hasPendingSaves, loadProject, saveProject } from './storage';
import { LegacyImport } from './LegacyImport';
import { backgroundKey, resolveBackground, type BackgroundManifest, type Quality } from '../../../packages/core/backgrounds';
import { overlappingWaterIds } from '../../../packages/core/geometry';

const STORAGE = 'yuanli.web-director.v1';
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function png(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('PNG 输出失败')), 'image/png'));
}
function App() {
  const [collisionDebug, setCollisionDebug] = useState(false);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { if (hasPendingSaves()) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard);
  }, []);
  const [project, setProject] = useState<Project>(() => { try { return projectSchema.parse(JSON.parse(localStorage.getItem(STORAGE) || 'null')); } catch { return structuredClone(sample); } });
  const [hydrated, setHydrated] = useState(false);
  const [frame, setFrame] = useState(0), [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false), [status, setStatus] = useState('正在加载影棚…');
  const [exporting, setExporting] = useState(false), [selected, updateSelected] = useState('');
  const [manifest, setManifest] = useState<BackgroundManifest | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [quality, setQuality] = useState<Quality>('default'), [loading, setLoading] = useState(false);
  const [zoom, setZoom] = useState(1), [pan, setPan] = useState({ x: 0, y: 0 });
  const canvas = useRef<HTMLCanvasElement>(null), renderer = useRef<DirectorRenderer | null>(null);
  const undo = useRef<Project[]>([]), redo = useRef<Project[]>([]);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const { shot, index, local } = locate(project, frame);
  const [activeRegion, selectRegion] = useState<number | null>(null);
  const [showAllRegions, setShowAllRegions] = useState(false);
  function setSelected(id: string) { if (id !== selected) selectRegion(null); updateSelected(id); }
  const liveClock = useRef(new LiveEffectClock());
  useEffect(() => { selectRegion(null); }, [shot.id]);
  const envProps = { shot, selected, activeRegion, selectRegion, select: setSelected, change: (fn: (s: typeof shot) => void) => edit(p => fn(p.shots[index])) };
  const tools = useCanvasTools({ ...envProps, local, pause: () => setPlaying(false), notify: setStatus, locked: playing, playing });
  const displayProject = tools.display ? { ...project, shots: project.shots.map(s => s.id === shot.id ? tools.display! : s) } : project;
  const sceneThumb = (sceneId: string) => {
    const sceneShot = project.shots.find(s => s.sceneId === sceneId && s.studio === 'pixi');
    if (!sceneShot) return '';
    if (sceneShot.blank) return 'blank';
    if (sceneShot.backgroundAssetId) return project.assets.find(a => a.id === sceneShot.backgroundAssetId)?.src ?? '';
    try { return manifest ? resolveBackground(manifest, sceneShot, 'default', project.assets).url : `/art/${sceneShot.background}.png`; } catch { return `/art/${sceneShot.background}.png`; }
  };
  const actor = shot.actors.find(a => a.id === selected);
  function edit(fn: (p: Project) => void) {
    if (playing) { setStatus('播放时编辑锁定，请先暂停'); return; }
    const next = structuredClone(project); fn(next);
    const valid = projectSchema.safeParse(next); if (!valid.success) { setStatus('参数无效：请检查范围边界、层级或名称'); return; }
    undo.current.push(project); if (undo.current.length > 80) undo.current.shift(); redo.current = []; setProject(valid.data);
  }
  function history(back: boolean) {
    const from = back ? undo.current : redo.current, to = back ? redo.current : undo.current;
    const next = from.pop(); if (next) { to.push(project); setProject(next); setPlaying(false); }
  }
  useEffect(() => { loadProject(() => setStatus('已从历史备份恢复项目')).then(p => { if (p) setProject(p); }).catch(e => setStatus(`本机项目读取失败：${String(e)}`)).finally(() => setHydrated(true)); }, []);
  useEffect(() => {
    let disposed = false;
    DirectorRenderer.create().then(r => { if (disposed) r.dispose(); else { renderer.current = r; setManifest(r.manifest); setReady(true); setStatus('影棚已就绪 · 自动保存在本机'); } }).catch(e => setStatus(`影棚加载失败：${e.message}`));
    return () => { disposed = true; renderer.current?.dispose(); };
  }, []);
  useEffect(() => { setFrame(f => Math.min(f, totalFrames(project) - 1)); }, [project]);
  useEffect(() => {
    if (!hydrated) return;
    if (project.shots.some(item => overlappingWaterIds(item.effects).length)) { setStatus('水域区域存在重叠，请调整后保存；可继续编辑'); return; }
    saveProject(project).catch(() => setStatus('本机数据库保存失败，请立即导出项目备份'));
  }, [project, hydrated]);
  useEffect(() => {
    if (!ready || !hydrated || !canvas.current) return;
    let stale = false, raf = 0, last = -Infinity;
    const fail = (error: unknown) => { if (!stale) { setLoading(true); setLoadError('资源或效果加载失败，请检查资源'); setStatus(`渲染失败：${String(error)}`); } };
    const draw = (now: number) => {
      if (stale || !canvas.current) return;
      try {
        if (now - last >= 1000 / 30) {
          const live = liveClock.current.sample(locate(displayProject, frame).shot, now);
          renderer.current!.render(displayProject, frame, canvas.current, quality, live);
          canvas.current.dataset.effectFrame = String(Math.floor(live.environmentFrame));
          last = now;
        }
        raf = requestAnimationFrame(draw);
      } catch (error) { fail(error); }
    };
    const start = () => { if (!stale) { setLoading(false); setLoadError(null); draw(performance.now()); } };
    try {
      if (renderer.current!.isPrepared(displayProject, frame, quality)) start();
      else { setLoading(true); renderer.current!.prepare(displayProject, frame, quality).then(start).catch(fail); }
    } catch (error) { fail(error); }
    return () => { stale = true; cancelAnimationFrame(raf); };
  }, [ready, hydrated, displayProject, frame, quality]);
  useEffect(() => {
    if (manifest && shot.studio === 'pixi' && (shot.backgroundAssetId ? quality !== 'default' && !shot.backgroundVersions[quality] : !manifest[backgroundKey(shot)]?.[quality])) {
      setQuality('default'); setStatus('当前背景没有所选高清版本，已回退默认分辨率');
    }
  }, [manifest, shot.background, shot.season, shot.backgroundAssetId, shot.backgroundVersions, shot.studio, quality]);
  const seek = (value: number) => { setPlaying(false); setFrame(value); };
  function newShot(studio: 'pixi' | 'motion' | 'three') {
    const name = prompt('布景名称', '新镜头'); if (!name?.trim()) return;
    const next = shotSchema.parse({ id: crypto.randomUUID(), name: name.trim(), studio, sceneId: shot.sceneId, frames: 180, caption: '', background: shot.background, actors: [], objects3d: studio === 'three' ? [{ id: crypto.randomUUID(), name: '立方体', shape: 'box' }] : [] });
    edit(p => p.shots.push(next)); seek(totalFrames(project));
  }
  function removeSelected() { if (!selected) return; edit(p => { const s = p.shots[index]; s.actors = s.actors.filter(a => a.id !== selected); s.effects = s.effects.filter(e => e.id !== selected); s.objects3d = s.objects3d.filter(o => o.id !== selected); }); setSelected(''); }
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'F3') { event.preventDefault(); setCollisionDebug(v => !v); return; }
      if (event.target instanceof HTMLElement && (event.target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName))) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); history(!event.shiftKey); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); history(false); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); if (project.shots.some(item => overlappingWaterIds(item.effects).length)) { setStatus('水域区域存在重叠，请调整后保存'); return; } saveProject(project).then(() => setStatus('已保存到本机数据库')).catch(e => setStatus(String(e))); }
      if (event.key === 'F1') { event.preventDefault(); alert('V 移动；Ctrl/Cmd+T 缩放（拖四角）；旋转拖外圈，Shift 吸附 15°；移动时 Shift 吸附 8 像素；WASD 走位不改路线；多边形套索单击放点，双击或 Enter 闭合；顶点工具拖多边形或路线点；中键平移；滚轮缩放；方向键微调；Delete 删除；Ctrl+Z 撤销；Ctrl+Y 或 Ctrl+Shift+Z 重做；Ctrl+S 保存；环境效果无需播放，添加即展示。水域重叠时请调整后保存。'); }
      if (event.key === 'Delete' && !playing && !tools.hasDraft) { if (activeRegion !== null && shot.effects.some(e => e.id === selected)) { edit(p => { p.shots[index].effects.find(e => e.id === selected)!.regions.splice(activeRegion, 1); }); selectRegion(null); } else removeSelected(); }
    }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  });
  return <div className={playing ? "app playing" : "app"}>
    <header><div className="brand">元力 <span>DIRECTOR / 多影棚</span></div><select aria-label="文件菜单" value="" onChange={e => { const action = e.target.value; if (['pixi','motion','three'].includes(action)) newShot(action as 'pixi'|'motion'|'three'); if (action === 'chapter') { const name = prompt('章节名称'); if (name?.trim()) edit(p => p.chapters.push({ id: crypto.randomUUID(), name: name.trim() })); } if (action === 'help') alert('V 移动；Ctrl/Cmd+T 缩放（拖四角）；旋转拖外圈，Shift 吸附 15°；移动时 Shift 吸附 8 像素；WASD 走位不改路线；多边形套索单击放点，双击或 Enter 闭合；顶点工具拖多边形或路线点；中键平移；滚轮缩放；方向键微调；Delete 删除；Ctrl+Z 撤销；Ctrl+Y 或 Ctrl+Shift+Z 重做；Ctrl+S 保存；环境效果无需播放，添加即展示。水域重叠时请调整后保存。雨水密度、八向风和分范围水花在属性里。图片及音频保存在本机，定期导出项目备份。'); }}><option value="">文件</option><option value="pixi">新建 2D 布景</option><option value="motion">新建动效布景</option><option value="three">新建 3D 布景</option><option value="chapter">新建章节</option><option value="help">操作帮助</option></select><select aria-label="编辑菜单" value="" onChange={e => { if(e.target.value === 'delete') removeSelected(); if(e.target.value === 'rename') { const value = prompt('元素名称', actor?.name || shot.effects.find(f => f.id === selected)?.name); if(value?.trim()) edit(p => { const s=p.shots[index], object=[...s.actors,...s.effects,...s.objects3d].find(a=>a.id===selected); if(object) object.name=value.trim(); }); } if(e.target.value === 'undo') history(true); if(e.target.value === 'redo') history(false); }}><option value="">编辑</option><option value="rename">重命名元素</option><option value="delete">删除元素</option><option value="undo">撤销</option><option value="redo">重做</option></select><BackupPanel project={project} disabled={playing || exporting || project.shots.some(s => overlappingWaterIds(s.effects).length > 0)} restore={p => { undo.current.push(project); redo.current = []; setProject(p); seek(0); setSelected(''); }} notify={setStatus}/><LegacyImport project={project} disabled={playing || exporting} edit={edit} notify={setStatus}/><button onClick={() => download(new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }), 'director-project.json')}>导出项目</button><label className="button">打开项目<input type="file" accept=".json" hidden onChange={async e => { const file = e.target.files?.[0]; if (!file) return; try { if (file.size > 150_000_000) throw new Error('文件超过 150MB'); const p = projectSchema.parse(JSON.parse(await file.text())); undo.current.push(project); redo.current = []; setProject(p); seek(0); setStatus('项目已打开'); } catch { setStatus('无法打开：不是有效的导演台 v1 项目'); } e.target.value = ''; }} /></label><button onClick={() => history(true)}>撤销</button><button onClick={() => history(false)}>重做</button><div className="spacer"/><span className="badge">多影棚 · 完整工作流</span><a href="/logout">退出</a></header>
    <aside className="left"><h2>场景元素 <small>{shot.studio === 'pixi' ? '2D 影棚' : shot.studio === 'three' ? '3D 影棚' : '动态图形影棚'}</small></h2><button className={!selected ? 'active row' : 'row'} onClick={() => setSelected('')}>{shot.studio === 'pixi' ? '▧ 背景画布' : shot.studio === 'three' ? '◇ 3D 场景' : '◉ 五行图形'}</button>{shot.actors.map(a => <button className={`row ${selected === a.id ? 'active' : ''}`} key={a.id} onClick={() => setSelected(a.id)}>♙ {a.name}</button>)}{shot.studio === 'three' && shot.objects3d.map(o => <button className={selected === o.id ? 'active row' : 'row'} key={o.id} onClick={() => setSelected(o.id)}>◇ {o.name}</button>)}<EnvironmentList {...envProps} showAllRegions={showAllRegions} setShowAllRegions={setShowAllRegions}/><ResourceLibrary manifest={manifest} project={project} shot={shot} edit={edit} select={setSelected} notify={setStatus}/></aside>
    <main><div className="viewport-bar"><span>{shot.name}</span><div className="spacer"/><button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>适应画布</button><label>视图 <select aria-label="视图" value={zoom} onChange={e => setZoom(Number(e.target.value))}>{[0.5, 1, 1.5, 2].map(z => <option key={z} value={z}>{z * 100}%</option>)}</select></label><ResolutionPicker shot={shot} manifest={manifest} quality={quality} setQuality={setQuality} assets={project.assets}/><span>输出 1280 × 720</span></div>{tools.toolbar}<div className="viewport" onDoubleClick={tools.doubleClick} onPointerDown={e => { tools.down(e, canvas); if (e.button === 1) { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY }; } }} onPointerMove={e => { if (!drag.current) tools.move(e, canvas); if (drag.current) { const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y; setPan(p => ({ x: p.x + dx, y: p.y + dy })); drag.current = { x: e.clientX, y: e.clientY }; } }} onPointerUp={e => { tools.up(e); drag.current = null; }} onPointerCancel={e => { tools.up(e); drag.current = null; }} onWheel={e => { const rect = e.currentTarget.getBoundingClientRect(), x = e.clientX - rect.left - rect.width / 2, y = e.clientY - rect.top - rect.height / 2; const next = Math.max(0.25, Math.min(4, zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1))); setPan(p => ({ x: x - (x - p.x) * next / zoom, y: y - (y - p.y) * next / zoom })); setZoom(next); }}><div className="canvas-stack" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}><canvas aria-busy={loading} aria-label="影棚预览" ref={canvas} width={1280} height={720}/><SelectionOverlay shot={tools.display ?? shot} selected={selected} activeRegion={activeRegion} showAllRegions={showAllRegions} interactive={!playing && tools.tool === "move" && !tools.hasDraft} select={(id, region) => { setSelected(id); selectRegion(region); }}/><WaterOverlapOverlay shot={tools.display ?? shot}/>{collisionDebug && <CollisionOverlay shot={tools.display ?? shot} frame={local}/>}{!playing && tools.overlay}{!selected && shot.studio === "pixi" && <svg className="selection-overlay" viewBox="0 0 1280 720"><text className="origin-label" x="105" y="712">原点 (0, 0) · Y ↑</text></svg>}</div>{loading && <div className="loading-canvas">{loadError || "正在加载背景；导出将在画面就绪后启用"}</div>}</div><div className="transport"><span className="live-badge">● 环境效果实时展示</span><small>无需播放 · 中键拖动画布 · 环境元素可随时编辑</small></div></main>
    <aside className="right"><h2>属性</h2><label>布景名称<input value={shot.name} onChange={e => edit(p => { p.shots[index].name = e.target.value; })}/></label>{actor && <><h2>角色路线</h2><label>角色层级<input type="number" min="-100" max="100" value={actor.layer} onChange={e => edit(p => { p.shots[index].actors.find(a => a.id === actor.id)!.layer = Number(e.target.value); })}/></label><label>元素名称<input value={actor.name} onChange={e => edit(p => { p.shots[index].actors.find(a => a.id === actor.id)!.name = e.target.value; })}/></label>{(['start', 'end'] as const).map(key => <fieldset key={key}><legend>{key === 'start' ? '起点' : '终点'}</legend>{(['x', 'y'] as const).map(axis => <label key={axis}>{axis.toUpperCase()}<input type="number" value={actor[key][axis]} onChange={e => edit(p => { p.shots[index].actors.find(a => a.id === actor.id)![key][axis] = Number(e.target.value); })}/></label>)}</fieldset>)}<small>逻辑坐标 1536 × 1024，左下角为 (0, 0)。角色编辑位置保持不变，环境效果独立运行。</small></>}<EnvironmentInspector {...envProps} draw={tools.startRegion} vertices={i => { selectRegion(i); tools.choose('vertices'); }}/><BackgroundPanel shot={shot} manifest={manifest} change={envProps.change} assets={project.assets}/><ExtendedInspector project={project} shot={shot} edit={edit} selected={selected}/><h2>输出</h2><button disabled={!ready || loading || exporting} onClick={async () => { try { download(await png(canvas.current!), `frame-${frame}.png`); } catch (e) { setStatus(String(e)); } }}>保存当前帧 PNG</button><p className="muted">当前先专注场景编辑和环境实时效果，视频编排与时间轴暂不开放。已有项目数据保留。</p></aside>
    <section className="scene-browser"><ProjectTree project={project} shot={shot} edit={edit} seek={seek} thumb={sceneThumb}/><div className="tracks"><div className="track-heading"><b>场景布景</b><span>点击切换 · 环境效果自动展示</span><button onClick={() => edit(p => { const copy = structuredClone(shot); copy.id = crypto.randomUUID(); copy.name += ' 副本'; p.shots.splice(index + 1, 0, copy); })}>复制布景</button><button disabled={project.shots.length === 1} onClick={() => { edit(p => { p.shots.splice(index, 1); }); seek(0); }}>删除布景</button></div><div className="scene-cards">{project.shots.map((s, i) => <button key={s.id} className={`clip ${s.studio} ${i === index ? 'chosen' : ''}`} onClick={() => { seek(project.shots.slice(0, i).reduce((n, s) => n + s.frames, 0)); setSelected(''); }}><b>{s.name}</b><small>{s.studio === 'pixi' ? '2D 场景' : s.studio === 'three' ? '3D 场景' : '动态图形'}</small></button>)}</div></div></section><footer role="status">{status}</footer>
  </div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
