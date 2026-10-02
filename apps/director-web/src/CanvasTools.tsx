import { useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';
import { rectSchema, type Shot, type Effect } from '../../../packages/core';
import { clientToLogical, containsPoint, polygonBounds, regionPoints, snapCoordinate, validPolygon, type Point } from '../../../packages/core/geometry';
import { imageCorners, imageLocal } from '../../../packages/core/handles';
import { actorPosition } from '../../../packages/core/routes';
import { getRegion, hitRegions, type RegionHit } from './region-actions';
type Tool = 'move' | 'scale' | 'rotate' | 'vertices' | 'route' | 'flow' | 'lasso' | 'rect';
const toolNames: Record<Tool, string> = { move: '移动 V', scale: '缩放', rotate: '旋转', vertices: '顶点', route: '画路线', flow: '水流导线', lasso: '多边形套索', rect: '矩形区域' };
const screen = (p: Point) => `${100 + p.x * 720 / 1024},${720 - p.y * 720 / 1024}`;
export function useCanvasTools({ shot, local, selected, select, change, pause, notify, locked, playing, activeRegion, selectRegion }: { shot: Shot; local: number; selected: string; select: (id: string) => void; change: (fn: (s: Shot) => void) => boolean | void; pause: () => void; notify: (s: string) => void; locked: boolean; playing: boolean; activeRegion: number | null; selectRegion: (i: number | null) => void }) {
  const [tool, setTool] = useState<Tool>('move'), [preview, setPreview] = useState<Shot | null>(null), [stroke, setStroke] = useState<Point[]>([]), [walk, setWalk] = useState<Record<string, Point>>({});
  const [creation, setCreation] = useState<Effect | null>(null);
  const held = useRef(new Set<string>()), walkRef = useRef(walk), noted = useRef(false);
  const startWalk = useRef(() => {}), stopWalk = useRef(() => {});
  const shotRef = useRef(shot), selectedRef = useRef(selected), localRef = useRef(local);
  shotRef.current = shot; selectedRef.current = selected; localRef.current = local; walkRef.current = walk;
  const drag = useRef<{ start: Point; source: Shot; id: string; region?: number; regionTarget?: RegionHit; vertex?: [number, number]; stroke?: boolean; corner?: number; rotate?: boolean } | null>(null);
  const moveTarget = useRef<RegionHit | null>(null);
  const replaceRegion = useRef<number | undefined>(undefined);
  const replaceShape = useRef<string | undefined>(undefined);
  const [hover, setHover] = useState<Point | null>(null);
  const previewRef = useRef<Shot | null>(null), strokeRef = useRef<Point[]>([]);
  useEffect(() => { setPreview(null); drag.current = null; setStroke([]); strokeRef.current = []; walkRef.current = {}; setWalk({}); held.current.clear(); }, [shot.id]);
  useEffect(() => { if (playing) { walkRef.current = {}; setWalk({}); held.current.clear(); } }, [playing]);
  useEffect(() => { if (locked && !playing) stopWalk.current(); }, [locked, playing]);
  useEffect(() => {
    let last = performance.now(), raf = 0;
    const stop = () => { held.current.clear(); cancelAnimationFrame(raf); raf = 0; };
    const tick = (now: number) => {
      raf = 0;
      if (!held.current.size) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const keys = held.current, current = shotRef.current;
      if (keys.size && current.studio === 'pixi') {
        const actor = current.actors.find(a => a.id === selectedRef.current && a.enabled) ?? current.actors.find(a => a.enabled);
        if (actor) {
          const speed = actor.speed;
          const dx = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0), dy = (keys.has('w') ? 1 : 0) - (keys.has('s') ? 1 : 0);
          if (dx || dy) {
            const prev = walkRef.current[actor.id] ?? { x: 0, y: 0 };
            const base = actorPosition(actor, current, localRef.current);
            const next = { x: Math.min(1536, Math.max(0, base.x + prev.x + dx * speed * dt)), y: Math.min(1024, Math.max(0, base.y + prev.y + dy * speed * dt)) };
            const foot = { x: next.x, y: next.y };
            const blocked = current.collisionEnabled && actor.collision === 'stop' && current.effects.some(effect => effect.enabled && effect.collisionEnabled && effect.regions.some(region => containsPoint(region, foot)));
            if (!blocked) {
              walkRef.current = { ...walkRef.current, [actor.id]: { x: next.x - base.x, y: next.y - base.y } };
              setWalk(walkRef.current);
              if (!noted.current) { noted.current = true; notify('已停止预览，WASD 走位不会改路线'); }
            }
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    startWalk.current = () => { if (!raf && held.current.size) { last = performance.now(); raf = requestAnimationFrame(tick); } };
    stopWalk.current = stop;
    return stop;
  }, [notify]);
  useEffect(() => { if (drag.current?.id !== selected) { setPreview(null); previewRef.current = null; drag.current = null; } setStroke([]); strokeRef.current = []; replaceRegion.current = undefined; replaceShape.current = undefined; setHover(null); setCreation(null); moveTarget.current = null; }, [selected, shot.id]);
  const actor = shot.actors.find(a => a.id === selected), effect = creation ?? shot.effects.find(e => e.id === selected);
  function unavailable(t: Tool) {
    if (locked) return '当前操作期间工具已锁定';
    if (shot.studio !== 'pixi') return '画布工具仅适用于 2D 布景';
    if (creation && !['move', 'lasso', 'rect'].includes(t)) return '请先完成或取消新区域的绘制';
    const regional = effect && effect.type !== 'lightning';
    if ((t === 'scale' || t === 'rotate') && !actor && !(regional && effect.regions.length)) return '请先选中图片元素或已有范围的环境元素';
    if (t === 'vertices' && !actor?.route.length && !(regional && effect.regions.length)) return '请先选中已有路线或区域的元素';
    if (t === 'route' && !actor) return '请先选中人物、树木等图片元素';
    if (t === 'flow' && effect?.type !== 'water') return '请先选中水流元素；套索只负责绘制范围';
    if ((t === 'lasso' || t === 'rect') && !regional) return '请先选中水流、雾气、降雨等区域元素';
    return '';
  }
  const help: Record<Tool, string> = {
    move: '拖动元素或区域；Shift 吸附网格，方向键微调图片',
    scale: actor ? '拖动图片四角控制点等比缩放；缩放画布请用滚轮或双指' : '从区域外缘拖动缩放，选中单个区域时仅调整该区域',
    rotate: actor ? '拖动图片选框外圈旋转；Shift 吸附 15°' : '围绕区域中心拖动旋转；Shift 吸附 15°',
    vertices: '拖动区域或路线上的顶点',
    route: '单击添加路线点，Enter 或完成线段保存；Backspace 撤回',
    flow: '逐点绘制水流方向，至少两个点；Enter 或完成线段保存',
    lasso: '单击放点 · 双击/回首点/Enter 闭合 · Backspace 撤回 · Esc 取消',
    rect: '按住并拖动绘制矩形范围，松开保存',
  };
  function choose(t: Tool) { const reason = unavailable(t); if (reason) { notify(reason); return false; } moveTarget.current = null; if (t !== 'lasso' && t !== 'rect') setCreation(null); pause(); setTool(t); setStroke([]); strokeRef.current = []; replaceRegion.current = undefined; replaceShape.current = undefined; drag.current = null; previewRef.current = null; setPreview(null); setHover(null); if (t !== 'move') notify(help[t]); return true; }
  function startRegion(replace?: number) { if (!choose('lasso')) return; replaceRegion.current = replace; replaceShape.current = replace === undefined ? undefined : JSON.stringify(effect?.regions[replace]); }
  function prepareRegionSelection(id: string, index: number) {
    const target = moveTarget.current;
    // Re-selecting the same region must not release an explicit move lock, but
    // selecting another shape must not leave the old lock active either.
    if (target && (target.effectId !== id || target.index !== index || !getRegion(shot, target))) moveTarget.current = null;
  }
  function moveRegion(index: number) {
    const current = shot.effects.find(item => item.id === selected), region = current?.regions[index];
    if (!current || !current.enabled || current.type === 'lightning' || !Number.isInteger(index) || !region) {
      notify('移动目标已改变或被删除，请重新选择此区域'); return false;
    }
    if (!choose('move')) return false;
    moveTarget.current = { effectId: current.id, index, signature: JSON.stringify(region), name: current.name, type: current.type, layer: current.layer };
    selectRegion(index);
    notify('拖动已选区域；点击“移动 V”可恢复自由选择');
    return true;
  }
  function beginRegion(draft: Effect, shape: 'lasso' | 'rect' = 'lasso') {
    if (locked || shot.studio !== 'pixi' || draft.type === 'lightning') return false;
    pause(); cancel(); setCreation(structuredClone(draft)); setTool(shape);
    strokeRef.current = []; setStroke([]); setHover(null); replaceRegion.current = undefined; replaceShape.current = undefined;
    notify(`正在新建${draft.name}：${shape === 'lasso' ? '沿边界逐点点击，再点闭合范围' : '拖出矩形，松手完成'}；取消不会保存`);
    return true;
  }
  function createdRegion() {
    if (!creation) return;
    select(creation.id); selectRegion(0); setCreation(null); setTool('move');
    notify(`已新建${creation.name}，可直接点选编辑；可撤销`);
  }
  // Switching between compatible region elements keeps the drawing tool; selecting
  // a background or deleting the last editable shape returns to selection mode.
  const invalidTool = !locked && unavailable(tool);
  useEffect(() => { if (invalidTool) setTool('move'); }, [invalidTool]);
  function commitStroke() {
    if (locked) { notify('当前操作期间不能完成绘制，草稿已保留'); return; }
    let applied: boolean | void;
    const draft = structuredClone(strokeRef.current);
    if (tool === 'route' && actor && draft.length) applied = change(s => { const current = s.actors.find(a => a.id === actor.id); if (!current) throw new Error('路线所属元素已删除'); current.route = [current.start, ...draft]; });
    else if (tool === 'flow' && effect) {
      if (draft.length < 2) { notify('水流导线至少需要两个点，草稿已保留，请继续添加'); return; }
      if (effect.flowLines.length >= 16) { notify('每个水流元素最多 16 条导线，请先删除不需要的导线'); return; }
      applied = change(s => { const current = s.effects.find(e => e.id === effect.id); if (!current || current.type !== 'water') throw new Error('水流元素已删除或改变'); current.flowLines.push(draft); });
    }
    else if (tool === 'lasso' && effect) {
      const points = strokeRef.current.map(p => ({ x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 }));
      if (points.length < 3 || !validPolygon(points)) { notify('无法闭合：至少三个点，不能自交或共线；可撤销顶点继续修改'); return; }
      const target = replaceRegion.current;
      if (target !== undefined && (!effect.regions[target] || JSON.stringify(effect.regions[target]) !== replaceShape.current)) { notify('重绘的区域已删除或改变，请重新选择区域后绘制'); return; }
      if (target === undefined && effect.regions.length >= 12) { notify('每个元素最多 12 个区域'); return; }
      applied = change(s => { if (creation) { if (s.effects.some(e => e.id === creation.id)) throw new Error('此区域已创建，请重新选择'); s.effects.push({ ...structuredClone(creation), regions: [{ ...polygonBounds(points), points }] }); return; } const f = s.effects.find(e => e.id === effect.id); if (!f) throw new Error('区域所属元素已删除'); if (target !== undefined && JSON.stringify(f.regions[target]) !== replaceShape.current) throw new Error('重绘区域已改变，请重新选择'); const r = { ...f.regions[target ?? -1], ...polygonBounds(points), points }; if (target === undefined) f.regions.push(r); else f.regions[target] = r; });
      if (applied === false) return;
      if (creation) createdRegion();
      else { selectRegion(target ?? effect.regions.length); notify('区域已保存；套索保持选中，可继续逐点绘制'); }
      replaceRegion.current = undefined;
    } else if (tool === 'rect' && effect && strokeRef.current.length >= 3) {
      const bounds = polygonBounds(strokeRef.current);
      if (bounds.width < 8 || bounds.height < 8) { notify('矩形太小，请拖动至少 8 × 8 的范围'); return; }
      if (effect.regions.length >= 12) { notify('每个元素最多 12 个范围，请先删除不需要的范围'); return; }
      applied = change(s => { if (creation) { if (s.effects.some(e => e.id === creation.id)) throw new Error('此区域已创建，请重新选择'); s.effects.push({ ...structuredClone(creation), regions: [bounds] }); return; } const current = s.effects.find(e => e.id === effect.id); if (!current) throw new Error('区域所属元素已删除'); current.regions.push(bounds); });
      if (applied !== false) { if (creation) createdRegion(); else selectRegion(effect.regions.length); }
    } else return;
    if (applied === false) return;
    if (tool === 'flow' || tool === 'route') notify(tool === 'flow' ? '水流导线已保存，可继续绘制下一条' : '路线已保存；在属性中调整速度和显示状态');
    setStroke([]); strokeRef.current = [];
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (document.querySelector('dialog[open]')) return;
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName));
      if (!typing && shot.studio === 'pixi' && !e.ctrlKey && !e.metaKey && !e.altKey && ['w', 'a', 's', 'd'].includes(e.key.toLowerCase()) && !(locked && !playing)) { e.preventDefault(); pause(); held.current.add(e.key.toLowerCase()); startWalk.current(); return; }
      if (locked || typing) return;
      if (e.key.toLowerCase() === 'v') choose('move');
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 't') { e.preventDefault(); choose('scale'); }
      if (e.key === 'Escape') { choose('move'); }
      if (e.key === 'Enter' && strokeRef.current.length) { e.preventDefault(); commitStroke(); }
      if (e.key === 'Backspace' && strokeRef.current.length) { e.preventDefault(); strokeRef.current = strokeRef.current.slice(0, -1); setStroke(strokeRef.current); }
      if (actor && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) { e.preventDefault(); const step = e.shiftKey ? 10 : 1, dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0, dy = e.key === 'ArrowDown' ? -step : e.key === 'ArrowUp' ? step : 0; change(s => { const a = s.actors.find(a => a.id === actor.id)!; [a.start, a.end, ...a.route].forEach(p => { p.x += dx; p.y += dy; }); if (a.sortY !== null) a.sortY += dy; }); }
    }; const release = (e: KeyboardEvent) => { held.current.delete(e.key.toLowerCase()); if (!held.current.size) stopWalk.current(); }; const blur = () => stopWalk.current();
    const focus = (e: FocusEvent) => { if (e.target instanceof HTMLElement && (e.target.isContentEditable || /INPUT|TEXTAREA|SELECT|DIALOG/.test(e.target.tagName) || e.target.closest('dialog, [role=dialog][aria-modal=true]'))) stopWalk.current(); };
    const visibility = () => { if (document.hidden) stopWalk.current(); };
    window.addEventListener('keydown', key); window.addEventListener('keyup', release); window.addEventListener('blur', blur);
    window.addEventListener('focusin', focus); document.addEventListener('visibilitychange', visibility);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('keyup', release); window.removeEventListener('blur', blur); window.removeEventListener('focusin', focus); document.removeEventListener('visibilitychange', visibility); };
  });
  const shifted = (actor: Shot['actors'][number]) => { const pos = actorPosition(actor, shot, local), offset = walk[actor.id]; return offset ? { x: pos.x + offset.x, y: pos.y + offset.y } : pos; };
  function point(event: PointerEvent, canvas: RefObject<HTMLCanvasElement | null>) { return canvas.current ? clientToLogical({ x: event.clientX, y: event.clientY }, canvas.current.getBoundingClientRect()) : null; }
  function hitRadius(e: PointerEvent, canvas: RefObject<HTMLCanvasElement | null>, mouseRadius: number) {
    const rect = canvas.current?.getBoundingClientRect();
    // 22 CSS pixels around touch handles, independent of canvas zoom/letterboxing.
    return e.pointerType === 'touch' && rect ? Math.max(mouseRadius, 22 * 1024 / Math.max(1, Math.min(rect.height, rect.width * 720 / 1280))) : mouseRadius;
  }
  function down(e: PointerEvent, canvas: RefObject<HTMLCanvasElement | null>) {
    if (locked || shot.studio !== 'pixi' || e.button !== 0) return;
    const p = point(e, canvas); if (!p) return; pause();
    if (tool === 'move' && moveTarget.current) {
      const target = moveTarget.current, current = getRegion(shot, target);
      if (!current || !current.effect.enabled) { notify('移动目标已改变或被删除，请重新选择此区域'); return; }
      if (!hitRegions(shot, p, hitRadius(e, canvas, 8)).some(hit => hit.effectId === target.effectId && hit.index === target.index)) {
        notify('请在已选区域内拖动；点击“移动 V”可恢复自由选择'); return;
      }
      // An explicit context-menu target takes precedence over overlapping actors
      // and sibling regions. Never replace it with the first generic hit.
      drag.current = { start: p, source: structuredClone(shot), id: target.effectId, region: target.index, regionTarget: target };
      selectRegion(target.index); e.currentTarget.setPointerCapture(e.pointerId); return;
    }
    if (tool === 'route' || tool === 'flow') { if ((tool === 'route' && !actor) || (tool === 'flow' && effect?.type !== 'water')) { notify('路线需选中图片元素，水流导线需选中水域'); return; } if (strokeRef.current.length >= 128) { notify('最多 128 个点，请先完成线段'); return; } const last = strokeRef.current.at(-1); if (last && Math.hypot(p.x - last.x, p.y - last.y) < 1) return; strokeRef.current = [...strokeRef.current, p]; setStroke(strokeRef.current); return; }
    if (tool === 'lasso') {
      if (!effect || effect.type === 'lightning') { notify('请先选中有区域的环境元素'); return; }
      const points = strokeRef.current;
      if (points.length >= 3 && Math.hypot(p.x - points[0].x, p.y - points[0].y) < hitRadius(e, canvas, 12)) { commitStroke(); return; }
      if (points.length >= 128) { notify('最多 128 个顶点，请先闭合'); return; }
      if (!points.length || Math.hypot(p.x - points.at(-1)!.x, p.y - points.at(-1)!.y) > 1) { strokeRef.current = [...points, p]; setStroke(strokeRef.current); }
      return;
    }
    if (tool === 'rect') { if (!effect || effect.type === 'lightning') { notify('请先选中环境元素'); return; } strokeRef.current = [p]; setStroke([p]); drag.current = { start: p, source: structuredClone(shot), id: selected, stroke: true }; e.currentTarget.setPointerCapture(e.pointerId); return; }
    const pickedActor = shot.actors.find(a => a.id === selected);
    if ((tool === 'scale' || tool === 'rotate') && pickedActor) {
      const origin = shifted(pickedActor);
      if (tool === 'scale') {
        const corner = imageCorners(pickedActor, origin).map((c, i) => ({ i, distance: Math.hypot(p.x - c.x, p.y - c.y) })).sort((a, b) => a.distance - b.distance).find(c => c.distance < hitRadius(e, canvas, 22))?.i ?? -1;
        if (corner < 0) { notify('请拖动四角控制点等比缩放'); return; }
        drag.current = { start: p, source: structuredClone(shot), id: pickedActor.id, corner }; e.currentTarget.setPointerCapture(e.pointerId); return;
      }
      const localPoint = imageLocal(pickedActor, origin, p);
      const inside = Math.abs(localPoint.x) <= pickedActor.width / 2 && localPoint.y >= 0 && localPoint.y <= pickedActor.height;
      const radius = e.pointerType === 'touch' ? hitRadius(e, canvas, 36) / pickedActor.scale : 36;
      const near = Math.abs(localPoint.x) <= pickedActor.width / 2 + radius && localPoint.y >= -radius && localPoint.y <= pickedActor.height + radius;
      if (inside || !near) { notify('请拖动选框外圈旋转；按住 Shift 吸附 15°'); return; }
      drag.current = { start: p, source: structuredClone(shot), id: pickedActor.id, rotate: true }; e.currentTarget.setPointerCapture(e.pointerId); return;
    }
    let id = selected;
    if (tool === 'move') {
      const picked = [...shot.actors].filter(a => a.enabled).sort((a, b) => b.layer - a.layer || shifted(a).y - shifted(b).y).find(a => {
        const pos = shifted(a), angle = -a.rotation * Math.PI / 180, dx = p.x - pos.x, dy = p.y - pos.y;
        const x = (dx * Math.cos(angle) - dy * Math.sin(angle)) / a.scale * (a.flipX ? -1 : 1), y = (dx * Math.sin(angle) + dy * Math.cos(angle)) / a.scale * (a.flipY ? -1 : 1);
        return Math.abs(x) <= a.width / 2 && y >= 0 && y <= a.height;
      });
      if (picked) id = picked.id; else if (!effect?.regions.some(r => containsPoint(r, p))) id = [...shot.effects].reverse().find(e => e.enabled && e.regions.some(r => containsPoint(r, p)))?.id ?? '';
      select(id);
    }
    if (!id) return;
    const entry = shot.effects.find(f => f.id === id); let vertex: [number, number] | undefined;
    let nearest = hitRadius(e, canvas, 20);
    const pickVertex = (v: Point, ri: number, vi: number) => { const distance = Math.hypot(p.x - v.x, p.y - v.y); if (distance < nearest) { nearest = distance; vertex = [ri, vi]; } };
    if (tool === 'vertices') shot.actors.find(a => a.id === id)?.route.forEach((v, i) => pickVertex(v, -1, i));
    if (tool === 'vertices' && entry) entry.regions.forEach((r, ri) => { if (activeRegion !== null && ri !== activeRegion) return; regionPoints(r).forEach((v, vi) => pickVertex(v, ri, vi)); });
    if (tool === 'vertices' && !vertex) { notify('请拖动显示的区域顶点或路线顶点'); return; }
    let region = activeRegion ?? undefined;
    if (entry && tool === 'move') { const hit = id === selected && activeRegion !== null && entry.regions[activeRegion] && containsPoint(entry.regions[activeRegion], p) ? activeRegion : entry.regions.findIndex(r => containsPoint(r, p)); if (hit >= 0) { region = hit; selectRegion(hit); } }
    if (entry && (!entry.regions.length || entry.type === 'lightning')) return;
    drag.current = { start: p, source: structuredClone(shot), id, vertex, region }; e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent, canvas: RefObject<HTMLCanvasElement | null>) {
    if (tool === 'lasso' && strokeRef.current.length && !(e.buttons & 4)) setHover(point(e, canvas));
    if (!drag.current || (e.buttons & 4)) return; const p = point(e, canvas); if (!p) return;
    const d = drag.current;
    if (d.stroke) { if (tool === 'rect') { strokeRef.current = [d.start, { x: p.x, y: d.start.y }, p, { x: d.start.x, y: p.y }]; setStroke(strokeRef.current); return; } const last = strokeRef.current.at(-1)!; if (Math.hypot(p.x - last.x, p.y - last.y) > 12 && strokeRef.current.length < 128) { strokeRef.current = [...strokeRef.current, p]; setStroke(strokeRef.current); } return; }
    const next = structuredClone(d.source), a = next.actors.find(a => a.id === d.id), f = next.effects.find(f => f.id === d.id);
    const grid = e.shiftKey ? 8 : shot.snap;
    const snap = (value: number) => snapCoordinate(value, grid);
    let dx = p.x - d.start.x, dy = p.y - d.start.y;
    if (tool === 'move' && grid) { const anchor = d.source.actors.find(actor => actor.id === d.id)?.start ?? d.source.effects.find(effect => effect.id === d.id)?.regions[0]; if (anchor) { dx = snap(anchor.x + dx) - anchor.x; dy = snap(anchor.y + dy) - anchor.y; } }
    if (a) {
      if (tool === 'vertices' && d.vertex) a.route[d.vertex[1]] = { x: snap(p.x), y: snap(p.y) };
      const sourceActor = d.source.actors.find(actor => actor.id === d.id)!;
      const center = actorPosition(sourceActor, d.source, local), offset = walk[sourceActor.id] ?? { x: 0, y: 0 }, visual = { x: center.x + offset.x, y: center.y + offset.y };
      if (tool === 'move') { [a.start, a.end, ...a.route].forEach(p => { p.x += dx; p.y += dy; }); if (a.sortY !== null) a.sortY += dy; }
      if (d.corner !== undefined) {
        const corner = imageCorners(sourceActor, visual)[d.corner];
        const start = Math.hypot(corner.x - visual.x, corner.y - visual.y);
        a.scale = Math.max(0.01, Math.min(20, sourceActor.scale * Math.hypot(p.x - visual.x, p.y - visual.y) / Math.max(1, start)));
      }
      if (d.rotate) { a.rotation = sourceActor.rotation + (Math.atan2(p.y - visual.y, p.x - visual.x) - Math.atan2(d.start.y - visual.y, d.start.x - visual.x)) * 180 / Math.PI; if (e.shiftKey) a.rotation = Math.round(a.rotation / 15) * 15; }
    } else if (f) {
      if (d.vertex) { const [ri, vi] = d.vertex, points = regionPoints(f.regions[ri]); points[vi] = { x: snap(p.x), y: snap(p.y) }; f.regions[ri] = { ...f.regions[ri], ...polygonBounds(points), points }; }
      else {
        const targets = d.region === undefined ? f.regions : f.regions.slice(d.region, d.region + 1);
        const bounds = polygonBounds(targets.flatMap(regionPoints)), center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
        const ratio = tool === 'scale' ? Math.hypot(p.x - center.x, p.y - center.y) / Math.max(1, Math.hypot(d.start.x - center.x, d.start.y - center.y)) : 1;
        let angle = tool === 'rotate' ? Math.atan2(p.y - center.y, p.x - center.x) - Math.atan2(d.start.y - center.y, d.start.x - center.x) : 0; if (e.shiftKey) angle = Math.round(angle / (Math.PI / 12)) * Math.PI / 12;
        const map = (v: Point) => tool === 'move' ? { x: v.x + dx, y: v.y + dy } : { x: center.x + ((v.x - center.x) * Math.cos(angle) - (v.y - center.y) * Math.sin(angle)) * ratio, y: center.y + ((v.x - center.x) * Math.sin(angle) + (v.y - center.y) * Math.cos(angle)) * ratio };
        f.regions = f.regions.map((r, i) => { if (d.region !== undefined && i !== d.region) return r; const points = regionPoints(r).map(map); return { ...r, ...polygonBounds(points), points }; }); if (d.region === undefined) { f.flowLines = f.flowLines.map(line => line.map(map)); if (f.sortY !== null && tool === 'move') f.sortY += dy; }
      }
    }
    previewRef.current = next; setPreview(next);
  }
  function up(e: PointerEvent) {
    if (e.button === 1) return;
    if (drag.current?.stroke) commitStroke();
    else if (drag.current && previewRef.current) {
      const d = drag.current, next = previewRef.current;
      let movedSignature: string | undefined;
      const applied = change(s => {
        // A drag preview is based on pointer-down state. Commit only transform
        // fields, never the whole shot: uploads or property edits may have landed
        // while the pointer was down. Reject conflicting target edits explicitly.
        const merge = <T extends object>(before: T | undefined, after: T | undefined, current: T | undefined, fields: (keyof T)[]) => {
          if (!before || !after || !current) throw new Error('拖动的元素已删除，未覆盖现有内容');
          const changed = fields.filter(key => JSON.stringify(after[key]) !== JSON.stringify(before[key]));
          if (changed.some(key => JSON.stringify(current[key]) !== JSON.stringify(before[key]))) throw new Error('拖动期间此元素的几何信息已改变，请重新拖动');
          for (const key of changed) current[key] = after[key];
        };
        if (d.source.actors.some(a => a.id === d.id)) merge(d.source.actors.find(a => a.id === d.id), next.actors.find(a => a.id === d.id), s.actors.find(a => a.id === d.id), ['start', 'end', 'route', 'sortY', 'scale', 'rotation']);
        else merge(d.source.effects.find(f => f.id === d.id), next.effects.find(f => f.id === d.id), s.effects.find(f => f.id === d.id), ['regions', 'flowLines', 'sortY']);
        if (d.regionTarget) {
          const region = s.effects.find(effect => effect.id === d.id)?.regions[d.regionTarget.index];
          if (!region) throw new Error('移动目标已删除，未覆盖现有内容');
          // Match project validation's property order (including optional points
          // and splash flags), so the next drag recognizes our own saved shape.
          movedSignature = JSON.stringify(rectSchema.parse(region));
        }
      });
      if (applied !== false && movedSignature && d.regionTarget && moveTarget.current === d.regionTarget) {
        moveTarget.current = { ...d.regionTarget, signature: movedSignature };
      }
    }
    drag.current = null; previewRef.current = null; setPreview(null);
  }
  function cancel() { if (drag.current?.stroke) { strokeRef.current = []; setStroke([]); } drag.current = null; previewRef.current = null; setPreview(null); }
  function checkpoint() { const points = [...strokeRef.current]; return () => { strokeRef.current = points; setStroke(points); setHover(null); }; }
  const applyWalk = (base: Shot) => {
    if (!Object.values(walk).some(offset => Math.abs(offset.x) > 0.01 || Math.abs(offset.y) > 0.01)) return base;
    const next = structuredClone(base);
    for (const actor of next.actors) {
      const offset = walk[actor.id]; if (!offset) continue;
      actor.start = { x: actor.start.x + offset.x, y: actor.start.y + offset.y };
      actor.end = { x: actor.end.x + offset.x, y: actor.end.y + offset.y };
      actor.route = actor.route.map(point => ({ x: point.x + offset.x, y: point.y + offset.y }));
      if (actor.sortY !== null) actor.sortY = Math.min(1024, Math.max(0, actor.sortY + offset.y));
    }
    return next;
  };
  const display = preview || Object.keys(walk).length ? applyWalk(preview ?? shot) : null;
  const shown = display ?? shot, current = shown.actors.find(a => a.id === selected), pos = current ? actorPosition(current, shown, local) : null;
  const overlay = <svg className="selection-overlay tool-overlay" viewBox="0 0 1280 720">{current && pos && <g transform={`translate(${100 + pos.x * 720 / 1024} ${720 - pos.y * 720 / 1024}) rotate(${-current.rotation}) scale(${current.scale})`}><rect x={-current.width * 720 / 2048} y={-current.height * 720 / 1024} width={current.width * 720 / 1024} height={current.height * 720 / 1024}/>{[-1, 1].flatMap(x => [0, -current.height * 720 / 1024].map(y => <rect key={`${x},${y}`} x={x * current.width * 720 / 2048 - 4} y={y - 4} width="8" height="8"/>))}</g>}{tool === "vertices" && current?.route.map((p,i) => <circle key={i} cx={100+p.x*720/1024} cy={720-p.y*720/1024} r="5"/>)}{current?.routeVisible && <polyline points={current.route.map(screen).join(' ')}/>} {current?.sortY !== null && current?.sortY !== undefined && <line x1="100" x2="1180" y1={720 - current.sortY * 720 / 1024} y2={720 - current.sortY * 720 / 1024}/>}{tool === 'vertices' && effect?.regions.flatMap((r, ri) => (activeRegion === null || activeRegion === ri ? regionPoints(r) : []).map((v, vi) => <circle key={`${ri}-${vi}`} cx={100 + v.x * 720 / 1024} cy={720 - v.y * 720 / 1024} r="5"/>))}{effect?.flowLines.map((line, i) => <polyline key={i} points={line.map(screen).join(' ')}/>)}<g aria-label="多边形草稿"><polyline points={[...stroke, ...(tool === 'lasso' && hover && stroke.length ? [hover] : [])].map(screen).join(' ')}/>{tool === 'lasso' && stroke.map((p, i) => <circle key={i} cx={100+p.x*720/1024} cy={720-p.y*720/1024} r={i === 0 ? 7 : 4}/>)}</g></svg>;
  const toolbar = <><div className="canvas-tools">{(Object.entries(toolNames) as [Tool, string][]).map(([key, name]) => <button key={key} disabled={!!unavailable(key)} title={unavailable(key) || help[key]} aria-pressed={tool === key} className={tool === key ? 'active' : ''} onClick={() => key === 'lasso' ? startRegion() : choose(key)}>{name}</button>)}<button disabled={!actor || locked || shot.studio !== 'pixi'} title={actor ? '水平镜像所选图片元素' : '请先选中图片元素'} onClick={() => change(s => { const a = s.actors.find(a => a.id === selected); if (!a) throw new Error('镜像元素已删除'); a.flipX = !a.flipX; })}>镜像</button>{tool !== 'move' && <small>{help[tool]}</small>}</div>{(stroke.length > 0 || creation) && <div className="draft-actions">{creation && <span className="creation-hint">新建 {creation.name} · {tool === 'rect' ? '拖出矩形' : '逐点点击后闭合'}</span>}{stroke.length > 0 && <><button disabled={locked} onClick={commitStroke}>{tool === 'lasso' || tool === 'rect' ? '闭合范围' : '完成线段'}</button><button disabled={locked} onClick={() => { strokeRef.current = strokeRef.current.slice(0, -1); setStroke(strokeRef.current); }}>撤销顶点</button></>}<button disabled={locked} onClick={() => choose('move')}>取消绘制</button></div>}</>;
  return { display, toolbar, overlay, down, move, up, cancel, checkpoint, tapOnly: ['lasso', 'route', 'flow'].includes(tool), tool, choose, prepareRegionSelection, moveRegion, startRegion, beginRegion, creating: !!creation, hasDraft: stroke.length > 0, doubleClick: () => { if (tool === 'lasso' && strokeRef.current.length >= 3) commitStroke(); } };
}
