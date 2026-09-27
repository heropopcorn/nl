import { describe, expect, it } from 'vitest';
import { effectSchema, projectSchema, sample } from '../packages/core';
import { depthCompare, particles } from '../packages/studios/environment';
describe('environment document and clock', () => {
  it('loads old documents with safe defaults and no weather added', () => {
    const old = JSON.parse(JSON.stringify(sample));
    old.shots.forEach((s: any) => { delete s.effects; delete s.lighting; s.actors.forEach((a: any) => delete a.layer); });
    const upgraded = projectSchema.parse(old);
    expect(upgraded.shots[0].effects).toEqual([]);
    expect(upgraded.shots[0].lighting.time).toBe('noon');
    expect(upgraded.shots[0].actors[0].layer).toBe(0);
  });
  it('evaluates particles deterministically, with speed zero freezing animation', () => {
    const effect = effectSchema.parse({ id: 'rain', name: '雨', type: 'rain', regions: [{ x: 0, y: 0, width: 1536, height: 1024 }] });
    const first = particles(effect, 65, 0);
    expect(particles(effect, 160, 0)).not.toEqual(first);
    expect(particles(effect, 65, 0)).toEqual(first);
    effect.speed = 0;
    expect(particles(effect, 900, 0)).toEqual(particles(effect, 0, 0));
    effect.intensity = 0; expect(particles(effect, 0, 0)).toEqual([]);
  });
  it('sorts layer first then logical bottom-left Y from back to front', () => {
    const entries = [{ layer: 0, y: 300 }, { layer: 1, y: 900 }, { layer: 0, y: 700 }];
    expect(entries.sort(depthCompare)).toEqual([{ layer: 0, y: 700 }, { layer: 0, y: 300 }, { layer: 1, y: 900 }]);
  });
  it('rejects invalid bounds and duplicate environment IDs', () => {
    expect(effectSchema.safeParse({ id: 'x', name: 'x', type: 'fog', regions: [{ x: 1500, y: 0, width: 100, height: 100 }] }).success).toBe(false);
    const p = structuredClone(sample);
    p.shots[0].effects.push(effectSchema.parse({ id: 'hero', name: 'x', type: 'fog', regions: [{ x: 0, y: 0, width: 100, height: 100 }] }));
    expect(projectSchema.safeParse(p).success).toBe(false);
  });
});
