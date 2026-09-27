import { describe, expect, it } from 'vitest';
import { effectSchema, sample } from '../packages/core';
import { flowDirection } from '../packages/core/flow';
import { imageCorners } from '../packages/core/handles';
import { overlappingWaterIds, regionsOverlap, simplifyPolyline, snapCoordinate } from '../packages/core/geometry';
import { fallDirection, gustSpeedScale, rainMarks, rainSamples, rainStreamCount, resolveWind, windVisualScale } from '../packages/studios/weather';

describe('flow field', () => {
  it('matches the Godot distance-weighted cases', () => {
    const down = [[{ x: 0, y: 0 }, { x: 0, y: 400 }]];
    expect(flowDirection({ x: 30, y: 200 }, down, { x: 1, y: 0 }).y).toBeGreaterThan(0.999);
    expect(flowDirection({ x: 30, y: 200 }, [], { x: 1, y: 0 }).x).toBeGreaterThan(0.999);
    const pair = [[{ x: 0, y: -1000 }, { x: 0, y: 1000 }], [{ x: 50, y: 0 }, { x: 1000, y: 0 }]];
    const middle = flowDirection({ x: 100, y: 100 }, pair, { x: 0, y: -1 });
    expect(middle.x).toBeCloseTo(Math.SQRT1_2, 2);
    expect(middle.y).toBeCloseTo(Math.SQRT1_2, 2);
    expect(flowDirection({ x: 20, y: 200 }, pair, { x: 0, y: -1 }).y).toBeGreaterThan(0.95);
    expect(flowDirection({ x: 400, y: 20 }, pair, { x: 0, y: -1 }).x).toBeGreaterThan(0.95);
    const bend = [[{ x: 0, y: 0 }, { x: 0, y: 200 }, { x: 200, y: 200 }]];
    const corner = flowDirection({ x: -20, y: 220 }, bend, { x: 0, y: -1 });
    expect(corner.x + corner.y).toBeGreaterThan(0.9);
  });
});

describe('rain and wind', () => {
  const full = { x: 0, y: 0, width: 1536, height: 1024 };
  const rain = () => effectSchema.parse({ id: 'rain', name: '雨', type: 'rain', regions: [full] });
  it('separates density from intensity and caps the Godot stream formula', () => {
    expect(rainStreamCount(rain(), full)).toBe(1280);
    const sparse = rain(); sparse.density = 0.2;
    expect(rainStreamCount(sparse, full)).toBeLessThan(400);
    sparse.intensity = 0;
    expect(rainStreamCount(sparse, full)).toBe(0);
    expect(windVisualScale(0)).toBeCloseTo(2 / 3);
    expect(windVisualScale(1)).toBeCloseTo(3);
    expect(gustSpeedScale(0)).toBe(1);
    expect(gustSpeedScale(1)).toBe(20);
  });
  it('tilts horizontal wind up to 60° and keeps vertical wind upright', () => {
    expect(fallDirection({ x: 1, y: 0, strength: 1 }).x).toBeCloseTo(Math.sin(Math.PI / 3), 5);
    expect(fallDirection({ x: -1, y: 0, strength: 1 }).x).toBeLessThan(0);
    expect(fallDirection({ x: 0, y: 1, strength: 1 })).toEqual({ x: 0, y: 1 });
    const effect = rain();
    const wind = resolveWind({ ...sample.shots[0].wind, enabled: true, strength: 1, direction: { x: 1, y: 0 }, gust: 1, speed: 1 });
    const marks = rainMarks(effect, 70, 0, wind);
    expect(marks.length).toBeGreaterThan(10);
    expect(marks.some(mark => mark.airborne && mark.headX < mark.landingX - 5)).toBe(true);
    effect.speed = 0;
    expect(rainSamples(effect, 900, 0)).toEqual(rainSamples(effect, 0, 0));
  });
  it('treats negative strength as the legacy leftward wind', () => {
    expect(resolveWind({ ...sample.shots[0].wind, strength: -0.4 }).x).toBe(-1);
  });
  it('can turn splashes off for one rain region', () => {
    const wind = resolveWind(sample.shots[0].wind);
    const on = rain();
    const off = rain();
    off.regions[0] = { ...full, splashes: false };
    const frames = Array.from({ length: 90 }, (_, frame) => frame);
    expect(frames.some(frame => rainMarks(on, frame, 0, wind).some(mark => !mark.airborne))).toBe(true);
    expect(frames.some(frame => rainMarks(off, frame, 0, wind).some(mark => !mark.airborne))).toBe(false);
  });
});

describe('editing geometry', () => {
  it('places image corners around the foot and simplifies a freehand stroke', () => {
    const corners = imageCorners({ width: 100, height: 200, scale: 1, rotation: 0, flipX: false, flipY: false }, { x: 400, y: 300 });
    const ys = corners.map(point => point.y).sort((a, b) => a - b);
    expect(ys[0]).toBeCloseTo(300); expect(ys[1]).toBeCloseTo(300); expect(ys[3]).toBeCloseTo(500);
    const simplified = simplifyPolyline([{ x: 0, y: 0 }, { x: 1, y: 0.2 }, { x: 2, y: -0.1 }, { x: 40, y: 0 }], 3);
    expect(simplified).toEqual([{ x: 0, y: 0 }, { x: 40, y: 0 }]);
    expect(regionsOverlap({ x: 0, y: 0, width: 100, height: 100 }, { x: 50, y: 50, width: 100, height: 100 })).toBe(true);
    expect(regionsOverlap({ x: 0, y: 0, width: 100, height: 100 }, { x: 100, y: 0, width: 100, height: 100 })).toBe(false);
    expect(regionsOverlap({ x: 0, y: 0, width: 100, height: 100 }, { x: 0, y: 0, width: 100, height: 100 })).toBe(true);
    const left = { id: 'a', type: 'water', regions: [{ x: 0, y: 0, width: 100, height: 100 }] };
    expect(overlappingWaterIds([left, { id: 'b', type: 'water', regions: [{ x: 100, y: 0, width: 80, height: 80 }] }])).toEqual([]);
    expect(overlappingWaterIds([left, { id: 'c', type: 'water', regions: [{ x: 40, y: 40, width: 80, height: 80 }] }]).sort()).toEqual(['a', 'c']);
    expect(snapCoordinate(12, 8)).toBe(16);
    expect(snapCoordinate(3, 0)).toBe(3);
  });
});
