import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { sample, actorSchema, effectSchema, projectSchema } from '../packages/core';
import { actorPosition, alongPath } from '../packages/core/routes';
import { migrateLegacyScene } from '../packages/core/legacy';
describe('routes, collision, legacy import', () => {
  it('evaluates speed, loops, pauses and narrow obstacle collisions deterministically', () => {
    const shot = structuredClone(sample.shots[0]);
    const actor = actorSchema.parse({ id: 'a', name: 'a', start: { x: 0, y: 300 }, end: { x: 0, y: 300 }, route: [{ x: 0, y: 300 }, { x: 1000, y: 300 }], speed: 100, collision: 'stop' });
    shot.effects = [effectSchema.parse({ id: 'b', name: 'b', type: 'water', collisionEnabled: true, regions: [{ x: 100, y: 290, width: 1, height: 20 }] })];
    expect(actorPosition(actor, shot, 300).x).toBeCloseTo(99.9);
    shot.collisionEnabled = false; expect(actorPosition(actor, shot, 300).x).toBe(1000);
    actor.loop = true; expect(actorPosition(actor, shot, 360).x).toBeCloseTo(200);
    expect(alongPath([{ x: 1, y: 2 }, { x: 1, y: 2 }], 400)).toEqual({ x: 1, y: 2 });
  });
  it('migrates Godot v2 UVs, weather, routes, collision, props and cutouts', () => {
    const legacy = JSON.parse(readFileSync('video_game/docs/director-desk/scene-schema.example.json', 'utf8'));
    expect(() => migrateLegacyScene(legacy)).toThrow('背景图片');
    const { shot } = migrateLegacyScene(legacy, 'uploaded-bg');
    expect(shot.actors[0].start.x).toBeCloseTo(0.42 * 1536);
    expect(shot.actors[0].start.y).toBeCloseTo(0.58 * 1024);
    expect(shot.effects.filter(e => e.type === 'rain')).toHaveLength(2);
    expect(shot.effects[0].collisionEnabled).toBe(true);
    expect(shot.lightning.enabled).toBe(true);
    expect(shot.effects.some(e => e.type === 'cutout')).toBe(true);
  });
  it('loads older projects with new default media and scene organization', () => {
    const old = JSON.parse(JSON.stringify(sample)); delete old.assets; delete old.scenes; delete old.chapters; old.shots.forEach((s: any) => delete s.sceneId);
    const p = projectSchema.parse(old); expect(p.assets).toEqual([]); expect(p.scenes[0].chapterId).toBe(p.chapters[0].id);
  });
});
