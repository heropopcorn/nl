export type Point = { x: number; y: number };
export type Region = { x: number; y: number; width: number; height: number; points?: Point[] };
export function polygonBounds(points: Point[]) {
  const x = Math.min(...points.map(p => p.x)), y = Math.min(...points.map(p => p.y));
  return { x, y, width: Math.max(...points.map(p => p.x)) - x, height: Math.max(...points.map(p => p.y)) - y };
}
export function regionPoints(r: Region): Point[] {
  return r.points ?? [{ x: r.x, y: r.y }, { x: r.x + r.width, y: r.y }, { x: r.x + r.width, y: r.y + r.height }, { x: r.x, y: r.y + r.height }];
}
export function containsPoint(r: Region, p: Point) {
  if (!r.points) return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
  let inside = false;
  for (let i = 0, j = r.points.length - 1; i < r.points.length; j = i++) {
    const a = r.points[i], b = r.points[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
const cross = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const between = (a: Point, b: Point, c: Point) => Math.abs(cross(a, b, c)) < 1e-7 && c.x >= Math.min(a.x, b.x) && c.x <= Math.max(a.x, b.x) && c.y >= Math.min(a.y, b.y) && c.y <= Math.max(a.y, b.y);
export function validPolygon(points: Point[]) {
  if (points.length < 3 || points.length > 128) return false;
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    if (Math.hypot(a.x - b.x, a.y - b.y) < 0.01) return false;
    area += a.x * b.y - b.x * a.y;
    for (let j = i + 2; j < points.length; j++) {
      if (i === 0 && j === points.length - 1) continue;
      const c = points[j], d = points[(j + 1) % points.length];
      if ((cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) || between(a, b, c) || between(a, b, d) || between(c, d, a) || between(c, d, b)) return false;
    }
  }
  return Math.abs(area) >= 2;
}
/** Client coordinates include zoom/pan; rect is the transformed contain-fit canvas box. */
export function clientToLogical(client: Point, rect: { left: number; top: number; width: number; height: number }): Point | null {
  const scale = Math.min(rect.width / 1280, rect.height / 720);
  if (scale <= 0) return null;
  const x = (client.x - rect.left - (rect.width - 1280 * scale) / 2) / scale;
  const y = (client.y - rect.top - (rect.height - 720 * scale) / 2) / scale;
  const point = { x: (x - 100) * 1536 / 1080, y: (720 - y) * 1024 / 720 };
  return point.x >= 0 && point.x <= 1536 && point.y >= 0 && point.y <= 1024 ? point : null;
}
export const logicalToPixel = (p: Point, width: number, height: number) => ({ x: p.x * width / 1536, y: p.y * height / 1024 });
