export type PointerPosition = { x: number; y: number };
export type PointerPress = { id: number; start: PointerPosition; point: PointerPosition; moved: boolean; held: boolean };

/** Track a single press in CSS pixels, independent of canvas zoom or rendering. */
export class PointerIntent {
  current: PointerPress | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly delay = 500, private readonly tolerance = 8) {}

  begin(id: number, point: PointerPosition, hold?: (point: PointerPosition) => void) {
    this.cancel();
    const press = { id, start: { ...point }, point: { ...point }, moved: false, held: false };
    this.current = press;
    if (hold) this.timer = setTimeout(() => {
      this.timer = undefined;
      if (this.current !== press || press.moved) return;
      press.held = true;
      hold({ ...press.point });
    }, this.delay);
  }

  move(id: number, point: PointerPosition) {
    const press = this.current;
    if (!press || press.id !== id) return;
    press.point = { ...point };
    if (Math.hypot(point.x - press.start.x, point.y - press.start.y) > this.tolerance) this.leave();
  }

  /** Leaving the surface rejects both a hold and a tap, even after moving back. */
  leave() {
    this.clearTimer();
    if (this.current) this.current.moved = true;
  }

  finish(id: number) {
    if (this.current?.id !== id) return null;
    const press = this.current;
    this.cancel();
    return press;
  }

  cancel() { this.clearTimer(); this.current = null; }
  private clearTimer() { if (this.timer !== undefined) clearTimeout(this.timer); this.timer = undefined; }
}
