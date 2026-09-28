import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { effectSchema, projectSchema, sample } from '../packages/core';
import { polygonBounds, validPolygon, containsPoint, clientToLogical, logicalToPixel } from '../packages/core/geometry';
import { resolveBackground, manifestSchema } from '../packages/core/backgrounds';
import { particles } from '../packages/studios/environment';
describe('background variants and logical coordinates', () => {
  it('discovers original and 24 seasonal images with actual dimensions', () => {
    const manifest = manifestSchema.parse(JSON.parse(readFileSync('apps/director-web/public/assets.json', 'utf8')));
    expect(Object.keys(manifest)).toHaveLength(26);
    expect(manifest.protagonist_village.default).toMatchObject({ width: 1536, height: 1024 });
    expect(manifest.village_school_winter_late.default.url).toContain('winter_late');
  });
  it('treats quality as a label, falls back, and maps real pixel dimensions independently', () => {
    const manifest = { protagonist_village: { default: { url: '/art/a.png', width: 1536, height: 1024 }, x2: { url: '/art/b.png', width: 1536, height: 1024 }, x4: { url: '/art/c.png', width: 2304, height: 2048 } } };
    const shot = sample.shots[0];
    expect(resolveBackground(manifest, shot, 'x2').width).toBe(1536);
    expect(logicalToPixel({ x: 400, y: 300 }, 1536, 1024)).toEqual({ x: 400, y: 300 });
    expect(logicalToPixel({ x: 400, y: 300 }, 2304, 2048)).toEqual({ x: 600, y: 600 });
    expect(resolveBackground({ protagonist_village: { default: manifest.protagonist_village.default } }, shot, 'x4').quality).toBe('default');
  });
  it('upgrades old v1 shot backgrounds without modifying routes', () => {
    const old = JSON.parse(JSON.stringify(sample)); delete old.shots[0].season;
    const parsed = projectSchema.parse(old); expect(parsed.shots[0].season).toBe('original');
    expect(parsed.shots[0].actors).toEqual(sample.shots[0].actors);
  });
});
describe('polygon geometry', () => {
  const points = [{ x: 100, y: 100 }, { x: 600, y: 100 }, { x: 100, y: 600 }];
  it('validates shapes and rejects self-intersecting and zero-area outlines', () => {
    expect(validPolygon(points)).toBe(true);
    expect(validPolygon([{ x: 0, y: 0 }, { x: 50, y: 50 }, { x: 0, y: 50 }, { x: 50, y: 0 }])).toBe(false);
    expect(validPolygon([{ x: 0, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 100 }])).toBe(false);
    const region = { ...polygonBounds(points), points };
    expect(effectSchema.safeParse({ id: 'p', name: 'p', type: 'water', regions: [region] }).success).toBe(true);
    expect(containsPoint(region, { x: 200, y: 200 })).toBe(true);
    expect(containsPoint(region, { x: 550, y: 550 })).toBe(false);
  });
  it('maps contain-fit canvases with letterboxes, zoom and pan to bottom-left origin', () => {
    const rect = { left: 50, top: 20, width: 1280, height: 900 };
    expect(clientToLogical({ x: 150, y: 830 }, rect)).toEqual({ x: 0, y: 0 });
    expect(clientToLogical({ x: 50, y: 100 }, rect)).toBeNull();
    const zoomed = { left: -200, top: 40, width: 2560, height: 1800 };
    expect(clientToLogical({ x: 0, y: 1660 }, zoomed)).toEqual({ x: 0, y: 0 });
  });
  it('keeps rain and snow targets inside their polygon, not just its bounding box', () => {
    const region = { ...polygonBounds(points), points };
    for (const type of ['rain', 'snow']) {
      const effect = effectSchema.parse({ id: 'x', name: 'x', type, intensity: 1, regions: [region] });
      const targets = particles(effect, 100, 0);
      expect(targets.length).toBeGreaterThan(0);
      expect(targets.every(p => containsPoint(region, p))).toBe(true);
    }
  });
});
