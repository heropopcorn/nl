import { afterEach, describe, expect, it, vi } from 'vitest';
import { RepeatTapIntent, type CanvasTapTarget } from '../apps/director-web/src/repeat-tap-intent';

const target = (key = 'water:0:geometry-a', selected = true): CanvasTapTarget => ({ key, selected });

describe('repeat region tap intent', () => {
  afterEach(() => vi.useRealTimers());

  it('first selects, then opens only when the same region was already selected before the next press', () => {
    const intent = new RepeatTapIntent();
    intent.begin(target(undefined, false));
    expect(intent.finish(target())).toEqual({ source: 'select', target: target(undefined, false) });
    intent.begin(target());
    expect(intent.finish(target())).toEqual({ source: 'tap', target: target() });
  });

  it('even a region selected elsewhere needs its first completed canvas tap', () => {
    const intent = new RepeatTapIntent();
    intent.begin(target()); expect(intent.finish(target())?.source).toBe('select');
    intent.begin(target()); expect(intent.finish(target())?.source).toBe('tap');
  });

  it('repeat tap has no double-click timing window', () => {
    vi.useFakeTimers();
    const intent = new RepeatTapIntent();
    intent.begin(target()); expect(intent.finish(target())?.source).toBe('select');
    vi.advanceTimersByTime(3_600_000);
    intent.begin(target()); expect(intent.finish(target())?.source).toBe('tap');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('pointer-down selection changes cannot turn a first or unselected tap into a repeat', () => {
    const intent = new RepeatTapIntent(), before = target(undefined, false);
    intent.begin(before); before.selected = true;
    expect(intent.finish(target())).toEqual({ source: 'select', target: target(undefined, false) });
    intent.begin(target(undefined, false));
    expect(intent.finish(target())?.source).toBe('select');
  });

  it('a different target selects first even when that target was already selected', () => {
    const intent = new RepeatTapIntent(), a = target('a'), b = target('b');
    intent.begin(a); intent.finish(a);
    intent.begin(b); expect(intent.finish(b)?.source).toBe('select');
    intent.begin(a); expect(intent.finish(a)?.source).toBe('select');
    intent.begin(a); expect(intent.finish(a)?.source).toBe('tap');
  });

  it('blank and actor taps clear the sequence and never manufacture a region at release', () => {
    const intent = new RepeatTapIntent();
    intent.begin(target()); intent.finish(target());
    intent.begin(null); expect(intent.finish(target())).toBeNull();
    intent.begin(target()); expect(intent.finish(target())?.source).toBe('select');
  });

  it('rejects a moved, deleted or reindexed target instead of falling back to another region', () => {
    const intent = new RepeatTapIntent();
    intent.begin(target()); intent.finish(target());
    intent.begin(target()); expect(intent.finish(target('other-region'))).toBeNull();
    intent.begin(target()); expect(intent.finish(target())?.source).toBe('select');
    intent.begin(target()); expect(intent.finish(null)).toBeNull();
    intent.begin(target()); expect(intent.finish(target())?.source).toBe('select');
  });

  it.each(['drag', 'pinch', 'scope', 'disabled', 'pointercancel', 'blur', 'hidden', 'menu'])('%s resets both the previous tap and the active press', () => {
    const intent = new RepeatTapIntent();
    intent.begin(target()); intent.finish(target());
    intent.begin(target()); intent.reset();
    expect(intent.candidate).toBeNull(); expect(intent.finish(target())).toBeNull();
    intent.begin(target()); expect(intent.finish(target())?.source).toBe('select');
  });

  it('geometry signatures distinguish a replacement region even at the same array index', () => {
    const intent = new RepeatTapIntent();
    intent.begin(target()); intent.finish(target());
    const changed = target('water:0:geometry-b');
    intent.begin(changed); expect(intent.finish(changed)?.source).toBe('select');
  });

  it('uses the captured selection state even when tool picking changes an overlap on release', () => {
    const intent = new RepeatTapIntent();
    intent.begin(target()); intent.finish(target());
    intent.begin(target());
    expect(intent.finish(target(undefined, false))).toEqual({ source: 'tap', target: target() });
  });
});
