import { useEffect, useRef, useState, type MouseEvent, type PointerEvent, type RefObject } from 'react';
import { PointerIntent } from './pointer-intent';
import { RepeatTapIntent, type CanvasTapTarget } from './repeat-tap-intent';
export type { CanvasTapTarget } from './repeat-tap-intent';
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
export type CanvasNavigationOptions = {
  contextEnabled?: boolean;
  tapContextEnabled?: boolean;
  onContextMenu?: (point: Position, source: 'context' | 'tap' | 'select', tapTarget?: CanvasTapTarget) => void;
  /** Read before tools.down selects anything. A supplied missing preferredKey
   * must return null, not fall back to a different region after a document edit. */
  getTapTarget?: (point: Position, preferredKey?: string) => CanvasTapTarget | null;
  /** Change with scene / active pane / tool, not on every render. */
  scopeKey?: string;
};
const clampZoom = (zoom: number) => Math.max(0.25, Math.min(4, zoom));

export function useCanvasNavigation(tools: Tools, canvas: RefObject<HTMLCanvasElement | null>, options: CanvasNavigationOptions = {}) {
  const [view, setView] = useState<View>({ zoom: 1, pan: { x: 0, y: 0 } });
  const [panMode, setPanMode] = useState(false);
  const current = useRef(view); current.current = view;
  const latest = useRef({ tools, options, canvas, panMode }); latest.current = { tools, options, canvas, panMode };
  const pointers = useRef(new Map<number, Position>());
  const gesture = useRef<{ center: Position; distance: number; view: View } | null>(null);
  const panPointer = useRef<{ id: number; point: Position } | null>(null);
  const interrupted = useRef(false), rollback = useRef<(() => void) | null>(null);
  const pendingTap = useRef<number | null>(null);
  const intent = useRef(new PointerIntent());
  const repeatTap = useRef(new RepeatTapIntent());
  const pressScope = useRef(options.scopeKey);
  const contextConsumed = useRef(false), suppressClick = useRef(false), suppressNativeContext = useRef(false);
  const update = (next: View) => { current.current = next; setView(next); };
  const position = (e: { clientX: number; clientY: number }) => ({ x: e.clientX, y: e.clientY });
  const ownsEvent = (e: { currentTarget: HTMLElement; target: EventTarget }) => e.target instanceof Node && e.currentTarget.contains(e.target);
  const contextAllowed = () => latest.current.options.contextEnabled !== false && !!latest.current.options.onContextMenu;

  function abandon(restoreDraft: boolean, resetPointers = false, resetRepeat = true) {
    intent.current.cancel();
    if (resetRepeat) repeatTap.current.reset();
    latest.current.tools.cancel();
    if (restoreDraft) rollback.current?.();
    rollback.current = null; pendingTap.current = null;
    gesture.current = null; panPointer.current = null;
    if (resetPointers) pointers.current.clear();
    // Keep this until all fingers lift (or a fresh pointer-down) so opening a
    // modal / switching tools cannot cause the old release to commit a transform.
    interrupted.current = true;
  }

  function openContext(point: Position, source: 'context' | 'tap' | 'select', tapTarget?: CanvasTapTarget) {
    if (!contextAllowed()) return;
    // A first tap only selects. Keep its completed-tap identity for the next tap;
    // opening an actual menu resets the sequence, as do every cancellation below.
    abandon(true, false, source !== 'select');
    contextConsumed.current = true; suppressClick.current = true; suppressNativeContext.current = true;
    latest.current.options.onContextMenu?.(point, source, tapTarget);
  }

  useEffect(() => {
    // A new scope must never restore draft points from a previous scene. Tools
    // own scene/draft resets; navigation only drops the pending pointer action.
    abandon(false, true);
  }, [options.scopeKey, options.contextEnabled, options.tapContextEnabled, tools.tapOnly, panMode]);
  useEffect(() => {
    const blur = () => abandon(true, true);
    const visibility = () => { if (document.hidden || document.visibilityState === 'hidden') blur(); };
    const key = (event: KeyboardEvent) => {
      if (document.querySelector('dialog[open]') || (event.target instanceof HTMLElement && (event.target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)))) return;
      if (event.key.toLowerCase() === 'v' || event.key === 'Escape' || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 't')) {
        abandon(true, true); latest.current.panMode = false; setPanMode(false);
      }
    };
    window.addEventListener('keydown', key); window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      intent.current.cancel();
      window.removeEventListener('keydown', key); window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);

  function measure(e: PointerEvent<HTMLElement>) {
    const [a, b] = [...pointers.current.values()], rect = e.currentTarget.getBoundingClientRect();
    return { center: { x: (a.x + b.x) / 2 - rect.left - rect.width / 2, y: (a.y + b.y) / 2 - rect.top - rect.height / 2 }, distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)) };
  }
  function down(e: PointerEvent<HTMLElement>) {
    if (!ownsEvent(e)) return;
    // Right clicks are handled only by contextmenu, never by selection or up().
    if (e.button !== 0 && e.button !== 1) { intent.current.cancel(); repeatTap.current.reset(); suppressNativeContext.current = false; return; }
    if (!pointers.current.size) {
      interrupted.current = false; contextConsumed.current = false;
      suppressClick.current = false; suppressNativeContext.current = false;
    }
    const active = latest.current;
    pressScope.current = active.options.scopeKey;
    if (e.pointerType === 'touch') {
      e.currentTarget.setPointerCapture(e.pointerId);
      pointers.current.set(e.pointerId, position(e));
      if (contextConsumed.current) return;
      if (pointers.current.size >= 2) {
        intent.current.cancel(); repeatTap.current.reset();
        // The first finger may have started a drag or placed a lasso point. Undo
        // only that in-progress interaction, never a previously committed edit.
        active.tools.cancel(); rollback.current?.(); rollback.current = null;
        interrupted.current = true; panPointer.current = null; pendingTap.current = null;
        gesture.current = { ...measure(e), view: current.current };
        return;
      }
      if (interrupted.current) return;
    }
    if (e.button === 1 || (active.panMode && e.button === 0)) {
      intent.current.cancel(); repeatTap.current.reset();
      e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
      panPointer.current = { id: e.pointerId, point: position(e) }; return;
    }
    if (e.pointerType === 'touch' && active.options.tapContextEnabled && contextAllowed() && active.options.getTapTarget) {
      repeatTap.current.begin(active.options.getTapTarget(position(e)));
    } else repeatTap.current.reset();
    rollback.current = active.tools.checkpoint();
    const scope = active.options.scopeKey;
    intent.current.begin(e.pointerId, position(e), e.pointerType === 'touch' && contextAllowed() ? point => {
      if (scope === latest.current.options.scopeKey && pointers.current.size === 1 && pointers.current.has(e.pointerId) && !interrupted.current && !latest.current.panMode && !panPointer.current) openContext(point, 'context');
    } : undefined);
    if (e.pointerType === 'touch' && active.tools.tapOnly) { pendingTap.current = e.pointerId; return; }
    active.tools.down(e, active.canvas);
  }
  function move(e: PointerEvent<HTMLElement>) {
    if (!ownsEvent(e)) return;
    if (pressScope.current !== latest.current.options.scopeKey && (intent.current.current || pointers.current.size || panPointer.current)) { abandon(false, true); return; }
    intent.current.move(e.pointerId, position(e));
    const bounds = e.currentTarget.getBoundingClientRect();
    if (e.clientX < bounds.left || e.clientX > bounds.right || e.clientY < bounds.top || e.clientY > bounds.bottom) intent.current.leave();
    if (intent.current.current?.moved) repeatTap.current.reset();
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, position(e));
    if (gesture.current && pointers.current.size >= 2) {
      const next = measure(e), base = gesture.current, zoom = clampZoom(base.view.zoom * next.distance / base.distance), ratio = zoom / base.view.zoom;
      update({ zoom, pan: { x: next.center.x - (base.center.x - base.view.pan.x) * ratio, y: next.center.y - (base.center.y - base.view.pan.y) * ratio } });
    } else if (panPointer.current?.id === e.pointerId) {
      const prev = panPointer.current.point;
      update({ ...current.current, pan: { x: current.current.pan.x + e.clientX - prev.x, y: current.current.pan.y + e.clientY - prev.y } });
      panPointer.current.point = position(e);
    } else if (!interrupted.current && !latest.current.panMode) latest.current.tools.move(e, latest.current.canvas);
  }
  function end(e: PointerEvent<HTMLElement>, cancelled = false) {
    if (!ownsEvent(e)) return;
    // Releasing the right mouse button must not commit a left-button preview.
    if (!cancelled && e.button !== 0 && panPointer.current?.id !== e.pointerId) return;
    intent.current.move(e.pointerId, position(e));
    const press = intent.current.finish(e.pointerId);
    const scopeChanged = pressScope.current !== latest.current.options.scopeKey;
    if (cancelled || scopeChanged) abandon(!scopeChanged);
    else if (!contextConsumed.current && !interrupted.current && !panPointer.current) {
      const tap = e.pointerType === 'touch' && latest.current.options.tapContextEnabled && !latest.current.panMode && press && !press.moved && !press.held && contextAllowed();
      if (tap && latest.current.options.getTapTarget) {
        const candidate = repeatTap.current.candidate;
        // Re-resolve the captured identity, not the pointer-down selection now
        // exposed by React. Overlapping regions may have changed that selection.
        const currentTarget = candidate ? latest.current.options.getTapTarget(position(e), candidate.key) : null;
        const completed = repeatTap.current.finish(currentTarget);
        if (completed) openContext(position(e), completed.source, completed.target);
        else abandon(true); // Blank / picture taps retain tools.down's selection.
      } else if (tap) openContext(position(e), 'tap'); // Backward-compatible callers.
      else {
        repeatTap.current.reset();
        if (pendingTap.current === e.pointerId) latest.current.tools.down(e, latest.current.canvas);
        latest.current.tools.up(e);
      }
    }
    pendingTap.current = null;
    pointers.current.delete(e.pointerId); gesture.current = null; panPointer.current = null; rollback.current = null;
    if (!pointers.current.size) { interrupted.current = false; contextConsumed.current = false; }
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }
  function contextMenu(e: MouseEvent<HTMLElement>) {
    if (!ownsEvent(e)) return;
    // A browser can emit its native touch contextmenu after our 500 ms callback
    // has opened a dialog and disabled new context actions. Still swallow it.
    if (suppressNativeContext.current) { e.preventDefault(); e.stopPropagation(); return; }
    if (!contextAllowed()) return;
    e.preventDefault(); e.stopPropagation();
    if (suppressNativeContext.current || pointers.current.size > 1 || gesture.current || panPointer.current || (pointers.current.size > 0 && (latest.current.panMode || intent.current.current?.moved))) return;
    openContext(position(e), 'context');
  }
  return {
    ...view, panMode, setPanMode: (value: boolean) => { abandon(true, true); latest.current.panMode = value; setPanMode(value); },
    fit: () => { abandon(true, true); update({ zoom: 1, pan: { x: 0, y: 0 } }); },
    zoomTo: (zoom: number, anchor: Position = { x: 0, y: 0 }) => {
      abandon(true, true);
      const next = clampZoom(zoom), previous = current.current;
      update({ zoom: next, pan: { x: anchor.x - (anchor.x - previous.pan.x) * next / previous.zoom, y: anchor.y - (anchor.y - previous.pan.y) * next / previous.zoom } });
    },
    handlers: {
      onPointerDownCapture: (e: PointerEvent<HTMLElement>) => { if (ownsEvent(e) && (e.pointerType === 'touch' || panMode)) { e.stopPropagation(); down(e); } },
      onPointerDown: down,
      onPointerMove: move,
      onPointerUp: (e: PointerEvent<HTMLElement>) => end(e),
      onPointerCancel: (e: PointerEvent<HTMLElement>) => end(e, true),
      onPointerLeave: () => {
        // Touch browsers emit leave after every completed tap. Only an active
        // press leaving the viewport interrupts repeat-selection intent.
        if (intent.current.current) repeatTap.current.reset();
        intent.current.leave();
      },
      onContextMenu: contextMenu,
      onClickCapture: (e: MouseEvent<HTMLElement>) => {
        // A portalled menu may still be a React descendant of the viewport. Only
        // swallow the touch's synthetic canvas click, never a menu button click.
        if (suppressClick.current && ownsEvent(e)) { e.preventDefault(); e.stopPropagation(); suppressClick.current = false; }
      },
    }
  };
}
