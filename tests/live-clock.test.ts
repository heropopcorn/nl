import { describe, expect, it } from 'vitest';
import { sample, effectSchema } from '../packages/core';
import { LiveEffectClock } from '../packages/studios/live-clock';
describe('live editor effect clock', () => {
  it('runs without timeline edits and does not reset on parameter changes', () => {
    const clock = new LiveEffectClock(), shot = structuredClone(sample.shots[0]);
    shot.effects.push(effectSchema.parse({ id: 'rain', name: '雨', type: 'rain', regions: [] }));
    expect(clock.sample(shot, 100).effectFrames.rain).toBe(60);
    shot.effects[0].intensity = 0.7;
    expect(clock.sample(shot, 1100).effectFrames.rain).toBe(90);
    shot.effects.push(effectSchema.parse({ id: 'flash', name: '雷', type: 'lightning', regions: [] }));
    expect(clock.sample(shot, 1100).effectFrames.flash).toBe(0);
    expect(clock.sample(shot, 2100).effectFrames.rain).toBe(120);
    shot.effects[0].enabled = false; clock.sample(shot, 2200);
    shot.effects[0].enabled = true;
    expect(clock.sample(shot, 2300).effectFrames.rain).toBe(60);
    expect(shot.actors).toEqual(sample.shots[0].actors);
  });
  it('allows an element to retain no regions and resets transient clocks only on scene change', () => {
    const clock = new LiveEffectClock(), shot = structuredClone(sample.shots[0]);
    expect(effectSchema.safeParse({ id: 'water', name: '空水域', type: 'water', regions: [] }).success).toBe(true);
    clock.sample(shot, 0); expect(clock.sample(shot, 1000).environmentFrame).toBe(30);
    shot.id = 'other'; expect(clock.sample(shot, 1000).environmentFrame).toBe(0);
  });
});
