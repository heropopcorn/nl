import type { Shot } from '../core';
import type { LivePreview } from './index';

/** Ephemeral editor clock. Never writes animation time into the project. */
export class LiveEffectClock {
  private started = new Map<string, number>();
  private scene = '';
  sample(shot: Shot, now: number): LivePreview {
    if (shot.id !== this.scene) { this.started.clear(); this.scene = shot.id; }
    const active = new Set(shot.effects.filter(e => e.enabled).map(e => e.id));
    if (shot.lightning.enabled) active.add('@lightning');
    active.add('@scene');
    for (const key of this.started.keys()) if (!active.has(key)) this.started.delete(key);
    for (const key of active) if (!this.started.has(key)) this.started.set(key, now);
    const age = (id: string) => Math.max(0, (now - (this.started.get(id) ?? now)) * 30 / 1000);
    return { environmentFrame: age('@scene'), lightningFrame: age('@lightning'), effectFrames: Object.fromEntries(shot.effects.map(e => [e.id, age(e.id) + (e.type === 'rain' ? 60 : 0)])) };
  }
}
