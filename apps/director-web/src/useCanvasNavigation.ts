import { useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';
type Position = { x: number; y: number };
type View = { zoom: number; pan: Position };
type Tools = {
  down: (e: PointerEvent, canvas: RefObject<HTMLCanvasElement | null>) => void;
  move: (e: PointerEvent, canvas: RefObject<HTMLCanvasElement | null>) => void;
  up: (e: PointerEvent) => void;
  cancel: () => void;
  checkpoint: () => () => void;
  tapOnly: boolean;
};
const clampZoom = (zoom: number) => Math.max(0.25, Math.min(4, zoom));

export function useCanvasNavigation(tools: Tools, canvas: RefObject<HTMLCanvasElement | null>) {
  const [view, setView] = useState<View>({ zoom: 1, pan: { x: 0, y: 0 } });
  const [panMode, setPanMode] = useState(false);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (document.querySelector('dialog[open]') || (event.target instanceof HTMLElement && (event.target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)))) return;
      if (event.key.toLowerCase() === 'v' || event.key === 'Escape' || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 't')) setPanMode(false);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  const current = useRef(view); current.current = view;
  const pointers = useRef(new Map<number, Position>());
  const gesture = useRef<{ center: Position; distance: number; view: View } | null>(null);
  const panPointer = useRef<{ id: number; point: Position } | null>(null);
  const interrupted = useRef(false), rollback = useRef<(() => void) | null>(null);
  const pendingTap = useRef<number | null>(null);
  const update = (next: View) => { current.current = next; setView(next); };
  const position = (e: PointerEvent) => ({ x: e.clientX, y: e.clientY });
  function measure(e: PointerEvent<HTMLElement>) {
    const [a, b] = [...pointers.current.values()], rect = e.currentTarget.getBoundingClientRect();
    return { center: { x: (a.x + b.x) / 2 - rect.left - rect.width / 2, y: (a.y + b.y) / 2 - rect.top - rect.height / 2 }, distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)) };
  }
  function down(e: PointerEvent<HTMLElement>) {
    if (e.pointerType === 'touch') {
      e.currentTarget.setPointerCapture(e.pointerId);
      pointers.current.set(e.pointerId, position(e));
      if (pointers.current.size >= 2) {
        // The first finger may have started a drag or placed a lasso point. Undo
        // only that in-progress interaction, never a previously committed edit.
        tools.cancel(); rollback.current?.(); rollback.current = null;
        interrupted.current = true; panPointer.current = null;
        pendingTap.current = null;
        gesture.current = { ...measure(e), view: current.current };
        return;
      }
      if (interrupted.current) return;
      rollback.current = tools.checkpoint();
    }
    if (e.button === 1 || (panMode && e.button === 0)) {
      e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
      panPointer.current = { id: e.pointerId, point: position(e) }; return;
    }
    if (e.pointerType === 'touch' && tools.tapOnly) { pendingTap.current = e.pointerId; return; }
    tools.down(e, canvas);
  }
  function move(e: PointerEvent<HTMLElement>) {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, position(e));
    if (gesture.current && pointers.current.size >= 2) {
      const next = measure(e), base = gesture.current, zoom = clampZoom(base.view.zoom * next.distance / base.distance), ratio = zoom / base.view.zoom;
      update({ zoom, pan: { x: next.center.x - (base.center.x - base.view.pan.x) * ratio, y: next.center.y - (base.center.y - base.view.pan.y) * ratio } });
    } else if (panPointer.current?.id === e.pointerId) {
      const prev = panPointer.current.point;
      update({ ...current.current, pan: { x: current.current.pan.x + e.clientX - prev.x, y: current.current.pan.y + e.clientY - prev.y } });
      panPointer.current.point = position(e);
    } else if (!interrupted.current && !panMode) tools.move(e, canvas);
  }
  function end(e: PointerEvent<HTMLElement>, cancelled = false) {
    if (cancelled) { tools.cancel(); rollback.current?.(); }
    else if (!interrupted.current && !panPointer.current) {
      if (pendingTap.current === e.pointerId) tools.down(e, canvas);
      tools.up(e);
    }
    pendingTap.current = null;
    pointers.current.delete(e.pointerId); gesture.current = null; panPointer.current = null; rollback.current = null;
    if (!pointers.current.size) interrupted.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }
  return {
    ...view, panMode, setPanMode: (value: boolean) => { tools.cancel(); setPanMode(value); },
    fit: () => update({ zoom: 1, pan: { x: 0, y: 0 } }),
    zoomTo: (zoom: number, anchor: Position = { x: 0, y: 0 }) => {
      const next = clampZoom(zoom), previous = current.current;
      update({ zoom: next, pan: { x: anchor.x - (anchor.x - previous.pan.x) * next / previous.zoom, y: anchor.y - (anchor.y - previous.pan.y) * next / previous.zoom } });
    },
    handlers: {
      onPointerDownCapture: (e: PointerEvent<HTMLElement>) => { if (e.pointerType === 'touch' || panMode) { e.stopPropagation(); down(e); } },
      onPointerDown: down,
      onPointerMove: move,
      onPointerUp: (e: PointerEvent<HTMLElement>) => end(e),
      onPointerCancel: (e: PointerEvent<HTMLElement>) => end(e, true)
    }
  };
}
