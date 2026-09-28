import type { Point } from './geometry';

/** Same softening as Godot FlowField: nearer lines dominate by inverse-square distance. */
const SOFTEN = 10;

function closest(point: Point, a: Point, b: Point) {
  const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
  if (len2 < 1e-6) return { distance: Math.hypot(point.x - a.x, point.y - a.y), tangent: { x: 0, y: 0 }, length: 0 };
  const s = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / len2));
  const x = a.x + dx * s, y = a.y + dy * s;
  return { distance: Math.hypot(point.x - x, point.y - y), tangent: { x: dx, y: dy }, length: Math.sqrt(len2) };
}

/** Unit flow direction. Opposing lines fall back to the nearest tangent instead of cancelling. */
export function flowDirection(point: Point, lines: Point[][], fallback: Point): Point {
  let totalX = 0, totalY = 0, totalWeight = 0, nearest = Infinity, nearX = 0, nearY = 0;
  for (const line of lines) {
    let tx = 0, ty = 0, lineDistance = Infinity;
    for (let i = 0; i < line.length - 1; i++) {
      const hit = closest(point, line[i], line[i + 1]);
      if (hit.length === 0) continue;
      lineDistance = Math.min(lineDistance, hit.distance);
      const inverse = 1 / (hit.distance + SOFTEN), weight = inverse ** 4 / hit.length;
      tx += hit.tangent.x * weight; ty += hit.tangent.y * weight;
    }
    const len = Math.hypot(tx, ty);
    if (lineDistance === Infinity || len < 1e-15) continue;
    const inverse = 1 / (lineDistance + SOFTEN), weight = inverse * inverse;
    totalX += tx / len * weight; totalY += ty / len * weight; totalWeight += weight;
    if (lineDistance < nearest) { nearest = lineDistance; nearX = tx / len; nearY = ty / len; }
  }
  const fallbackLen = Math.hypot(fallback.x, fallback.y);
  if (totalWeight <= 0) return fallbackLen > 1e-6 ? { x: fallback.x / fallbackLen, y: fallback.y / fallbackLen } : { x: 0, y: -1 };
  if (Math.hypot(totalX, totalY) < totalWeight * 0.001) return { x: nearX, y: nearY };
  const len = Math.hypot(totalX, totalY);
  return { x: totalX / len, y: totalY / len };
}
