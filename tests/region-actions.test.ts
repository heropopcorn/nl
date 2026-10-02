import { describe, expect, it } from 'vitest';
import { effectSchema, sample, type Effect, type Shot } from '../packages/core';
import { polygonBounds } from '../packages/core/geometry';
import { deleteRegion, getRegion, hitRegions, type RegionHit } from '../apps/director-web/src/region-actions';

const rectangle = (x = 100, y = 100, width = 200, height = 200) => ({ x, y, width, height });
const polygon = (points: { x: number; y: number }[]) => ({ ...polygonBounds(points), points });
const effect = (id: string, type: Effect['type'] = 'water', regions: Effect['regions'] = [rectangle()]) => effectSchema.parse({ id, name: id, type, regions });
function scene(...effects: Effect[]): Shot { return { ...structuredClone(sample.shots[0]), effects }; }

describe('region context actions', () => {
  it('hits rectangles and actual polygon interiors, not just their bounding boxes', () => {
    const triangle = polygon([{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 100, y: 300 }]);
    const shot = scene(effect('triangle', 'water', [triangle]), effect('box', 'fog'));
    expect(hitRegions(shot, { x: 140, y: 140 }).map(hit => hit.effectId)).toEqual(['triangle', 'box']);
    expect(hitRegions(shot, { x: 270, y: 270 }).map(hit => hit.effectId)).toEqual(['box']);
    expect(hitRegions(shot, { x: 500, y: 500 })).toEqual([]);
  });

  it('includes polygon boundaries and uses finite edge/corner distances for tolerance', () => {
    const triangle = polygon([{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 100, y: 300 }]);
    const shot = scene(effect('triangle', 'water', [triangle]));
    expect(hitRegions(shot, { x: 200, y: 200 })).toHaveLength(1);
    expect(hitRegions(shot, { x: 205, y: 205 })).toEqual([]);
    expect(hitRegions(shot, { x: 205, y: 205 }, 8)).toHaveLength(1);
    expect(hitRegions(shot, { x: 206, y: 206 }, 8)).toEqual([]);
    expect(hitRegions(shot, { x: 95, y: 95 }, 8)).toHaveLength(1);
    expect(hitRegions(shot, { x: 92, y: 92 }, 8)).toEqual([]);
    expect(hitRegions(shot, { x: 500, y: 100 }, 8)).toEqual([]);
    const box = scene(effect('box'));
    expect(hitRegions(box, { x: 308, y: 200 }, 8)).toHaveLength(1);
    expect(hitRegions(box, { x: 309, y: 200 }, 8)).toEqual([]);
  });

  it('preserves concave cutouts and ignores disabled effects and lightning', () => {
    const concave = polygon([{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 150 }, { x: 150, y: 150 }, { x: 150, y: 300 }, { x: 100, y: 300 }]);
    const hidden = effect('hidden'); hidden.enabled = false;
    const shot = scene(effect('cutout', 'cutout', [concave]), hidden, effect('flash', 'lightning'));
    expect(hitRegions(shot, { x: 120, y: 200 }).map(hit => hit.type)).toEqual(['cutout']);
    expect(hitRegions(shot, { x: 240, y: 240 }, 8)).toEqual([]);
  });

  it('supports every regional effect, including enabled zero-intensity editable regions', () => {
    const kinds = ['water', 'fog', 'rain', 'snow', 'cutout'] as const;
    const shot = scene(...kinds.map(kind => ({ ...effect(kind, kind), intensity: 0 })));
    const before = structuredClone(shot);
    const hits = hitRegions(shot, { x: 200, y: 200 });
    expect(hits.map(hit => hit.type)).toEqual([...kinds].reverse());
    expect(hits[0]).toEqual({ effectId: 'cutout', index: 0, signature: JSON.stringify(shot.effects[4].regions[0]), name: 'cutout', type: 'cutout', layer: 0 });
    expect(shot).toEqual(before);
  });

  it('prioritizes smaller true polygon area over high-layer full-screen rain or fog', () => {
    const full = rectangle(0, 0, 1536, 1024);
    const triangle = polygon([{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 100, y: 300 }]);
    const shot = scene({ ...effect('full rain', 'rain', [full]), layer: 100 }, effect('river'), { ...effect('small triangle', 'water', [triangle]), layer: -10 });
    expect(hitRegions(shot, { x: 140, y: 140 }).map(hit => hit.effectId)).toEqual(['small triangle', 'river', 'full rain']);
  });

  it('breaks equal-area ties by layer, depth, and later painter order', () => {
    const shot = scene(
      { ...effect('higher layer'), layer: 5, sortY: 900 },
      { ...effect('back'), sortY: 200 },
      { ...effect('front earlier'), sortY: 50 },
      { ...effect('front later', 'fog', [rectangle(), rectangle()]), sortY: 50 },
    );
    expect(hitRegions(shot, { x: 200, y: 200 }).map(hit => [hit.effectId, hit.index])).toEqual([
      ['higher layer', 0], ['front later', 1], ['front later', 0], ['front earlier', 0], ['back', 0],
    ]);
  });

  it('handles invalid coordinates and tolerances without accidental broad hits', () => {
    const shot = scene(effect('river'));
    expect(hitRegions(shot, { x: NaN, y: 100 }, 8)).toEqual([]);
    expect(hitRegions(shot, { x: 100, y: Infinity }, 8)).toEqual([]);
    for (const tolerance of [-8, NaN, Infinity]) expect(hitRegions(shot, { x: 305, y: 200 }, tolerance)).toEqual([]);
  });

  it('re-resolves the latest effect and preserves unrelated property changes', () => {
    const shot = scene(effect('rain', 'rain'));
    const hit = hitRegions(shot, { x: 200, y: 200 })[0];
    shot.effects[0].name = 'renamed rain'; shot.effects[0].layer = 10;
    const result = getRegion(shot, hit);
    expect(result?.effect).toBe(shot.effects[0]);
    expect(result?.region).toBe(shot.effects[0].regions[0]);
  });

  it('rejects stale geometry, region properties, missing effects, changed type and invalid index', () => {
    const base = scene(effect('rain', 'rain'));
    const hit = hitRegions(base, { x: 200, y: 200 })[0];
    const mutations = [
      (shot: Shot) => { shot.effects[0].regions[0].width += 1; },
      (shot: Shot) => { shot.effects[0].regions[0].splashes = false; },
      (shot: Shot) => { shot.effects = []; },
      (shot: Shot) => { shot.effects[0].type = 'snow'; },
    ];
    for (const mutate of mutations) {
      const shot = structuredClone(base); mutate(shot); const before = structuredClone(shot);
      expect(getRegion(shot, hit)).toBeNull();
      expect(() => deleteRegion(shot, hit)).toThrow('请重新选择');
      expect(shot).toEqual(before);
    }
    for (const index of [-1, 0.5, 4, NaN]) expect(getRegion(base, { ...hit, index })).toBeNull();
  });

  it('rejects index shifts and deletes only the selected sibling, retaining the element', () => {
    const shot = scene(effect('river', 'water', [rectangle(), rectangle(500, 100), rectangle(900, 100)]), effect('fog', 'fog'));
    const middle = hitRegions(shot, { x: 550, y: 150 })[0], last = hitRegions(shot, { x: 950, y: 150 })[0];
    const before = structuredClone(shot);
    deleteRegion(shot, middle);
    expect(shot.effects[0].regions).toEqual([before.effects[0].regions[0], before.effects[0].regions[2]]);
    expect(shot.effects[1]).toEqual(before.effects[1]);
    expect(shot.actors).toEqual(before.actors);
    expect(getRegion(shot, middle)).toBeNull();
    expect(getRegion(shot, last)).toBeNull();
    expect(() => deleteRegion(shot, middle)).toThrow('此范围已改变或被删除');
    expect(shot.effects).toHaveLength(2);
  });

  it('keeps an effect with no regions after deleting its final region', () => {
    const shot = scene(effect('river'));
    const hit: RegionHit = hitRegions(shot, { x: 200, y: 200 })[0];
    const before = structuredClone(shot.effects[0]);
    deleteRegion(shot, hit);
    expect(shot.effects).toEqual([{ ...before, regions: [] }]);
    expect(hitRegions(shot, { x: 200, y: 200 })).toEqual([]);
    expect(getRegion(shot, hit)).toBeNull();
  });
});
