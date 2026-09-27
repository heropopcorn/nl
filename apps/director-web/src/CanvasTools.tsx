import { useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';
import { type Shot } from '../../../packages/core';
import { clientToLogical, containsPoint, polygonBounds, regionPoints, type Point } from '../../../packages/core/geometry';
import { actorPosition } from '../../../packages/core/routes';
type Tool = 'move' | 'scale' | 'rotate' | 'vertices' | 'route' | 'flow' | 'lasso' | 'rect';
const screen = (p: Point) => `${100 + p.x * 720 / 1024},${720 - p.y * 720 / 1024}`;
export function useCanvasTools({ shot, local, selected, select, change, pause, notify, locked }: { shot: Shot; local: number; selected: string; select: (id: string) => void; change: (fn: (s: Shot) => void) => void; pause: () => void; notify: (s: string) => void; locked: boolean }) {
  const [tool, setTool] = useState<Tool>('move'), [preview, setPreview] = useState<Shot | null>(null), [stroke, setStroke] = useState<Point[]>([]);
  const drag = useRef<{ start: Point; source: Shot; id: string; vertex?: [number, number]; stroke?: boolean } | null>(null);
  const previewRef = useRef<Shot | null>(null), strokeRef = useRef<Point[]>([]);
  useEffect(() => { setPreview(null); drag.current = null; setStroke([]); strokeRef.current = []; }, [shot.id]);
  useEffect(() => { if (drag.current?.id !== selected) { setPreview(null); previewRef.current = null; drag.current = null; } setStroke([]); strokeRef.current = []; }, [selected]);
  const actor = shot.actors.find(a => a.id === selected), effect = shot.effects.find(e => e.id === selected);
  function choose(t: Tool) { pause(); setTool(t); setStroke([]); strokeRef.current = []; drag.current = null; setPreview(null); }
  function commitStroke() {
    if (tool === 'route' && actor && strokeRef.current.length) change(s => { s.actors.find(a => a.id === actor.id)!.route = [actor.start, ...strokeRef.current]; });
    else if (tool === 'flow' && effect && strokeRef.current.length >= 2) change(s => { s.effects.find(e => e.id === effect.id)!.flowLines.push(strokeRef.current); });
    else if (tool === 'lasso' && effect && strokeRef.current.length >= 3) change(s => { s.effects.find(e => e.id === effect.id)!.regions.push({ ...polygonBounds(strokeRef.current), points: strokeRef.current }); });
    else if (tool === 'rect' && effect && strokeRef.current.length >= 3) change(s => { s.effects.find(e => e.id === effect.id)!.regions.push(polygonBounds(strokeRef.current)); });
    setStroke([]); strokeRef.current = [];
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (locked || (e.target instanceof HTMLElement && (e.target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)))) return;
      if (e.key.toLowerCase() === 'v') choose('move');
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 't') { e.preventDefault(); choose('scale'); }
      if (e.key === 'Escape') { drag.current = null; setPreview(null); setStroke([]); strokeRef.current = []; setTool('move'); }
      if (e.key === 'Enter' && strokeRef.current.length) { e.preventDefault(); commitStroke(); }
      if (actor && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) { e.preventDefault(); const step = e.shiftKey ? 10 : 1, dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0, dy = e.key === 'ArrowDown' ? -step : e.key === 'ArrowUp' ? step : 0; change(s => { const a = s.actors.find(a => a.id === actor.id)!; [a.start, a.end, ...a.route].forEach(p => { p.x += dx; p.y += dy; }); if (a.sortY !== null) a.sortY += dy; }); }
    }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  });
  function point(event: PointerEvent, canvas: RefObject<HTMLCanvasElement | null>) { return canvas.current ? clientToLogical({ x: event.clientX, y: event.clientY }, canvas.current.getBoundingClientRect()) : null; }
  function down(e: PointerEvent, canvas: RefObject<HTMLCanvasElement | null>) {
    if (locked || shot.studio !== 'pixi' || e.button !== 0) return;
    const p = point(e, canvas); if (!p) return; pause();
    if (tool === 'route' || tool === 'flow') { if ((tool === 'route' && !actor) || (tool === 'flow' && effect?.type !== 'water')) { notify('路线需选中图片元素，水流导线需选中水域'); return; } strokeRef.current = [...strokeRef.current, p].slice(0, 128); setStroke(strokeRef.current); return; }
    if (tool === 'lasso' || tool === 'rect') { if (!effect) { notify('请先选中环境元素'); return; } strokeRef.current = [p]; setStroke([p]); drag.current = { start: p, source: structuredClone(shot), id: selected, stroke: true }; e.currentTarget.setPointerCapture(e.pointerId); return; }
    let id = selected;
    if (tool === 'move') {
      const picked = [...shot.actors].filter(a => a.enabled).sort((a, b) => b.layer - a.layer || actorPosition(a, shot, local).y - actorPosition(b, shot, local).y).find(a => {
        const pos = actorPosition(a, shot, local), angle = -a.rotation * Math.PI / 180, dx = p.x - pos.x, dy = p.y - pos.y;
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
    const snap = (value: number) => shot.snap ? Math.round(value / shot.snap) * shot.snap : value;
    const dx = snap(p.x - d.start.x), dy = snap(p.y - d.start.y);
    if (a) {
      if (tool === 'vertices' && d.vertex) a.route[d.vertex[1]] = { x: snap(p.x), y: snap(p.y) };
      const center = actorPosition(a, d.source, local);
      if (tool === 'move') { [a.start, a.end, ...a.route].forEach(p => { p.x += dx; p.y += dy; }); if (a.sortY !== null) a.sortY += dy; }
      if (tool === 'scale') a.scale = Math.max(0.01, Math.min(20, a.scale * Math.hypot(p.x - center.x, p.y - center.y) / Math.max(1, Math.hypot(d.start.x - center.x, d.start.y - center.y))));
      if (tool === 'rotate') { a.rotation += (Math.atan2(p.y - center.y, p.x - center.x) - Math.atan2(d.start.y - center.y, d.start.x - center.x)) * 180 / Math.PI; if (e.shiftKey) a.rotation = Math.round(a.rotation / 15) * 15; }
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
  const shown = preview ?? shot, current = shown.actors.find(a => a.id === selected), pos = current ? actorPosition(current, shown, local) : null;
  const overlay = <svg className="selection-overlay tool-overlay" viewBox="0 0 1280 720">{current && pos && <g transform={`translate(${100 + pos.x * 720 / 1024} ${720 - pos.y * 720 / 1024}) rotate(${-current.rotation}) scale(${current.scale})`}><rect x={-current.width * 720 / 2048} y={-current.height * 720 / 1024} width={current.width * 720 / 1024} height={current.height * 720 / 1024}/>{[-1, 1].flatMap(x => [0, -current.height * 720 / 1024].map(y => <rect key={`${x},${y}`} x={x * current.width * 720 / 2048 - 4} y={y - 4} width="8" height="8"/>))}</g>}{tool === "vertices" && current?.route.map((p,i) => <circle key={i} cx={100+p.x*720/1024} cy={720-p.y*720/1024} r="5"/>)}{current?.routeVisible && <polyline points={current.route.map(screen).join(' ')}/>} {current?.sortY !== null && current?.sortY !== undefined && <line x1="100" x2="1180" y1={720 - current.sortY * 720 / 1024} y2={720 - current.sortY * 720 / 1024}/>}{tool === 'vertices' && effect?.regions.flatMap((r, ri) => regionPoints(r).map((v, vi) => <circle key={`${ri}-${vi}`} cx={100 + v.x * 720 / 1024} cy={720 - v.y * 720 / 1024} r="5"/>))}{effect?.flowLines.map((line, i) => <polyline key={i} points={line.map(screen).join(' ')}/>)}<polyline points={stroke.map(screen).join(' ')}/></svg>;
  const toolbar = <div className="canvas-tools">{Object.entries({ move: '移动 V', scale: '缩放', rotate: '旋转', vertices: '顶点', route: '画路线', flow: '水流导线', lasso: '自由套索', rect: '矩形区域' }).map(([key, name]) => <button key={key} disabled={locked || shot.studio !== 'pixi'} className={tool === key ? 'active' : ''} onClick={() => choose(key as Tool)}>{name}</button>)}<button disabled={!actor || locked} onClick={() => change(s => { const a = s.actors.find(a => a.id === selected)!; a.flipX = !a.flipX; })}>镜像</button>{stroke.length > 0 && <button onClick={commitStroke}>完成线段</button>}</div>;
  return { preview, toolbar, overlay, down, move, up, tool, choose };
}
