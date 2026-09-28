import { useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';
import { type Shot } from '../../../packages/core';
import { clientToLogical, containsPoint, polygonBounds, regionPoints, simplifyPolyline, snapCoordinate, validPolygon, type Point } from '../../../packages/core/geometry';
import { imageCorners, imageLocal } from '../../../packages/core/handles';
import { actorPosition } from '../../../packages/core/routes';
type Tool = 'move' | 'scale' | 'rotate' | 'vertices' | 'route' | 'flow' | 'lasso' | 'rect';
const screen = (p: Point) => `${100 + p.x * 720 / 1024},${720 - p.y * 720 / 1024}`;
export function useCanvasTools({ shot, local, selected, select, change, pause, notify, locked, playing }: { shot: Shot; local: number; selected: string; select: (id: string) => void; change: (fn: (s: Shot) => void) => void; pause: () => void; notify: (s: string) => void; locked: boolean; playing: boolean }) {
  const [tool, setTool] = useState<Tool>('move'), [preview, setPreview] = useState<Shot | null>(null), [stroke, setStroke] = useState<Point[]>([]), [walk, setWalk] = useState<Record<string, Point>>({});
  const held = useRef(new Set<string>()), walkRef = useRef(walk), noted = useRef(false);
  const shotRef = useRef(shot), selectedRef = useRef(selected), localRef = useRef(local);
  shotRef.current = shot; selectedRef.current = selected; localRef.current = local; walkRef.current = walk;
  const drag = useRef<{ start: Point; source: Shot; id: string; vertex?: [number, number]; stroke?: boolean; corner?: number; rotate?: boolean } | null>(null);
  const previewRef = useRef<Shot | null>(null), strokeRef = useRef<Point[]>([]);
  useEffect(() => { setPreview(null); drag.current = null; setStroke([]); strokeRef.current = []; walkRef.current = {}; setWalk({}); held.current.clear(); }, [shot.id]);
  useEffect(() => { if (playing) { walkRef.current = {}; setWalk({}); held.current.clear(); } }, [playing]);
  useEffect(() => {
    let last = performance.now(), raf = 0;
    const tick = (now: number) => {
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
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [notify]);
  useEffect(() => { if (drag.current?.id !== selected) { setPreview(null); previewRef.current = null; drag.current = null; } setStroke([]); strokeRef.current = []; }, [selected]);
  const actor = shot.actors.find(a => a.id === selected), effect = shot.effects.find(e => e.id === selected);
  function choose(t: Tool) { pause(); setTool(t); setStroke([]); strokeRef.current = []; drag.current = null; setPreview(null); }
  function commitStroke() {
    if (tool === 'route' && actor && strokeRef.current.length) change(s => { s.actors.find(a => a.id === actor.id)!.route = [actor.start, ...strokeRef.current]; });
    else if (tool === 'flow' && effect && strokeRef.current.length >= 2) change(s => { s.effects.find(e => e.id === effect.id)!.flowLines.push(strokeRef.current); });
    else if (tool === 'lasso' && effect) {
      const points = simplifyPolyline(strokeRef.current, 8).map(p => ({ x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 }));
      if (points.length < 3 || !validPolygon(points)) { notify(points.length < 3 ? '自由套索至少需要三个点' : '自由套索自交或面积过小，请重画'); }
      else if (effect.regions.length >= 12) notify('每个元素最多 12 个范围');
      else change(s => { s.effects.find(e => e.id === effect.id)!.regions.push({ ...polygonBounds(points), points }); notify('已添加自由套索范围，工具保持选中'); });
    } else if (tool === 'rect' && effect && strokeRef.current.length >= 3) {
      const bounds = polygonBounds(strokeRef.current);
      if (bounds.width < 8 || bounds.height < 8) notify('矩形太小');
      else if (effect.regions.length >= 12) notify('每个元素最多 12 个范围');
      else change(s => { s.effects.find(e => e.id === effect.id)!.regions.push(bounds); });
    }
    setStroke([]); strokeRef.current = [];
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName));
      if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey && ['w', 'a', 's', 'd'].includes(e.key.toLowerCase()) && !(locked && !playing)) { e.preventDefault(); pause(); held.current.add(e.key.toLowerCase()); return; }
      if (locked || typing) return;
      if (e.key.toLowerCase() === 'v') choose('move');
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 't') { e.preventDefault(); choose('scale'); }
      if (e.key === 'Escape') { drag.current = null; setPreview(null); setStroke([]); strokeRef.current = []; setTool('move'); }
      if (e.key === 'Enter' && strokeRef.current.length) { e.preventDefault(); commitStroke(); }
      if (actor && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) { e.preventDefault(); const step = e.shiftKey ? 10 : 1, dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0, dy = e.key === 'ArrowDown' ? -step : e.key === 'ArrowUp' ? step : 0; change(s => { const a = s.actors.find(a => a.id === actor.id)!; [a.start, a.end, ...a.route].forEach(p => { p.x += dx; p.y += dy; }); if (a.sortY !== null) a.sortY += dy; }); }
    }; const release = (e: KeyboardEvent) => held.current.delete(e.key.toLowerCase()); const blur = () => held.current.clear();
    window.addEventListener('keydown', key); window.addEventListener('keyup', release); window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('keyup', release); window.removeEventListener('blur', blur); };
  });
  const shifted = (actor: Shot['actors'][number]) => { const pos = actorPosition(actor, shot, local), offset = walk[actor.id]; return offset ? { x: pos.x + offset.x, y: pos.y + offset.y } : pos; };
  function point(event: PointerEvent, canvas: RefObject<HTMLCanvasElement | null>) { return canvas.current ? clientToLogical({ x: event.clientX, y: event.clientY }, canvas.current.getBoundingClientRect()) : null; }
  function down(e: PointerEvent, canvas: RefObject<HTMLCanvasElement | null>) {
    if (locked || shot.studio !== 'pixi' || e.button !== 0) return;
    const p = point(e, canvas); if (!p) return; pause();
    if (tool === 'route' || tool === 'flow') { if ((tool === 'route' && !actor) || (tool === 'flow' && effect?.type !== 'water')) { notify('路线需选中图片元素，水流导线需选中水域'); return; } strokeRef.current = [...strokeRef.current, p].slice(0, 128); setStroke(strokeRef.current); return; }
    if (tool === 'lasso' || tool === 'rect') { if (!effect) { notify('请先选中环境元素'); return; } strokeRef.current = [p]; setStroke([p]); drag.current = { start: p, source: structuredClone(shot), id: selected, stroke: true }; e.currentTarget.setPointerCapture(e.pointerId); return; }
    const pickedActor = shot.actors.find(a => a.id === selected);
    if ((tool === 'scale' || tool === 'rotate') && pickedActor) {
      const origin = shifted(pickedActor);
      if (tool === 'scale') {
        const corner = imageCorners(pickedActor, origin).findIndex(c => Math.hypot(p.x - c.x, p.y - c.y) < 22);
        if (corner < 0) { notify('请拖动四角控制点等比缩放'); return; }
        drag.current = { start: p, source: structuredClone(shot), id: pickedActor.id, corner }; e.currentTarget.setPointerCapture(e.pointerId); return;
      }
      const localPoint = imageLocal(pickedActor, origin, p);
      const inside = Math.abs(localPoint.x) <= pickedActor.width / 2 && localPoint.y >= 0 && localPoint.y <= pickedActor.height;
      const near = Math.abs(localPoint.x) <= pickedActor.width / 2 + 36 && localPoint.y >= -36 && localPoint.y <= pickedActor.height + 36;
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
    if (tool === 'vertices') shot.actors.find(a => a.id === id)?.route.forEach((v, i) => { if (Math.hypot(p.x - v.x, p.y - v.y) < 20) vertex = [-1, i]; });
    if (tool === 'vertices' && entry) entry.regions.forEach((r, ri) => regionPoints(r).forEach((v, vi) => { if (Math.hypot(p.x - v.x, p.y - v.y) < 20) vertex = [ri, vi]; }));
    if (tool === 'vertices' && !vertex) return;
    drag.current = { start: p, source: structuredClone(shot), id, vertex }; e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent, canvas: RefObject<HTMLCanvasElement | null>) {
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
      if (d.vertex) { const [ri, vi] = d.vertex, points = regionPoints(f.regions[ri]); points[vi] = { x: snap(p.x), y: snap(p.y) }; f.regions[ri] = { ...polygonBounds(points), points }; }
      else {
        const bounds = polygonBounds(f.regions.flatMap(regionPoints)), center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
        const ratio = tool === 'scale' ? Math.hypot(p.x - center.x, p.y - center.y) / Math.max(1, Math.hypot(d.start.x - center.x, d.start.y - center.y)) : 1;
        let angle = tool === 'rotate' ? Math.atan2(p.y - center.y, p.x - center.x) - Math.atan2(d.start.y - center.y, d.start.x - center.x) : 0; if (e.shiftKey) angle = Math.round(angle / (Math.PI / 12)) * Math.PI / 12;
        const map = (v: Point) => tool === 'move' ? { x: v.x + dx, y: v.y + dy } : { x: center.x + ((v.x - center.x) * Math.cos(angle) - (v.y - center.y) * Math.sin(angle)) * ratio, y: center.y + ((v.x - center.x) * Math.sin(angle) + (v.y - center.y) * Math.cos(angle)) * ratio };
        f.regions = f.regions.map(r => { const points = regionPoints(r).map(map); return { ...polygonBounds(points), points }; }); f.flowLines = f.flowLines.map(line => line.map(map)); if (f.sortY !== null && tool === 'move') f.sortY += dy;
      }
    }
    previewRef.current = next; setPreview(next);
  }
  function up(e: PointerEvent) { if (e.button === 1) return; if (drag.current?.stroke) commitStroke(); else if (drag.current && previewRef.current) { const next = previewRef.current; change(s => Object.assign(s, next)); } drag.current = null; previewRef.current = null; setPreview(null); }
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
  const overlay = <svg className="selection-overlay tool-overlay" viewBox="0 0 1280 720">{current && pos && <g transform={`translate(${100 + pos.x * 720 / 1024} ${720 - pos.y * 720 / 1024}) rotate(${-current.rotation}) scale(${current.scale})`}><rect x={-current.width * 720 / 2048} y={-current.height * 720 / 1024} width={current.width * 720 / 1024} height={current.height * 720 / 1024}/>{[-1, 1].flatMap(x => [0, -current.height * 720 / 1024].map(y => <rect key={`${x},${y}`} x={x * current.width * 720 / 2048 - 4} y={y - 4} width="8" height="8"/>))}</g>}{tool === "vertices" && current?.route.map((p,i) => <circle key={i} cx={100+p.x*720/1024} cy={720-p.y*720/1024} r="5"/>)}{current?.routeVisible && <polyline points={current.route.map(screen).join(' ')}/>} {current?.sortY !== null && current?.sortY !== undefined && <line x1="100" x2="1180" y1={720 - current.sortY * 720 / 1024} y2={720 - current.sortY * 720 / 1024}/>}{tool === 'vertices' && effect?.regions.flatMap((r, ri) => regionPoints(r).map((v, vi) => <circle key={`${ri}-${vi}`} cx={100 + v.x * 720 / 1024} cy={720 - v.y * 720 / 1024} r="5"/>))}{effect?.flowLines.map((line, i) => <polyline key={i} points={line.map(screen).join(' ')}/>)}<polyline points={stroke.map(screen).join(' ')}/></svg>;
  const toolbar = <div className="canvas-tools">{Object.entries({ move: '移动 V', scale: '缩放', rotate: '旋转', vertices: '顶点', route: '画路线', flow: '水流导线', lasso: '自由套索', rect: '矩形区域' }).map(([key, name]) => <button key={key} disabled={locked || shot.studio !== 'pixi'} className={tool === key ? 'active' : ''} onClick={() => choose(key as Tool)}>{name}</button>)}<button disabled={!actor || locked} onClick={() => change(s => { const a = s.actors.find(a => a.id === selected)!; a.flipX = !a.flipX; })}>镜像</button>{stroke.length > 0 && <button onClick={commitStroke}>完成线段</button>}</div>;
  return { display, toolbar, overlay, down, move, up, tool, choose };
}
