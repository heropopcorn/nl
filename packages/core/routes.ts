import { position, type Shot } from './index';
import { containsPoint, regionPoints, type Point } from './geometry';
export function alongPath(points: Point[], distance: number, loop = false): Point {
  if (!points.length) return { x: 0, y: 0 };
  const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
  const length = lengths.reduce((a, b) => a + b, 0);
  let left = loop && length > 0 ? distance % length : Math.min(distance, length);
  for (let i = 0; i < lengths.length; i++) { if (left <= lengths[i] && lengths[i] > 0) { const t = left / lengths[i]; return { x: points[i].x + (points[i + 1].x - points[i].x) * t, y: points[i].y + (points[i + 1].y - points[i].y) * t }; } left -= lengths[i]; }
  return points[points.length - 1];
}
export function actorPosition(actor: Shot['actors'][number], shot: Shot, frame: number) {
  const path = actor.route.length >= 2 ? actor.route : [actor.start, actor.end];
  const length = path.slice(1).reduce((n, p, i) => n + Math.hypot(p.x - path[i].x, p.y - path[i].y), 0);
  let distance = actor.route.length >= 2 ? frame / 30 * actor.speed : length * Math.min(1, frame / Math.max(1, shot.frames - 1));
  if (actor.collision !== 'stop' || !shot.collisionEnabled) return actor.route.length >= 2 ? alongPath(path, distance, actor.loop) : position(actor, frame, shot.frames);
  const blocks = shot.effects.filter(e => e.enabled && e.collisionEnabled).flatMap(e => e.regions);
  if (!blocks.length) return alongPath(path, distance, actor.loop);
  // Segment intersection catches even sub-pixel obstacles without frame-rate sampling.
  let travelled = 0, limit = length;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
    let hit = 1;
    for (const region of blocks) {
      if (containsPoint(region, a)) { hit = 0; break; }
      const p = regionPoints(region);
      for (let j = 0; j < p.length; j++) {
        const c = p[j], d = p[(j + 1) % p.length], ex = d.x - c.x, ey = d.y - c.y, den = dx * ey - dy * ex;
        if (Math.abs(den) < 1e-10) continue;
        const t = ((c.x - a.x) * ey - (c.y - a.y) * ex) / den, u = ((c.x - a.x) * dy - (c.y - a.y) * dx) / den;
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) hit = Math.min(hit, t);
      }
    }
    if (hit < 1) { limit = travelled + Math.max(0, hit * len - 0.1); break; } travelled += len;
  }
  if (limit < length) distance = Math.min(distance, limit);
  return alongPath(path, distance, actor.loop && limit === length);
}
