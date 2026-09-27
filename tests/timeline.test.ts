import { describe, expect, it } from 'vitest';
import { sample, locate, position, projectSchema, totalFrames } from '../packages/core';
describe('shared timeline', () => {
  it('maps exact boundaries across studios', () => {
    expect(totalFrames(sample)).toBe(540);
    expect(locate(sample, 179).local).toBe(179);
    expect(locate(sample, 180)).toMatchObject({ index: 1, local: 0 });
    expect(locate(sample, 360)).toMatchObject({ index: 2, local: 0, shot: { studio: 'motion' } });
    expect(locate(sample, 9999).local).toBe(179);
    expect(locate(sample, -9).local).toBe(0);
  });
  it('evaluates routes deterministically without accumulated time', () => {
    const actor = sample.shots[0].actors[0];
    expect(position(actor, 0, 180)).toEqual(actor.start);
    expect(position(actor, 179, 180)).toEqual(actor.end);
    const result = position(actor, 70, 180);
    position(actor, 170, 180);
    expect(position(actor, 70, 180)).toEqual(result);
  });
  it('rejects invalid documents', () => {
    expect(projectSchema.safeParse(sample).success).toBe(true);
    expect(projectSchema.safeParse({ ...sample, shots: [] }).success).toBe(false);
    expect(projectSchema.safeParse({ ...sample, version: 2 }).success).toBe(false);
    const copy = structuredClone(sample); copy.shots[0].frames = 0;
    expect(projectSchema.safeParse(copy).success).toBe(false);
  });
});
