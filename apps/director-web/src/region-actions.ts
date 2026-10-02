import type { Effect, Shot } from '../../../packages/core';
import { containsPoint, polygonArea, regionPoints, type Point } from '../../../packages/core/geometry';

export type RegionEffectType = Exclude<Effect['type'], 'lightning'>;
export type RegionHit = {
  effectId: string;
  index: number;
  signature: string;
  name: string;
  type: RegionEffectType;
  layer: number;
};

function segmentDistance(point: Point, start: Point, end: Point) {
  const dx = end.x - start.x, dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const fraction = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1,
    ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return Math.hypot(point.x - start.x - fraction * dx, point.y - start.y - fraction * dy);
}

/** Logical-coordinate hit testing, including polygon edges and corner tolerance.
 * Small regions precede full-scene weather. Remaining ties follow painter order.
 */
export function hitRegions(shot: Shot, point: Point, tolerance = 0): RegionHit[] {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return [];
  const radius = Number.isFinite(tolerance) ? Math.max(0, tolerance) : 0;
  const matches: { hit: RegionHit; area: number; depth: number; order: number }[] = [];
  shot.effects.forEach((effect, order) => {
    const type = effect.type;
    if (!effect.enabled || type === 'lightning') return;
    effect.regions.forEach((region, index) => {
      const points = regionPoints(region);
      const onEdge = points.some((start, i) => segmentDistance(point, start, points[(i + 1) % points.length]) <= radius + 1e-7);
      if (!containsPoint(region, point) && !onEdge) return;
      matches.push({
        hit: { effectId: effect.id, index, signature: JSON.stringify(region), name: effect.name, type, layer: effect.layer },
        area: polygonArea(points), depth: effect.sortY ?? region.y, order,
      });
    });
  });
  return matches.sort((a, b) => a.area - b.area || b.hit.layer - a.hit.layer
    || a.depth - b.depth || b.order - a.order || b.hit.index - a.hit.index).map(match => match.hit);
}

/** Re-resolve against the latest transaction instead of trusting a menu snapshot. */
export function getRegion(shot: Shot, hit: RegionHit) {
  if (!Number.isInteger(hit.index) || hit.index < 0) return null;
  const effect = shot.effects.find(item => item.id === hit.effectId && item.type === hit.type);
  const region = effect?.regions[hit.index];
  if (!effect || !region || JSON.stringify(region) !== hit.signature) return null;
  return { effect, region };
}

/** Mutates only the transaction's selected region; callers own undo/persistence. */
export function deleteRegion(shot: Shot, hit: RegionHit) {
  const current = getRegion(shot, hit);
  if (!current) throw new Error('此范围已改变或被删除，请重新选择后再操作');
  current.effect.regions.splice(hit.index, 1);
}
