import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PointerIntent } from '../apps/director-web/src/pointer-intent';

describe('canvas pointer intent', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('fires one long press at 500 ms with its latest CSS position', () => {
    const intent = new PointerIntent(), hold = vi.fn();
    intent.begin(1, { x: 100, y: 200 }, hold);
    intent.move(1, { x: 104, y: 203 });
    vi.advanceTimersByTime(499); expect(hold).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(hold).toHaveBeenCalledExactlyOnceWith({ x: 104, y: 203 });
    vi.advanceTimersByTime(1000); expect(hold).toHaveBeenCalledTimes(1);
    expect(intent.finish(1)).toMatchObject({ held: true, moved: false });
  });

  it('allows eight pixels of jitter but cancels a longer movement permanently', () => {
    const intent = new PointerIntent(), hold = vi.fn();
    intent.begin(1, { x: 0, y: 0 }, hold);
    intent.move(1, { x: 8, y: 0 });
    vi.advanceTimersByTime(500); expect(hold).toHaveBeenCalledTimes(1);
    hold.mockClear();
    intent.begin(2, { x: 0, y: 0 }, hold);
    intent.move(2, { x: 6, y: 6 });
    intent.move(2, { x: 0, y: 0 });
    vi.advanceTimersByTime(1000); expect(hold).not.toHaveBeenCalled();
    expect(intent.finish(2)).toMatchObject({ moved: true, held: false });
  });

  it('finishing a tap cancels its hold without changing another pointer', () => {
    const intent = new PointerIntent(), hold = vi.fn();
    intent.begin(5, { x: 20, y: 30 }, hold);
    intent.move(99, { x: 400, y: 400 });
    expect(intent.finish(99)).toBeNull();
    vi.advanceTimersByTime(200);
    expect(intent.finish(5)).toEqual({ id: 5, start: { x: 20, y: 30 }, point: { x: 20, y: 30 }, moved: false, held: false });
    vi.advanceTimersByTime(1000); expect(hold).not.toHaveBeenCalled();
    expect(intent.current).toBeNull();
  });

  it('cancel supports second fingers, pointercancel, blur, hidden pages and unmount', () => {
    const intent = new PointerIntent(), hold = vi.fn();
    intent.begin(1, { x: 0, y: 0 }, hold);
    vi.advanceTimersByTime(400); intent.cancel();
    vi.advanceTimersByTime(1000);
    expect(hold).not.toHaveBeenCalled(); expect(intent.current).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a fresh press replaces an earlier timer and never opens its old context', () => {
    const intent = new PointerIntent(), old = vi.fn(), current = vi.fn();
    intent.begin(1, { x: 1, y: 1 }, old); vi.advanceTimersByTime(400);
    intent.begin(2, { x: 2, y: 2 }, current); vi.advanceTimersByTime(100);
    expect(old).not.toHaveBeenCalled(); expect(current).not.toHaveBeenCalled();
    vi.advanceTimersByTime(400);
    expect(current).toHaveBeenCalledExactlyOnceWith({ x: 2, y: 2 });
    expect(old).not.toHaveBeenCalled();
  });

  it('leaving the canvas rejects both hold and tap even if the pointer returns', () => {
    const intent = new PointerIntent(), hold = vi.fn();
    intent.begin(1, { x: 10, y: 10 }, hold); intent.leave();
    intent.move(1, { x: 10, y: 10 }); vi.advanceTimersByTime(1000);
    expect(hold).not.toHaveBeenCalled();
    expect(intent.finish(1)).toMatchObject({ moved: true, held: false });
  });

  it('tracks presses without a timer when long press is disabled', () => {
    const intent = new PointerIntent(), point = { x: 30, y: 40 };
    intent.begin(1, point); point.x = 999;
    expect(vi.getTimerCount()).toBe(0);
    expect(intent.finish(1)?.point).toEqual({ x: 30, y: 40 });
  });
});
