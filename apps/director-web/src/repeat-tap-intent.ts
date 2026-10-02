export type CanvasTapTarget = { key: string; selected: boolean };
export type CompletedTap = { source: 'select' | 'tap'; target: CanvasTapTarget };

/** Repeat selection, not a timed double-click: an interrupted gesture resets it. */
export class RepeatTapIntent {
  private previous: string | null = null;
  private pressed: CanvasTapTarget | null = null;

  get candidate() { return this.pressed; }

  begin(target: CanvasTapTarget | null) {
    this.pressed = target ? { ...target } : null;
    if (!target || target.key !== this.previous) this.previous = null;
  }

  finish(current: CanvasTapTarget | null): CompletedTap | null {
    const target = this.pressed;
    this.pressed = null;
    if (!target || !current || target.key !== current.key) { this.reset(); return null; }
    const source = this.previous === target.key && target.selected ? 'tap' : 'select';
    this.previous = target.key;
    return { source, target };
  }

  reset() { this.previous = null; this.pressed = null; }
}
