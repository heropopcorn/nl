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

export function polygonArea(points: Point[]) {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

/** Normalized area on the 1536×1024 logical canvas. A full-frame rectangle is 1. */
export function regionUvArea(region: Region) {
  return polygonArea(regionPoints(region)) / (1536 * 1024);
}

function pointLineDistance(p: Point, a: Point, b: Point) {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / len;
}

function interiorSamples(points: Point[]) {
  const center = { x: points.reduce((sum, p) => sum + p.x, 0) / points.length, y: points.reduce((sum, p) => sum + p.y, 0) / points.length };
  const samples = [center];
  for (let i = 0; i < points.length; i++) {
    const start = points[i], end = points[(i + 1) % points.length];
    const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    samples.push({ x: (mid.x + center.x) / 2, y: (mid.y + center.y) / 2 });
  }
  return samples;
}

/** Interior overlap. Shared edges are allowed, matching the Godot water rule. */
export function regionsOverlap(a: Region, b: Region) {
  const strictlyInside = (region: Region, p: Point) => containsPoint(region, p) && regionPoints(region).every((start, i, pts) => pointLineDistance(p, start, pts[(i + 1) % pts.length]) >= 1);
  const pa = regionPoints(a), pb = regionPoints(b);
  if (pa.some(p => strictlyInside(b, p)) || pb.some(p => strictlyInside(a, p))) return true;
  if (interiorSamples(pa).some(p => strictlyInside(a, p) && strictlyInside(b, p)) || interiorSamples(pb).some(p => strictlyInside(b, p) && strictlyInside(a, p))) return true;
  for (let i = 0; i < pa.length; i++) for (let j = 0; j < pb.length; j++) {
    const c1 = cross(pa[i], pa[(i + 1) % pa.length], pb[j]), c2 = cross(pa[i], pa[(i + 1) % pa.length], pb[(j + 1) % pb.length]);
    const c3 = cross(pb[j], pb[(j + 1) % pb.length], pa[i]), c4 = cross(pb[j], pb[(j + 1) % pb.length], pa[(i + 1) % pa.length]);
    if (c1 * c2 < 0 && c3 * c4 < 0) return true;
  }
  return false;
}

/** Ramer–Douglas–Peucker. Keeps endpoints so a freehand stroke can close cleanly. */
export function simplifyPolyline(points: Point[], tolerance: number): Point[] {
  if (points.length <= 2) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop()!;
    let farthest = -1, distance = tolerance;
    for (let i = start + 1; i < end; i++) {
      const a = points[start], b = points[end], dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((points[i].x - a.x) * dx + (points[i].y - a.y) * dy) / len2));
      const gap = Math.hypot(points[i].x - (a.x + dx * t), points[i].y - (a.y + dy * t));
      if (gap > distance) { distance = gap; farthest = i; }
    }
    if (farthest >= 0) { keep[farthest] = 1; stack.push([start, farthest], [farthest, end]); }
  }
  return points.filter((_, i) => keep[i]);
}

export function snapCoordinate(value: number, grid: number) {
  return grid > 0 ? Math.round(value / grid) * grid : value;
}

/** Enabled or disabled water regions. Shared edges are allowed; interior overlap is not. */
export function overlappingWaterIds(effects: { id: string; type: string; regions: Region[] }[]) {
  const pieces = effects.filter(effect => effect.type === 'water').flatMap(effect => effect.regions.map(region => ({ id: effect.id, region })));
  const ids = new Set<string>();
  for (let i = 0; i < pieces.length; i++) for (let j = i + 1; j < pieces.length; j++) {
    if (regionsOverlap(pieces[i].region, pieces[j].region)) { ids.add(pieces[i].id); ids.add(pieces[j].id); }
  }
  return [...ids];
}
