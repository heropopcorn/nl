import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { zipSync, strToU8 } from 'fflate';
import { sample, projectSchema, totalFrames, locate, shotSchema, type Project } from '../../../packages/core';
import { DirectorRenderer } from '../../../packages/studios';
import './style.css';
import './environment.css';
import { EnvironmentList, EnvironmentInspector, SelectionOverlay } from './EnvironmentPanel';
import { BackgroundPanel, ResolutionPicker } from './BackgroundPanel';
import { ResourceLibrary } from './ResourceLibrary';
import { useCanvasTools } from './CanvasTools';
import { ProjectTree, ExtendedInspector, AudioPanel, useAudio } from './ProjectPanels';
import { loadProject, saveProject } from './storage';
import { LegacyImport } from './LegacyImport';
import { exportVideo } from './videoExport';
import { useRegionDrawing } from './DrawingTools';
import { backgroundKey, resolveBackground, type BackgroundManifest, type Quality } from '../../../packages/core/backgrounds';

const STORAGE = 'yuanli.web-director.v1';
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function png(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('PNG 输出失败')), 'image/png'));
}
function App() {
  const [project, setProject] = useState<Project>(() => { try { return projectSchema.parse(JSON.parse(localStorage.getItem(STORAGE) || 'null')); } catch { return structuredClone(sample); } });
  const [hydrated, setHydrated] = useState(false), [loop, setLoop] = useState(false);
  const [videoRange, setVideoRange] = useState<'all' | 'shot'>('all'), videoAbort = useRef<AbortController | null>(null);
  const [frame, setFrame] = useState(0), [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false), [status, setStatus] = useState('正在加载影棚…');
  const [exporting, setExporting] = useState(false), [selected, setSelected] = useState('');
  const [manifest, setManifest] = useState<BackgroundManifest | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [quality, setQuality] = useState<Quality>('default'), [loading, setLoading] = useState(false);
  const [zoom, setZoom] = useState(1), [pan, setPan] = useState({ x: 0, y: 0 });
  const canvas = useRef<HTMLCanvasElement>(null), renderer = useRef<DirectorRenderer | null>(null);
  const undo = useRef<Project[]>([]), redo = useRef<Project[]>([]), cancelled = useRef(false);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const { shot, index, local } = locate(project, frame);
  const envProps = { shot, selected, select: setSelected, change: (fn: (s: typeof shot) => void) => edit(p => fn(p.shots[index])) };
  const drawing = useRegionDrawing({ ...envProps, notify: setStatus, pause: () => setPlaying(false) });
  const tools = useCanvasTools({ ...envProps, local, pause: () => setPlaying(false), notify: setStatus, locked: playing || !!drawing.draft });
  const displayProject = tools.preview ? { ...project, shots: project.shots.map(s => s.id === shot.id ? tools.preview! : s) } : project;
  useAudio(project, frame, playing);
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
  useEffect(() => { loadProject().then(p => { if (p) setProject(p); }).catch(e => setStatus(`本机项目读取失败：${String(e)}`)).finally(() => setHydrated(true)); }, []);
  useEffect(() => {
    let disposed = false;
    DirectorRenderer.create().then(r => { if (disposed) r.dispose(); else { renderer.current = r; setManifest(r.manifest); setReady(true); setStatus('影棚已就绪 · 自动保存在本机'); } }).catch(e => setStatus(`影棚加载失败：${e.message}`));
    return () => { disposed = true; renderer.current?.dispose(); };
  }, []);
  useEffect(() => { if (hydrated) saveProject(project).catch(() => setStatus('本机数据库保存失败，请立即导出项目备份')); setFrame(f => Math.min(f, totalFrames(project) - 1)); }, [project, hydrated]);
  useEffect(() => {
    if (!ready || !hydrated || !canvas.current) return;
    let stale = false;
    const render = () => { if (!stale && canvas.current) { renderer.current!.render(displayProject, frame, canvas.current, quality); setLoading(false); setLoadError(null); if (loadError) setStatus('背景已恢复 · 自动保存在本机'); } };
    try {
      if (renderer.current!.isPrepared(displayProject, frame, quality)) render();
      else {
        setLoading(true); setLoadError(null);
        renderer.current!.prepare(displayProject, frame, quality).then(render).catch(error => { if (!stale) { setLoading(true); setLoadError('背景加载失败，请切换时节或分辨率重试'); setPlaying(false); setStatus(`背景加载失败：${String(error)}；请切换时节或分辨率重试`); } });
      }
    } catch (error) { setLoading(true); setLoadError('渲染失败，请切换背景重试'); setPlaying(false); setStatus(`渲染失败：${String(error)}`); }
    return () => { stale = true; };
  }, [ready, hydrated, displayProject, frame, quality]);
  useEffect(() => {
    if (manifest && shot.studio === 'pixi' && (shot.backgroundAssetId ? quality !== 'default' && !shot.backgroundVersions[quality] : !manifest[backgroundKey(shot)]?.[quality])) {
      setQuality('default'); setStatus('当前背景没有所选高清版本，已回退默认分辨率');
    }
  }, [manifest, shot.background, shot.season, shot.backgroundAssetId, shot.backgroundVersions, shot.studio, quality]);
  useEffect(() => {
    if (!playing) return;
    const start = performance.now(), first = frame; let id: number;
    const tick = (now: number) => { const next = first + Math.floor((now - start) * project.fps / 1000); setFrame(loop ? next % totalFrames(project) : Math.min(next, totalFrames(project) - 1)); if (!loop && next >= totalFrames(project) - 1) setPlaying(false); else id = requestAnimationFrame(tick); };
    id = requestAnimationFrame(tick); return () => cancelAnimationFrame(id);
  }, [playing, project, loop]);
  const seek = (value: number) => { setPlaying(false); setFrame(value); };
  async function exportSequence() {
    setPlaying(false); setExporting(true); cancelled.current = false;
    const exportQuality = quality;
    const snapshot = structuredClone(project), start = frame, end = Math.min(start + 30, totalFrames(snapshot));
    const output = Object.assign(document.createElement('canvas'), { width: 1280, height: 720 });
    let isolated: DirectorRenderer | undefined;
    try {
      isolated = await DirectorRenderer.create();
      const files: Record<string, Uint8Array> = {};
      for (let f = start; f < end; f++) {
        if (cancelled.current) { setStatus('已取消序列输出'); return; }
        await isolated.prepare(snapshot, f, exportQuality);
        if (cancelled.current) { setStatus('已取消序列输出'); return; }
        isolated.render(snapshot, f, output, exportQuality);
        files[`frame-${String(f).padStart(6, '0')}.png`] = new Uint8Array(await (await png(output)).arrayBuffer());
        setStatus(`输出帧 ${f - start + 1} / ${end - start}`);
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      files['manifest.json'] = strToU8(JSON.stringify({ fps: snapshot.fps, width: 1280, height: 720, startFrame: start, endFrameExclusive: end, project: snapshot, backgroundQuality: exportQuality, backgrounds: snapshot.shots.filter(s => s.studio === 'pixi').map(s => ({ shotId: s.id, ...resolveBackground(isolated!.manifest, s, exportQuality, snapshot.assets) })) }, null, 2));
      download(new Blob([zipSync(files, { level: 0 }) as BlobPart]), 'director-frames.zip'); setStatus('PNG 序列已输出（最多 1 秒，非 MP4）');
    } catch (e) { setStatus(`输出失败：${String(e)}`); } finally { isolated?.dispose(); setExporting(false); }
  }
  async function video() {
    setPlaying(false); setExporting(true); const controller = new AbortController(); videoAbort.current = controller;
    const start = videoRange === 'all' ? 0 : project.shots.slice(0, index).reduce((n, s) => n + s.frames, 0);
    try { const blob = await exportVideo(structuredClone(project), quality, start, videoRange === 'all' ? totalFrames(project) : start + shot.frames, setStatus, controller.signal); download(blob, 'director.mp4'); setStatus('视频已导出：H.264 / AAC MP4'); }
    catch (e) { setStatus(controller.signal.aborted ? '视频导出已取消' : `视频导出失败：${String(e)}`); }
    finally { setExporting(false); videoAbort.current = null; }
  }
  function newShot(studio: 'pixi' | 'motion' | 'three') {
    const name = prompt('镜头名称', '新镜头'); if (!name?.trim()) return;
    const next = shotSchema.parse({ id: crypto.randomUUID(), name: name.trim(), studio, sceneId: shot.sceneId, frames: 180, caption: '', background: shot.background, actors: [], objects3d: studio === 'three' ? [{ id: crypto.randomUUID(), name: '立方体', shape: 'box' }] : [] });
    edit(p => p.shots.push(next)); seek(totalFrames(project));
  }
  function removeSelected() { if (!selected) return; edit(p => { const s = p.shots[index]; s.actors = s.actors.filter(a => a.id !== selected); s.effects = s.effects.filter(e => e.id !== selected); s.objects3d = s.objects3d.filter(o => o.id !== selected); }); setSelected(''); }
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && (event.target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName))) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); history(!event.shiftKey); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); saveProject(project).then(() => setStatus('已保存到本机数据库')).catch(e => setStatus(String(e))); }
      if (event.code === 'Space' && !drawing.draft && !loading) { event.preventDefault(); setPlaying(p => !p); }
      if (event.key === 'Delete' && !playing) removeSelected();
    }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  });
  return <div className={playing ? "app playing" : "app"}>
    <header><div className="brand">元力 <span>DIRECTOR / 多影棚</span></div><select aria-label="文件菜单" value="" onChange={e => { const action = e.target.value; if (['pixi','motion','three'].includes(action)) newShot(action as 'pixi'|'motion'|'three'); if (action === 'chapter') { const name = prompt('章节名称'); if (name?.trim()) edit(p => p.chapters.push({ id: crypto.randomUUID(), name: name.trim() })); } if (action === 'help') alert('V 移动；Ctrl/Cmd+T 缩放；旋转时 Shift 吸附 15°；中键平移；滚轮缩放；方向键微调；Delete 删除；Ctrl+Z 撤销；Ctrl+Shift+Z 重做；Ctrl+S 保存；Space 播放/暂停。\n图片及音频保存在本机，定期导出项目备份。'); }}><option value="">文件</option><option value="pixi">新建 2D 镜头</option><option value="motion">新建动效镜头</option><option value="three">新建 3D 镜头</option><option value="chapter">新建章节</option><option value="help">操作帮助</option></select><select aria-label="编辑菜单" value="" onChange={e => { if(e.target.value === 'delete') removeSelected(); if(e.target.value === 'rename') { const value = prompt('元素名称', actor?.name || shot.effects.find(f => f.id === selected)?.name); if(value?.trim()) edit(p => { const s=p.shots[index], object=[...s.actors,...s.effects,...s.objects3d].find(a=>a.id===selected); if(object) object.name=value.trim(); }); } if(e.target.value === 'undo') history(true); if(e.target.value === 'redo') history(false); }}><option value="">编辑</option><option value="rename">重命名元素</option><option value="delete">删除元素</option><option value="undo">撤销</option><option value="redo">重做</option></select><LegacyImport edit={edit} notify={setStatus}/><button onClick={() => download(new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }), 'director-project.json')}>导出项目</button><label className="button">打开项目<input type="file" accept=".json" hidden onChange={async e => { const file = e.target.files?.[0]; if (!file) return; try { if (file.size > 150_000_000) throw new Error('文件超过 150MB'); const p = projectSchema.parse(JSON.parse(await file.text())); undo.current.push(project); redo.current = []; setProject(p); seek(0); setStatus('项目已打开'); } catch { setStatus('无法打开：不是有效的导演台 v1 项目'); } e.target.value = ''; }} /></label><button onClick={() => history(true)}>撤销</button><button onClick={() => history(false)}>重做</button><div className="spacer"/><span className="badge">多影棚 · 完整工作流</span><a href="/logout">退出</a></header>
    <aside className="left"><h2>场景元素 <small>{shot.studio === 'pixi' ? '2D 影棚' : shot.studio === 'three' ? '3D 影棚' : '动态图形影棚'}</small></h2><button className={!selected ? 'active row' : 'row'} onClick={() => setSelected('')}>{shot.studio === 'pixi' ? '▧ 背景画布' : shot.studio === 'three' ? '◇ 3D 场景' : '◉ 五行图形'}</button>{shot.actors.map(a => <button className={`row ${selected === a.id ? 'active' : ''}`} key={a.id} onClick={() => setSelected(a.id)}>♙ {a.name}</button>)}{shot.studio === 'three' && shot.objects3d.map(o => <button className={selected === o.id ? 'active row' : 'row'} key={o.id} onClick={() => setSelected(o.id)}>◇ {o.name}</button>)}<EnvironmentList {...envProps}/><div className="resources"><h2>默认资源</h2><small>点击替换当前镜头背景</small>{['protagonist_village', 'village_school'].map((bg, i) => <button disabled={shot.studio !== 'pixi'} className="asset" key={bg} onClick={() => { if (bg === shot.background || window.confirm("当前场景已有背景图，是否替换？现有元素坐标将保留。")) edit(p => { p.shots[index].background = bg as typeof shot.background; p.shots[index].backgroundAssetId = null; }); }}><img src={manifest?.[`${bg}${shot.season === "original" ? "" : `_${shot.season}`}`]?.default.url || `/art/${bg}.png`}/><span>{i ? '村庄学校' : '村庄'}</span></button>)}<p className="muted">已接入四季初 / 中 / 晚背景。高清版本需提供对应图片；可从文件菜单旁导入 Godot v2 场景及其图片。</p></div><ResourceLibrary project={project} shot={shot} edit={edit} select={setSelected} notify={setStatus}/></aside>
    <main><div className="viewport-bar"><span>{shot.name}</span><div className="spacer"/><button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>适应画布</button><label>视图 <select aria-label="视图" value={zoom} onChange={e => setZoom(Number(e.target.value))}>{[0.5, 1, 1.5, 2].map(z => <option key={z} value={z}>{z * 100}%</option>)}</select></label><ResolutionPicker shot={shot} manifest={manifest} quality={quality} setQuality={setQuality} assets={project.assets}/><span>输出 1280 × 720</span></div>{drawing.toolbar}{tools.toolbar}<div className="viewport" onPointerDown={e => { if (drawing.draft) drawing.point(e, canvas); else tools.down(e, canvas); if (e.button === 1) { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY }; } }} onPointerMove={e => { if (!drag.current) tools.move(e, canvas); if (drag.current) { const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y; setPan(p => ({ x: p.x + dx, y: p.y + dy })); drag.current = { x: e.clientX, y: e.clientY }; } }} onPointerUp={e => { tools.up(e); drag.current = null; }} onPointerCancel={e => { tools.up(e); drag.current = null; }} onWheel={e => { const rect = e.currentTarget.getBoundingClientRect(), x = e.clientX - rect.left - rect.width / 2, y = e.clientY - rect.top - rect.height / 2; const next = Math.max(0.25, Math.min(4, zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1))); setPan(p => ({ x: x - (x - p.x) * next / zoom, y: y - (y - p.y) * next / zoom })); setZoom(next); }}><div className="canvas-stack" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}><canvas aria-busy={loading} aria-label="影棚预览" ref={canvas} width={1280} height={720}/><SelectionOverlay shot={tools.preview ?? shot} selected={selected}/>{drawing.overlay}{!playing && tools.overlay}{!selected && shot.studio === "pixi" && <svg className="selection-overlay" viewBox="0 0 1280 720"><text className="origin-label" x="105" y="712">原点 (0, 0) · Y ↑</text></svg>}</div>{loading && <div className="loading-canvas">{loadError || "正在加载背景；导出将在画面就绪后启用"}</div>}</div><div className="transport"><button disabled={!ready || loading || !!drawing.draft} onClick={() => { if (frame === totalFrames(project) - 1) setFrame(0); setPlaying(!playing); }}>{playing ? '暂停' : '播放'}</button><button onClick={() => seek(0)}>停止</button><label className="check"><input type="checkbox" checked={loop} onChange={e => setLoop(e.target.checked)}/>循环</label><button onClick={() => seek(Math.max(0, frame - 1))}>上一帧</button><button onClick={() => seek(Math.min(totalFrames(project) - 1, frame + 1))}>下一帧</button><code>{(frame / 30).toFixed(2)}s / {(totalFrames(project) / 30).toFixed(2)}s · F{frame}</code><div className="spacer"/><small>中键拖动画布 · 不改场景坐标</small></div></main>
    <aside className="right"><h2>属性</h2><label>镜头名称<input value={shot.name} onChange={e => edit(p => { p.shots[index].name = e.target.value; })}/></label><label>时长（帧 / 30fps）<input type="number" min={1} max={18000} value={shot.frames} onChange={e => edit(p => { p.shots[index].frames = Number(e.target.value); })}/></label><label>字幕<textarea value={shot.caption} onChange={e => edit(p => { p.shots[index].caption = e.target.value; })}/></label>{actor && <><h2>角色路线</h2><label>角色层级<input type="number" min="-100" max="100" value={actor.layer} onChange={e => edit(p => { p.shots[index].actors.find(a => a.id === actor.id)!.layer = Number(e.target.value); })}/></label><label>元素名称<input value={actor.name} onChange={e => edit(p => { p.shots[index].actors.find(a => a.id === actor.id)!.name = e.target.value; })}/></label>{(['start', 'end'] as const).map(key => <fieldset key={key}><legend>{key === 'start' ? '起点' : '终点'}</legend>{(['x', 'y'] as const).map(axis => <label key={axis}>{axis.toUpperCase()}<input type="number" value={actor[key][axis]} onChange={e => edit(p => { p.shots[index].actors.find(a => a.id === actor.id)![key][axis] = Number(e.target.value); })}/></label>)}</fieldset>)}<small>逻辑坐标 1536 × 1024，左下角为 (0, 0)。路线按镜头时长线性播放。</small></>}<BackgroundPanel shot={shot} manifest={manifest} change={envProps.change} assets={project.assets}/><EnvironmentInspector {...envProps} draw={drawing.start}/><ExtendedInspector project={project} shot={shot} edit={edit} selected={selected}/><AudioPanel project={project} edit={edit}/><h2>输出</h2><button disabled={!ready || loading || exporting} onClick={async () => { try { download(await png(canvas.current!), `frame-${frame}.png`); } catch (e) { setStatus(String(e)); } }}>保存当前帧 PNG</button><label>视频导出范围<select value={videoRange} onChange={e => setVideoRange(e.target.value as typeof videoRange)}><option value="all">全片</option><option value="shot">当前镜头</option></select></label><button disabled={!ready || loading || exporting} onClick={video}>导出 MP4 视频（含音轨）</button><button disabled={!ready || loading || exporting} onClick={exportSequence}>输出从当前帧起 1 秒序列</button>{exporting && <button onClick={() => { cancelled.current = true; videoAbort.current?.abort(); }}>取消输出</button>}<p className="muted">MP4 使用本机 FFmpeg；逐帧编码，含音轨和字幕。3D 影棚支持几何体与相机。</p></aside>
    <section className="timeline"><ProjectTree project={project} shot={shot} edit={edit} seek={seek}/><div className="tracks"><div className="track-heading"><b>主时间轴</b><span>{shot.studio.toUpperCase()} · 局部帧 {local}</span><button onClick={() => edit(p => { const copy = structuredClone(shot); copy.id = crypto.randomUUID(); copy.name += ' 副本'; p.shots.splice(index + 1, 0, copy); })}>复制镜头</button><button disabled={project.shots.length === 1} onClick={() => { edit(p => { p.shots.splice(index, 1); }); seek(0); }}>删除镜头</button></div><div className="clips">{project.shots.map((s, i) => <button key={s.id} style={{ flex: s.frames }} className={`clip ${s.studio} ${i === index ? 'chosen' : ''}`} onClick={() => { seek(project.shots.slice(0, i).reduce((n, s) => n + s.frames, 0)); setSelected(''); }}><b>{s.name}</b><small>{s.studio === 'pixi' ? '2D · PixiJS' : s.studio === 'three' ? '3D · PlayCanvas' : '动效 · Canvas'} / {(s.frames / 30).toFixed(1)}s</small></button>)}</div><input aria-label="时间轴" type="range" min={0} max={totalFrames(project) - 1} value={frame} onChange={e => seek(Number(e.target.value))}/></div></section><footer role="status">{status}</footer>
  </div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
