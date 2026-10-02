import { needsLivePreview } from '../../../packages/studios/live-policy';
import { usePageVisibility } from './usePageVisibility';
import { NameField } from './NameField';
import { NumberField } from './NumberField';
import { initializeRuntime, isLocalWork, runtimeLabel } from './runtime';
import { externalizeProject, portableProject, workspaceDirectory, markWorkspaceDirty, saveWorkspace } from './workspace-storage';
import { WorkspacePanel } from './WorkspacePanel';
import { ResourceReview } from './ResourceReview';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BackupPanel } from './BackupPanel';
import { createRoot } from 'react-dom/client';
import { sample, projectSchema, locate, shotSchema, effectSchema, type Effect, type Project } from '../../../packages/core';
import { LiveEffectClock } from '../../../packages/studios/live-clock';
import { DirectorRenderer } from '../../../packages/studios';
import './style.css';
import './environment.css';
import { CollisionOverlay, EnvironmentList, EnvironmentInspector, SelectionOverlay, WaterOverlapOverlay, effectNames } from './EnvironmentPanel';
import { BackgroundPanel, ResolutionPicker } from './BackgroundPanel';
import { ResourceLibrary } from './ResourceLibrary';
import { useCanvasTools } from './CanvasTools';
import { ProjectTree, ExtendedInspector } from './ProjectPanels';
import { hasPendingSaves, loadProject, markProjectDirty, saveProject } from './storage';
import { LegacyImport } from './LegacyImport';
import { backgroundKey, resolveBackground, type BackgroundManifest, type Quality } from '../../../packages/core/backgrounds';
import { clientToLogical, overlappingWaterIds, regionPoints, type Point } from '../../../packages/core/geometry';
import { imageLocal } from '../../../packages/core/handles';
import { actorPosition } from '../../../packages/core/routes';
import { hitRegions, getRegion, deleteRegion, type RegionHit, type RegionEffectType } from './region-actions';
import { CanvasContextMenu, type RegionAction, type RegionShape } from './CanvasContextMenu';
import { HeaderMenu, MobileDrawer, WorkspaceNavigation, useCompactLayout, type WorkspacePane } from './ResponsiveLayout';
import { useCanvasNavigation, type CanvasTapTarget } from './useCanvasNavigation';
import './responsive.css';
import { useProjectDocument } from './useProjectDocument';
import { SaveIndicator } from './SaveIndicator';

const STORAGE = 'yuanli.web-director.v1';
type RegionMenu = { shotId: string; anchor: Point; hits: RegionHit[]; target: string };
type PendingRegionAction = { shotId: string; id: string; hit?: RegionHit; action: Exclude<RegionAction, 'delete'> | 'create'; draft?: Effect; shape?: RegionShape };
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function png(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('PNG 输出失败')), 'image/png'));
}
function App() {
  const compact = useCompactLayout(), pageVisible = usePageVisibility();
  const [rendererRevision, retryRenderer] = useState(0), [renderRevision, retryRender] = useState(0);
  const [pane, setPane] = useState<WorkspacePane>('canvas');
  const [regionMenu, setRegionMenu] = useState<RegionMenu | null>(null);
  const [pendingRegionAction, setPendingRegionAction] = useState<PendingRegionAction | null>(null);
  const drawingDraft = useRef(false);
  const mobileHelp = '手机操作：画布始终保留，元素和资源从左侧抽屉打开，属性从右侧打开，章节与场景从底部打开。点收起或遮罩返回画布，选择元素、切换场景或启动绘制后自动收起。2D画布长按约半秒，或点新建区域，可新建水流、雾气、雨雪等范围；移动工具下首次轻点只选中，再次轻点同一已选区域或长按才弹出编辑、重绘、删除菜单，无需快速双击。重叠区域在菜单中切换，误删可用顶部菜单的撤销恢复。选择套索后沿边界逐点点击，再点闭合范围；矩形则按住拖动。取消绘制不会创建空元素。单指使用当前工具，双指缩放和平移画布；平移画布按钮支持单指移动视图，适应画布复位。图片缩放请拖四角，旋转请拖选框外圈。路线或水流导线逐点点击后按完成线段。文件、编辑、备份和导入导出在菜单中；请定期导出备份。';
  useEffect(() => { if (!compact) setPane('canvas'); }, [compact]);
  useEffect(() => {
    if (!compact || (pane !== 'elements' && pane !== 'resources')) return;
    const section = document.getElementById(`pane-${pane}`);
    section?.scrollIntoView({ block: 'start' });
  }, [compact, pane]);
  const [collisionDebug, setCollisionDebug] = useState(false);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { if (hasPendingSaves() || editGate.current.fileBusy || drawingDraft.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard);
  }, []);
  const [hydrated, setHydrated] = useState(false);
  const [startupError, setStartupError] = useState('');
  const [fileBusy, setFileBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false), [status, setStatus] = useState('正在加载影棚…');
  const [exporting, setExporting] = useState(false), [selected, updateSelected] = useState('');
  const [manifest, setManifest] = useState<BackgroundManifest | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [quality, setQuality] = useState<Quality>('default'), [loading, setLoading] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null), renderer = useRef<DirectorRenderer | null>(null);
  const editGate = useRef({ hydrated, playing, fileBusy }); editGate.current = { hydrated, playing, fileBusy };
  const editor = useProjectDocument(() => { if (isLocalWork()) return structuredClone(sample); try { return projectSchema.parse(JSON.parse(localStorage.getItem(STORAGE) || 'null')); } catch { return structuredClone(sample); } },
    () => !editGate.current.hydrated ? '项目仍在加载，请稍候' : editGate.current.fileBusy ? '文件操作进行中，请稍候' : editGate.current.playing ? '播放时编辑锁定，请先暂停' : null,
    setStatus, () => { markProjectDirty(); if (isLocalWork()) markWorkspaceDirty(editor.current()); });
  const { project, edit, history, canUndo, canRedo, replace: replaceProject } = editor;
  const [activeShotId, setActiveShotId] = useState(project.shots[0].id);
  const waterBlocked = useMemo(() => project.shots.some(item => overlappingWaterIds(item.effects).length > 0), [project]);
  function fileLock(busy: boolean) { editGate.current.fileBusy = busy; setFileBusy(busy); }
  const index = Math.max(0, project.shots.findIndex(s => s.id === activeShotId));
  const shot = project.shots[index], local = 0, frame = project.shots.slice(0, index).reduce((n, s) => n + s.frames, 0);
  const [activeRegion, selectRegion] = useState<number | null>(null);
  const [showAllRegions, setShowAllRegions] = useState(false);
  function setSelected(id: string) { if (id !== selected) selectRegion(null); updateSelected(id); }
  const liveClock = useRef(new LiveEffectClock());
  const liveVisible = pageVisible;
  useEffect(() => { setActiveShotId(shot.id); selectRegion(null); updateSelected(''); }, [shot.id]);
  useEffect(() => { if (selected && ![...shot.actors, ...shot.effects, ...shot.objects3d].some(item => item.id === selected)) { updateSelected(''); selectRegion(null); } }, [selected, shot.actors, shot.effects, shot.objects3d]);
  const envProps = { shot, selected, activeRegion, selectRegion, select: setSelected, change: (fn: (s: typeof shot) => void) => edit(p => { const target = p.shots.find(s => s.id === shot.id); if (!target) throw new Error('当前布景已删除，请重新选择'); fn(target); }) };
  const tools = useCanvasTools({ ...envProps, local, pause: () => setPlaying(false), notify: setStatus, locked: playing || !hydrated || fileBusy || exporting, playing });
  drawingDraft.current = tools.hasDraft || tools.creating;
  const contextEnabled = shot.studio === 'pixi' && ready && hydrated && !loading && !playing && !fileBusy && !exporting && (!compact || pane === 'canvas');
  const navigation = useCanvasNavigation(tools, canvas, {
    contextEnabled: contextEnabled && !regionMenu, tapContextEnabled: tools.tool === 'move' && !tools.hasDraft && !tools.creating,
    scopeKey: `${shot.id}:${pane}:${tools.tool}`, onContextMenu: openRegionMenu,
    getTapTarget: (point, preferredKey) => {
      const target = resolveRegionTarget(point, true, preferredKey)?.target;
      return target ? { key: regionTapKey(target), selected: selected === target.effectId && activeRegion === target.index } : null;
    },
  });
  const { zoom, pan } = navigation;
  function showCanvas() { setPane('canvas'); }
  function showLeftSection(section: 'elements' | 'resources') {
    setPane(section);
    document.getElementById(`pane-${section}`)?.scrollIntoView({ block: 'start' });
  }
  useEffect(() => {
    const content = document.querySelector('#pane-inspector > .mobile-drawer-content');
    if (content) content.scrollTop = 0;
  }, [shot.id, selected]);
  function selectFromList(id: string) { setSelected(id); showCanvas(); }
  function regionTapKey(hit: RegionHit) { return JSON.stringify([shot.id, hit.effectId, hit.index, hit.signature]); }
  function resolveRegionTarget(anchor: Point, tap: boolean, preferredKey?: string) {
    if (!contextEnabled || document.querySelector('dialog[open]') || !canvas.current) return;
    const rect = canvas.current.getBoundingClientRect(), point = clientToLogical(anchor, rect);
    if (!point) return;
    const current = editor.current().shots.find(s => s.id === shot.id);
    if (!current) return;
    // A tap on a picture still selects the picture; long-press/right-click can
    // reach environmental regions underneath it via the overlap chooser.
    const shown = tools.display ?? current;
    if (tap && shown.actors.some(actor => {
      if (!actor.enabled) return false;
      const p = imageLocal(actor, actorPosition(actor, shown, local), point);
      return Math.abs(p.x) <= actor.width / 2 && p.y >= 0 && p.y <= actor.height;
    })) return;
    const scale = Math.min(rect.width / 1280, rect.height / 720);
    const hits = hitRegions(current, point, 6 * 1024 / 720 / Math.max(scale, 0.001));
    // Preserve an explicit overlap choice. A captured pointer-down identity may
    // not silently turn into a different region if geometry changed mid-touch.
    const target = preferredKey ? hits.find(hit => regionTapKey(hit) === preferredKey)
      : hits.find(hit => hit.effectId === selected && hit.index === activeRegion) ?? hits[0];
    if (preferredKey && !target) return;
    return { hits, target };
  }
  function openRegionMenu(anchor: Point, source: 'context' | 'tap' | 'select', tapTarget?: CanvasTapTarget) {
    const resolved = resolveRegionTarget(anchor, source !== 'context', tapTarget?.key);
    if (!resolved || (source !== 'context' && !resolved.target)) return;
    const { hits, target } = resolved;
    if (source === 'select' && target) {
      tools.prepareRegionSelection(target.effectId, target.index); setSelected(target.effectId); selectRegion(target.index);
      setStatus(`已选中${target.name}的区域 ${target.index + 1}；再次轻点或长按可编辑、删除`);
      return;
    }
    if (source === 'tap' && target) { setSelected(target.effectId); selectRegion(target.index); }
    setRegionMenu({ shotId: shot.id, anchor, hits, target: target ? `${target.effectId}:${target.index}` : '' });
  }
  const menuHit = regionMenu?.hits.find(hit => `${hit.effectId}:${hit.index}` === regionMenu.target);
  const menuRegion = regionMenu?.shotId === shot.id && menuHit ? getRegion(shot, menuHit) : null;
  const abandonDraft = () => !(tools.hasDraft || tools.creating) || confirm('当前有未完成的绘制。继续此操作会放弃草稿，是否继续？');
  function createCanvasRegion(type: RegionEffectType, shape: RegionShape) {
    if (!contextEnabled || regionMenu?.shotId !== shot.id || !abandonDraft()) return;
    tools.choose('move'); navigation.setPanMode(false); setSelected(''); showCanvas();
    const draft = effectSchema.parse({ id: crypto.randomUUID(), type, name: `${effectNames[type]} ${shot.effects.filter(e => e.type === type).length + 1}`, regions: [] });
    setPendingRegionAction({ shotId: shot.id, id: '', action: 'create', draft, shape });
  }
  function actOnRegion(action: RegionAction) {
    if (!contextEnabled || !regionMenu || regionMenu.shotId !== shot.id || !menuHit) return;
    const current = editor.current().shots.find(s => s.id === regionMenu.shotId);
    if (!current || !getRegion(current, menuHit)) { setStatus('此范围已改变或被删除，请重新选择'); return; }
    if (!abandonDraft()) return;
    tools.choose('move'); navigation.setPanMode(false); showCanvas();
    if (action === 'delete') {
      if (edit(p => { const current = p.shots.find(s => s.id === regionMenu.shotId); if (!current) throw new Error('布景已改变，请重新选择'); deleteRegion(current, menuHit); })) {
        setSelected(menuHit.effectId); selectRegion(null); setStatus(`已删除${menuHit.name}的区域 ${menuHit.index + 1}，其他范围保留；可撤销`);
      }
    } else {
      setSelected(menuHit.effectId); selectRegion(menuHit.index);
      setPendingRegionAction({ shotId: shot.id, id: menuHit.effectId, hit: menuHit, action });
    }
  }
  useEffect(() => {
    if (!contextEnabled) setRegionMenu(null);
  }, [contextEnabled, shot.id]);
  useEffect(() => { setRegionMenu(null); setPendingRegionAction(null); }, [shot.id]);
  useEffect(() => {
    const next = pendingRegionAction;
    if (!next) return;
    setPendingRegionAction(null);
    if (!contextEnabled || next.shotId !== shot.id || next.id !== selected) return;
    if (next.action === 'create' && next.draft) { tools.beginRegion(next.draft, next.shape); return; }
    if (!next.hit || !getRegion(shot, next.hit)) { setStatus('此范围已改变，请重新选择'); return; }
    selectRegion(next.hit.index);
    if (next.action === 'properties') { setPane('inspector'); requestAnimationFrame(() => document.querySelector('.active-region')?.scrollIntoView({ block: 'center' })); }
    else if (next.action === 'redraw') tools.startRegion(next.hit.index);
    else if (next.action === 'add') tools.startRegion();
    else if (next.action === 'move') tools.moveRegion(next.hit.index);
    else if (next.action !== 'create') tools.choose(next.action);
  }, [pendingRegionAction, selected, shot.id]);
  const displayProject = tools.display ? { ...project, shots: project.shots.map(s => s.id === shot.id ? tools.display! : s) } : project;
  const sceneThumb = (sceneId: string) => {
    const sceneShot = project.shots.find(s => s.sceneId === sceneId && s.studio === 'pixi');
    if (!sceneShot) return '';
    if (sceneShot.blank) return 'blank';
    if (sceneShot.backgroundAssetId) return project.assets.find(a => a.id === sceneShot.backgroundAssetId)?.src ?? '';
    try { return manifest ? resolveBackground(manifest, sceneShot, 'default', project.assets).url : `/art/${sceneShot.background}.png`; } catch { return `/art/${sceneShot.background}.png`; }
  };
  const actor = shot.actors.find(a => a.id === selected);
  useEffect(() => { loadProject(() => setStatus('已从历史备份恢复项目')).then(p => { if (p) { editor.hydrate(p); setActiveShotId(p.shots[0].id); } setHydrated(true); }).catch(e => { setStartupError(String(e)); }); }, []);
  useEffect(() => {
    let disposed = false;
    setReady(false); setLoading(true); setLoadError(null);
    DirectorRenderer.create().then(r => { if (disposed) r.dispose(); else { renderer.current = r; setManifest(r.manifest); setReady(true); setStatus('影棚已就绪 · ' + runtimeLabel()); } }).catch(e => { if (!disposed) { setLoadError('影棚初始化失败，请检查连接后重试'); setStatus(`影棚加载失败：${e.message}`); } });
    return () => { disposed = true; renderer.current?.dispose(); renderer.current = null; };
  }, [rendererRevision]);
  useEffect(() => {
    if (!hydrated || fileBusy) return;
    if (waterBlocked) { setStatus('水域区域存在重叠，请调整后保存；可继续编辑'); return; }
    if (!isLocalWork()) {saveProject(project).catch(e=>setStatus('保存失败：'+String(e)));return;}
    const timer=setTimeout(()=>saveProject(project).catch(e => setStatus('保存失败：' + String(e) + '；请立即导出项目备份')),300);
    return ()=>clearTimeout(timer);
  }, [project, hydrated, fileBusy]);
  useEffect(() => {
    if (!ready || !hydrated || !canvas.current) return;
    let stale = false, raf = 0, last = -Infinity;
    const renderShot = locate(displayProject, frame).shot;
    const animate = liveVisible && needsLivePreview(renderShot, displayProject.assets);
    const fail = (error: unknown) => { if (!stale) { setLoading(true); setLoadError(isLocalWork() ? '资源或效果加载失败，请检查资源' : '资源加载失败；精简预览未包含全部素材，可在本地工作模式打开完整项目'); setStatus(`渲染失败：${String(error)}`); } };
    const draw = (now: number) => {
      if (stale || !canvas.current) return;
      try {
        if (now - last >= 1000 / 30) {
          const live = liveClock.current.sample(renderShot, now);
          renderer.current!.render(displayProject, frame, canvas.current, quality, live);
          canvas.current.dataset.effectFrame = String(Math.floor(live.environmentFrame));
          canvas.current.dataset.renderCount = String(Number(canvas.current.dataset.renderCount || 0) + 1);
          last = now;
        }
        if (animate) raf = requestAnimationFrame(draw);
      } catch (error) { fail(error); }
    };
    const start = () => { if (!stale) { setLoading(false); setLoadError(null); draw(performance.now()); } };
    try {
      if (renderer.current!.isPrepared(displayProject, frame, quality)) start();
      else { setLoading(true); renderer.current!.prepare(displayProject, frame, quality).then(start).catch(fail); }
    } catch (error) { fail(error); }
    return () => { stale = true; cancelAnimationFrame(raf); };
  }, [ready, hydrated, displayProject, frame, quality, liveVisible, renderRevision]);
  useEffect(() => {
    if (manifest && shot.studio === 'pixi' && (shot.backgroundAssetId ? quality !== 'default' && !shot.backgroundVersions[quality] : !manifest[backgroundKey(shot)]?.[quality])) {
      setQuality('default'); setStatus('当前背景没有所选高清版本，已回退默认分辨率');
    }
  }, [manifest, shot.background, shot.season, shot.backgroundAssetId, shot.backgroundVersions, shot.studio, quality]);
  const seek = (value: number) => { setPlaying(false); setActiveShotId(locate(editor.current(), value).shot.id); setSelected(''); showCanvas(); };
  async function saveNow() {
    if (!hydrated || editGate.current.fileBusy) return;
    if (editor.current().shots.some(s => overlappingWaterIds(s.effects).length)) { setStatus('水域区域存在重叠，请调整后保存'); return; }
    try { await (isLocalWork() ? saveWorkspace(editor.current(), false, true) : saveProject(editor.current())); setStatus(hasPendingSaves() ? '保存请求已完成，但仍有修改未保存；请检查顶部保存状态' : isLocalWork() ? '已保存到本地项目文件夹' : '已保存到当前浏览器'); }
    catch (error) { setStatus('保存失败：' + String(error) + '；请重试或导出备份'); }
  }
  async function openProject(file: File) {
    if (!hydrated || editGate.current.fileBusy || playing || waterBlocked) return;
    fileLock(true); setStatus('正在读取项目，请勿关闭页面…');
    try {
      if (file.size > 150_000_000) throw new Error('文件超过 150MB');
      let next = projectSchema.parse(JSON.parse(await file.text()));
      if (!isLocalWork() && (next.spriteDrafts.length || next.assets.some(a => a.src.startsWith('/api/workspace/')))) throw new Error('此项目引用本地文件，请从本地工作模式导出可携带项目后再导入');
      if (!confirm('打开项目将替换当前内容，替换前会创建备份，也可撤销恢复。是否继续？')) { setStatus('已取消打开项目，当前内容未改变'); return; }
      await saveProject(editor.current(), true);
      if (isLocalWork()) next = await externalizeProject(next, true);
      replaceProject(next); setActiveShotId(next.shots[0].id); setSelected(''); showCanvas();
      setStatus('项目已打开，替换前的内容已备份');
    } catch (error) { setStatus('无法打开项目：' + String(error) + '；当前内容未替换'); }
    finally { fileLock(false); }
  }
  function newShot(studio: 'pixi' | 'motion' | 'three') {
    const name = prompt('布景名称', '新镜头'); if (!name?.trim()) return;
    const next = shotSchema.parse({ id: crypto.randomUUID(), name: name.trim(), studio, sceneId: shot.sceneId, frames: 180, caption: '', background: shot.background, actors: [], objects3d: studio === 'three' ? [{ id: crypto.randomUUID(), name: '立方体', shape: 'box' }] : [] });
    if (edit(p => p.shots.push(next))) { setActiveShotId(next.id); setSelected(''); showCanvas(); }
  }
  function removeSelected() { if (!selected) return; edit(p => { const s = p.shots[index]; s.actors = s.actors.filter(a => a.id !== selected); s.effects = s.effects.filter(e => e.id !== selected); s.objects3d = s.objects3d.filter(o => o.id !== selected); }); setSelected(''); }
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if(window.document.querySelector('dialog[open]')) return;
      if (event.key === 'F3') { event.preventDefault(); setCollisionDebug(v => !v); return; }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void saveNow(); return; }
      if (event.target instanceof HTMLElement && (event.target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName))) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); history(!event.shiftKey); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); history(false); }
      if (event.key === 'F1') { event.preventDefault(); alert('V 移动；Ctrl/Cmd+T 缩放（拖四角）；旋转拖外圈，Shift 吸附 15°；移动时 Shift 吸附 8 像素；WASD 走位不改路线；多边形套索单击放点，双击或 Enter 闭合；顶点工具拖多边形或路线点；中键平移；滚轮缩放；方向键微调；Delete 删除；Ctrl+Z 撤销；Ctrl+Y 或 Ctrl+Shift+Z 重做；Ctrl+S 保存；环境效果无需播放，添加即展示。水域重叠时请调整后保存。'); }
      if (event.key === 'Delete' && !playing && !tools.hasDraft) { if (activeRegion !== null && shot.effects.some(e => e.id === selected)) { edit(p => { p.shots[index].effects.find(e => e.id === selected)!.regions.splice(activeRegion, 1); }); selectRegion(null); } else removeSelected(); }
    }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  });
  if (startupError) return <section className="startup-error" role="alert"><h2>项目加载失败，已禁止自动覆盖</h2><p>{startupError}</p><button onClick={() => location.reload()}>重新加载</button></section>;
  return <div className={playing ? "app playing" : "app"} data-mobile-pane={pane} {...editor.inputHandlers}>
    <header className="app-header"><div className="brand">元力 <span>DIRECTOR / 多影棚</span></div><span className="mobile-scene-name">{shot.name}</span><HeaderMenu>
    <WorkspacePanel project={project} ready={hydrated && !fileBusy && !exporting} blocked={fileBusy || playing || exporting || waterBlocked} onBusy={fileLock} restore={p=>{replaceProject(p);seek(0);setSelected('');}} notify={setStatus}/>
      <select aria-label="文件菜单" value="" onChange={e => { const action = e.target.value; if (['pixi','motion','three'].includes(action)) newShot(action as 'pixi'|'motion'|'three'); if (action === 'chapter') { const name = prompt('章节名称'); if (name?.trim()) edit(p => p.chapters.push({ id: crypto.randomUUID(), name: name.trim() })); } if (action === 'help') alert(compact ? mobileHelp : 'V 移动；Ctrl/Cmd+T 缩放（拖四角）；旋转拖外圈，Shift 吸附 15°；移动时 Shift 吸附 8 像素；WASD 走位不改路线；多边形套索单击放点，双击或 Enter 闭合；顶点工具拖多边形或路线点；中键平移；滚轮缩放；方向键微调；Delete 删除；Ctrl+Z 撤销；Ctrl+Y 或 Ctrl+Shift+Z 重做；Ctrl+S 保存；环境效果无需播放，添加即展示。水域重叠时请调整后保存。雨水密度、八向风和分范围水花在属性里。图片及音频保存在本机，定期导出项目备份。'); }}><option value="">文件</option><option value="pixi">新建 2D 布景</option><option value="motion">新建动效布景</option><option value="three">新建 3D 布景</option><option value="chapter">新建章节</option><option value="help">操作帮助</option></select><select aria-label="编辑菜单" value="" onChange={e => { if(e.target.value === 'delete') removeSelected(); if(e.target.value === 'rename') { const value = prompt('元素名称', actor?.name || shot.effects.find(f => f.id === selected)?.name); if(value?.trim()) edit(p => { const s=p.shots[index], object=[...s.actors,...s.effects,...s.objects3d].find(a=>a.id===selected); if(object) object.name=value.trim(); }); } if(e.target.value === 'undo') history(true); if(e.target.value === 'redo') history(false); }}><option value="">编辑</option><option value="rename" disabled={!selected}>重命名元素</option><option value="delete" disabled={!selected}>删除元素</option><option value="undo" disabled={!canUndo}>撤销</option><option value="redo" disabled={!canRedo}>重做</option></select><ResourceReview/><BackupPanel project={project} onBusy={fileLock} disabled={!hydrated || fileBusy || playing || exporting || waterBlocked} restore={p => { replaceProject(p); seek(0); setSelected(''); }} notify={setStatus}/><LegacyImport project={project} disabled={!hydrated || fileBusy || playing || exporting} edit={edit} notify={setStatus}/><button disabled={!hydrated || fileBusy || exporting} onClick={async () => { setExporting(true); setStatus('正在导出项目备份…'); try { download(new Blob([JSON.stringify(await portableProject(editor.current()), null, 2)], { type: 'application/json' }), 'director-project.json'); setStatus('项目备份已导出'); } catch(e) { setStatus('导出失败：' + String(e)); } finally { setExporting(false); } }}>{exporting ? '正在导出…' : '导出项目'}</button><label className="button">打开项目<input type="file" accept=".json" hidden disabled={!hydrated || fileBusy || playing || waterBlocked} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void openProject(file); }} /></label><button disabled={!canUndo || !hydrated || fileBusy} onClick={() => history(true)}>撤销</button><button disabled={!canRedo || !hydrated || fileBusy} onClick={() => history(false)}>重做</button><div className="spacer"/><span className="badge" title={workspaceDirectory()}>{runtimeLabel()}</span><SaveIndicator ready={hydrated && !fileBusy} blocked={waterBlocked} retry={saveNow}/><a href="/logout">退出</a></HeaderMenu></header>
    <MobileDrawer as="aside" className="left" id="pane-left" title="元素与资源" side="left" open={pane === 'elements' || pane === 'resources'} onClose={showCanvas}>
      <nav className="mobile-sections drawer-shortcuts" aria-label="左侧分栏定位"><button aria-pressed={pane === 'elements'} onClick={() => showLeftSection('elements')}>元素列表</button><button aria-pressed={pane === 'resources'} onClick={() => showLeftSection('resources')}>资源列表</button></nav>
      <section className="hierarchy" id="pane-elements" aria-label="场景元素"><h2>场景元素 <small>{shot.studio === 'pixi' ? '2D 影棚' : shot.studio === 'three' ? '3D 影棚' : '动态图形影棚'}</small></h2><button className={!selected ? 'active row' : 'row'} onClick={() => selectFromList('')}>{shot.studio === 'pixi' ? '▧ 背景画布' : shot.studio === 'three' ? '◇ 3D 场景' : '◉ 五行图形'}</button>{shot.actors.map(a => <button className={`row ${selected === a.id ? 'active' : ''}`} key={a.id} onClick={() => selectFromList(a.id)}>♙ {a.name}</button>)}{shot.studio === 'three' && shot.objects3d.map(o => <button className={selected === o.id ? 'active row' : 'row'} key={o.id} onClick={() => selectFromList(o.id)}>◇ {o.name}</button>)}<EnvironmentList {...envProps} select={selectFromList} showAllRegions={showAllRegions} setShowAllRegions={setShowAllRegions}/></section><section className="resource-pane" id="pane-resources" aria-label="资源列表"><ResourceLibrary manifest={manifest} project={project} shot={shot} edit={edit} select={selectFromList} notify={setStatus}/></section>
    </MobileDrawer>
    <main id="pane-canvas" aria-label="画布编辑">
      <div className="viewport-bar"><span className="scene-name">{shot.name}</span><div className="spacer"/>
        <button disabled={!contextEnabled} onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); setRegionMenu({ shotId: shot.id, anchor: { x: rect.left, y: rect.bottom + 4 }, hits: [], target: '' }); }}>新建区域</button>
        <button onClick={navigation.fit}>适应画布</button>
        <label>视图 <select aria-label="视图" value={zoom} onChange={e => navigation.zoomTo(Number(e.target.value))}>
          {[0.25, 0.5, 1, 1.5, 2, 4].includes(zoom) ? null : <option value={zoom}>{Math.round(zoom * 100)}%</option>}
          {[0.25, 0.5, 1, 1.5, 2, 4].map(z => <option key={z} value={z}>{z * 100}%</option>)}
        </select></label>
        <ResolutionPicker shot={shot} manifest={manifest} quality={quality} setQuality={setQuality} assets={project.assets}/><span className="output-size">输出 1280 × 720</span>
      </div>
      <div className={navigation.panMode ? 'tool-strip panning' : 'tool-strip'}>
        <button className={navigation.panMode ? 'pan-tool active' : 'pan-tool'} aria-pressed={navigation.panMode} onClick={() => navigation.setPanMode(!navigation.panMode)}>平移画布</button>
        <div className="editing-tools" onClickCapture={() => navigation.setPanMode(false)}>{tools.toolbar}</div>
      </div>
      <div className="viewport" {...navigation.handlers} onDoubleClick={() => { if (!navigation.panMode) tools.doubleClick(); }} onWheel={e => {
        const rect = e.currentTarget.getBoundingClientRect();
        navigation.zoomTo(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), { x: e.clientX - rect.left - rect.width / 2, y: e.clientY - rect.top - rect.height / 2 });
      }}>
        <div className="canvas-stack" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
          <canvas aria-busy={loading} aria-label="影棚预览" ref={canvas} width={1280} height={720}/>
          <SelectionOverlay shot={tools.display ?? shot} selected={selected} activeRegion={activeRegion} showAllRegions={showAllRegions} interactive={!playing && !navigation.panMode && tools.tool === "move" && !tools.hasDraft} select={(id, region) => { setSelected(id); selectRegion(region); }}/>
          <WaterOverlapOverlay shot={tools.display ?? shot}/>{collisionDebug && <CollisionOverlay shot={tools.display ?? shot} frame={local}/>}
          {!playing && tools.overlay}
          {menuRegion && <svg className="selection-overlay context-target-overlay" viewBox="0 0 1280 720" aria-label="快捷菜单目标区域"><polygon points={regionPoints(menuRegion.region).map(p => `${100 + p.x * 720 / 1024},${720 - p.y * 720 / 1024}`).join(' ')}/></svg>}
          {!selected && shot.studio === "pixi" && <svg className="selection-overlay" viewBox="0 0 1280 720"><text className="origin-label" x="105" y="712">原点 (0, 0) · Y ↑</text></svg>}
        </div>
        {loading && <div className="loading-canvas">{loadError || "正在加载背景；导出将在画面就绪后启用"}{loadError && <button onClick={() => { if (renderer.current) retryRender(v => v + 1); else retryRenderer(v => v + 1); }}>重试加载资源</button>}</div>}
      </div>
      <div className="transport"><span className="live-badge">● 环境效果实时展示</span><small>{compact ? '轻点选中 · 再点或长按编辑 · 双指缩放 / 平移' : '右键管理区域 · 中键拖动画布 · 环境效果实时展示'}</small><button className="mobile-inspect" onClick={() => setPane('inspector')}>{selected ? '编辑所选属性' : '背景 / 环境属性'}</button></div>
    </main>
    {regionMenu && <CanvasContextMenu anchor={regionMenu.anchor} hits={regionMenu.hits} target={menuHit} targetValid={!!menuRegion} canAdd={!!menuRegion && menuRegion.effect.regions.length < 12}
      changeTarget={target => setRegionMenu(current => current ? { ...current, target } : null)} action={actOnRegion} create={createCanvasRegion} close={() => setRegionMenu(null)}/>}
    <MobileDrawer as="aside" className="right" id="pane-inspector" title="属性" side="right" open={pane === 'inspector'} onClose={showCanvas}>
      <div key={shot.id + selected} className="inspector-content"><h2>属性</h2><label>布景名称<NameField value={shot.name} onValueChange={value => edit(p => { p.shots[index].name = value; })}/></label>{actor && <><h2>角色路线</h2><label>角色层级<NumberField min="-100" max="100" value={actor.layer} onValueChange={value => edit(p => { p.shots[index].actors.find(a => a.id === actor.id)!.layer = value; })}/></label><label>元素名称<NameField value={actor.name} onValueChange={value => edit(p => { p.shots[index].actors.find(a => a.id === actor.id)!.name = value; })}/></label>{(['start', 'end'] as const).map(key => <fieldset key={key}><legend>{key === 'start' ? '起点' : '终点'}</legend>{(['x', 'y'] as const).map(axis => <label key={axis}>{axis.toUpperCase()}<NumberField value={actor[key][axis]} onValueChange={value => edit(p => { p.shots[index].actors.find(a => a.id === actor.id)![key][axis] = value; })}/></label>)}</fieldset>)}<small>逻辑坐标 1536 × 1024，左下角为 (0, 0)。角色编辑位置保持不变，环境效果独立运行。</small></>}<EnvironmentInspector {...envProps} draw={i => { navigation.setPanMode(false); tools.startRegion(i); showCanvas(); }} vertices={i => { selectRegion(i); navigation.setPanMode(false); tools.choose('vertices'); showCanvas(); }}/><BackgroundPanel shot={shot} manifest={manifest} change={envProps.change} assets={project.assets}/><ExtendedInspector project={project} shot={shot} edit={edit} selected={selected} drawRoute={() => { navigation.setPanMode(false); tools.choose('route'); showCanvas(); }}/><h2>运行模式</h2><p className="muted">{isLocalWork() ? `项目文件夹：${workspaceDirectory()}。自定义素材与 project.json 随作品目录保存；仓库内作品可提交 Git，切换设备前请停止服务并同步。` : '精简资源预览；项目只保存在当前浏览器。完整素材、磁盘读写及服务端视频导出请使用本地工作模式。'}</p><h2>输出</h2><button disabled={!ready || !hydrated || fileBusy || loading || exporting} onClick={async () => { try { download(await png(canvas.current!), `frame-${frame}.png`); } catch (e) { setStatus(String(e)); } }}>保存当前帧 PNG</button><p className="muted">当前先专注场景编辑和环境实时效果，视频编排与时间轴暂不开放。已有项目数据保留。</p></div>
    </MobileDrawer>
    <MobileDrawer as="section" className="scene-browser" id="pane-scenes" title="章节与场景" side="bottom" open={pane === 'scenes'} onClose={showCanvas}><ProjectTree project={project} shot={shot} edit={edit} seek={seek} thumb={sceneThumb}/><div className="tracks"><div className="track-heading"><b>场景布景</b><span>点击切换 · 环境效果自动展示</span><button onClick={() => edit(p => { const copy = structuredClone(shot); copy.id = crypto.randomUUID(); copy.name += ' 副本'; p.shots.splice(index + 1, 0, copy); })}>复制布景</button><button disabled={project.shots.length === 1} onClick={() => { if (confirm(`删除布景“${shot.name}”？可撤销恢复。`)) edit(p => { p.shots = p.shots.filter(s => s.id !== shot.id); }); }}>删除布景</button></div><div className="scene-cards">{project.shots.map((s, i) => <button key={s.id} className={`clip ${s.studio} ${i === index ? 'chosen' : ''}`} onClick={() => { seek(project.shots.slice(0, i).reduce((n, s) => n + s.frames, 0)); setSelected(''); }}><b>{s.name}</b><small>{s.studio === 'pixi' ? '2D 场景' : s.studio === 'three' ? '3D 场景' : '动态图形'}</small></button>)}</div></div></MobileDrawer><WorkspaceNavigation pane={pane} change={setPane}/><footer role="status">{status}</footer>
  </div>;
}
const root = createRoot(document.getElementById('root')!);
initializeRuntime().then(() => root.render(<App/>)).catch(e => root.render(<section className="startup-error" role="alert">启动失败：{String(e)}</section>));
