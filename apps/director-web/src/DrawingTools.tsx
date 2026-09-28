import { useEffect, useState, type PointerEvent, type RefObject } from 'react';
import { rectSchema, type Shot } from '../../../packages/core';
import { clientToLogical, polygonBounds, type Point } from '../../../packages/core/geometry';
type Draft = { effectId: string; shotId: string; replace?: number; points: Point[] };
export function useRegionDrawing({ shot, selected, change, notify, pause }: { shot: Shot; selected: string; change: (fn: (s: Shot) => void) => void; notify: (s: string) => void; pause: () => void }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  useEffect(() => { setDraft(null); }, [shot.id, selected]);
  const effectExists = shot.effects.some(e => e.id === selected);
  useEffect(() => { if (!effectExists) setDraft(null); }, [effectExists]);
  function start(replace?: number) {
    if (!shot.effects.some(e => e.id === selected)) return;
    pause(); setDraft({ effectId: selected, shotId: shot.id, replace, points: [] });
    notify('多边形工具：左键逐点绘制，点击首点或 Enter 闭合；中键可随时平移，Esc 退出');
  }
  function finish() {
    if (!draft || draft.shotId !== shot.id) return;
    const parsed = rectSchema.safeParse({ ...polygonBounds(draft.points), points: draft.points });
    if (!parsed.success) { notify('无法闭合：至少三个点，不可自交、共线或超出背景'); return; }
    const effect = shot.effects.find(e => e.id === draft.effectId);
    if (!effect || (draft.replace !== undefined && draft.replace >= effect.regions.length)) { notify('目标范围已改变，请重新选择范围绘制'); return; }
    if (draft.replace === undefined && effect.regions.length >= 12) { notify('每个元素最多 12 个范围'); return; }
    change(s => { const e = s.effects.find(e => e.id === draft.effectId)!; if (draft.replace !== undefined) e.regions[draft.replace] = parsed.data; else e.regions.push(parsed.data); });
    setDraft({ ...draft, replace: undefined, points: [] });
    notify('多边形已保存；工具保持选中，可继续画下一块范围，Esc 退出');
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!draft || (e.target instanceof HTMLElement && (e.target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)))) return;
      if (e.key === 'Escape') { e.preventDefault(); setDraft(null); }
      if (e.key === 'Enter') { e.preventDefault(); finish(); }
      if (e.key === 'Backspace') { e.preventDefault(); setDraft(d => d && { ...d, points: d.points.slice(0, -1) }); }
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  });
  function point(event: PointerEvent, canvas: RefObject<HTMLCanvasElement | null>) {
    if (!draft || event.button !== 0 || !canvas.current || draft.shotId !== shot.id) return;
    const p = clientToLogical({ x: event.clientX, y: event.clientY }, canvas.current.getBoundingClientRect());
    if (!p) return;
    event.preventDefault();
    if (draft.points.length >= 3 && Math.hypot(p.x - draft.points[0].x, p.y - draft.points[0].y) < 12) { finish(); return; }
    if (draft.points.length >= 128) { notify('最多 128 个顶点，请闭合或撤销顶点'); return; }
    setDraft({ ...draft, points: [...draft.points, { x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 }] });
  }
  const toolbar = draft && <div className="draw-toolbar"><b>多边形工具 · {draft.replace === undefined ? '新增范围' : `重绘范围 ${draft.replace + 1}`}</b><span>{draft.points.length} 个点</span><button disabled={draft.points.length < 3} onClick={finish}>闭合范围</button><button disabled={!draft.points.length} onClick={() => setDraft({ ...draft, points: draft.points.slice(0, -1) })}>撤销顶点</button><button onClick={() => setDraft(null)}>退出绘制</button></div>;
  const overlay = draft && <svg className="selection-overlay draft-overlay" viewBox="0 0 1280 720" aria-label="多边形草稿"><polyline points={draft.points.map(p => `${100 + p.x * 720 / 1024},${720 - p.y * 720 / 1024}`).join(' ')}/>{draft.points.map((p, i) => <circle key={i} cx={100 + p.x * 720 / 1024} cy={720 - p.y * 720 / 1024} r={i === 0 ? 7 : 4}/>)}</svg>;
  return { draft, start, point, toolbar, overlay };
}
