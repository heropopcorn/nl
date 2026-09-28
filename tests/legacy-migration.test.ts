import { describe, expect, it } from 'vitest';
import { appendLegacyScenes, matchLegacyFile, migrateLegacyScene, normalizeLegacyScene } from '../packages/core/legacy';
import { projectSchema, sample } from '../packages/core';
import { mediaSchema } from '../packages/core/media';
import { flowDirection } from '../packages/core/flow';
import { lightningFlash } from '../packages/studios/weather';

const base = () => ({ schema_version: 2, scene_id: 'old', name: '空场景', background: { source: 'blank', pixel_size: [768, 512], fill_color: [0.2, 0.4, 0.6, 1] } });
describe('legacy migration repairs', () => {
  it('imports blank colors, world routes and blue characters without losing extensions', () => {
    const raw = { ...base(), camera: { zoom: 2 }, actors: [{ id: 'a', character_id: 'farmer_blue_placeholder', start_uv: [0.5, 0.25], route: { points_uv: [[0.5, 0.25], [0.7, 0.25]], collision_mode: 'world' } }] };
    const before = structuredClone(raw), { shot, warnings } = migrateLegacyScene(raw);
    expect(shot.blank).toBe(true); expect(shot.blankColor).toBe('#336699');
    expect(shot.actors[0]).toMatchObject({ assetId: 'farmer_blue', collision: 'stop', start: { x: 768, y: 768 } });
    expect(warnings.some(w => w.includes('区域碰撞停止'))).toBe(true);
    expect(shot.legacySource).toEqual(raw); expect(raw).toEqual(before);
    expect(projectSchema.parse({ ...sample, shots: [{ ...shot, sceneId: 'scene-1' }] }).shots[0].legacySource).toEqual(raw);
  });
  it('uses non-square custom image dimensions and bottom-left vector direction', () => {
    const asset = mediaSchema.parse({ id: 'uploaded', name: '牌子', category: 'houses', width: 300, height: 120, src: '/art/signboard.png' });
    const raw = { ...base(), elements: [{ id: 'e', asset_id: 'custom', position_uv: [0.2, 0.4], sort_offset_y: 10 }], water_regions: [{ id: 'w', shape: 'rect', rect_uv: [0, 0, 0.4, 0.3], flow_dir: [0, 1] }] };
    const { shot } = migrateLegacyScene(raw, null, { custom: 'uploaded' }, [asset]);
    expect(shot.actors[0]).toMatchObject({ width: 600, height: 240 });
    expect(shot.actors[0].sortY).toBeCloseTo(0.6 * 1024 - 20);
    expect(flowDirection({ x: 0, y: 0 }, [], shot.effects[0].flowVector!)).toEqual({ x: 0, y: -1 });
    expect(() => migrateLegacyScene(raw, null, { custom: 'uploaded' })).toThrow('真实图片尺寸');
  });
  it('recognizes actual SceneLayout v1 without confusing Web v1 documents', () => {
    const raw = { version: 1, ground: '', path_uv: [[0.1, 0.2], [0.4, 0.5]], path_loop: true, path_ignore_collision: false, hide_baked_props: true };
    expect(normalizeLegacyScene(sample)).toEqual(sample);
    const { shot } = migrateLegacyScene(raw);
    expect(shot.backgroundAssetId).toBe('legacy_village');
    expect(shot.actors[0]).toMatchObject({ loop: true, collision: 'stop' });
    expect(shot.actors[0].route).toHaveLength(2);
    expect(shot.legacySource).toEqual(raw);
  });
  it('preserves chapter/scene order with fresh IDs and rejects duplicate sources', () => {
    const p = structuredClone(sample), a = migrateLegacyScene({ ...base(), name: 'A' }).shot, b = migrateLegacyScene({ ...base(), name: 'B' }).shot;
    const entries = [{ sourceId: 'a', shot: a }, { sourceId: 'b', shot: b }];
    appendLegacyScenes(p, entries, { chapters: [{ id: 'two', name: '第二章', order: 2 }, { id: 'one', name: '第一章原版', order: 1 }], scenes: [{ id: 'a', chapter_id: 'two', order: 0 }, { id: 'b', chapter_id: 'one', order: 1 }] });
    expect(p.chapters.slice(-2).map(c => c.name)).toEqual(['第一章原版', '第二章']);
    expect(p.shots.slice(-2).map(s => s.name)).toEqual(['B', 'A']);
    expect(p.scenes.at(-2)!.chapterId).toBe(p.chapters.at(-2)!.id);
    expect(projectSchema.safeParse(p).success).toBe(true);
    expect(() => appendLegacyScenes(p, [entries[0], entries[0]])).toThrow('ID 重复');
  });
  it('uses relative paths and never guesses ambiguous basenames', () => {
    const files = ['root/a/background.png', 'root/b/background.png'];
    expect(matchLegacyFile(files, 'root/b/scene.json', 'background.png')).toBe(1);
    expect(matchLegacyFile(files, 'scene.json', 'background.png')).toBeNull();
    expect(matchLegacyFile(['background.png', 'background.png'], 'scene.json', 'background.png')).toBeNull();
    expect(matchLegacyFile(files, 'root/b/scene.json', '../a/background.png')).toBeNull();
    expect(() => migrateLegacyScene({ ...base(), background: { source: 'preset', preset_id: 'unknown' } })).toThrow('背景 PNG');
    expect(migrateLegacyScene({ ...base(), background: { source: 'preset', preset_id: 'unknown' } }, 'chosen').shot.backgroundAssetId).toBe('chosen');
  });
  it('randomizes later lightning events while keeping absolute-frame determinism', () => {
    expect(lightningFlash(0, 8)).toBe(1);
    expect(lightningFlash(240, 8)).toBe(0);
    const values = Array.from({ length: 240 }, (_, f) => lightningFlash(240 + f, 8));
    expect(Math.max(...values)).toBeGreaterThan(0.6);
    expect(lightningFlash(277, 8)).toBe(lightningFlash(277, 8));
  });
});
