import type { Point } from './geometry';

type Box = { width: number; height: number; scale: number; rotation: number; flipX: boolean; flipY: boolean };
const K = 720 / 1024;
const toScreen = (p: Point) => ({ x: 100 + p.x * 1080 / 1536, y: 720 - p.y * K });
const toLogical = (p: Point): Point => ({ x: (p.x - 100) * 1536 / 1080, y: (720 - p.y) * 1024 / 720 });

/** Corners of a bottom-center image in logical space, matching the on-canvas selection box. */
export function imageCorners(actor: Box, origin: Point): Point[] {
  const foot = toScreen(origin);
  const φ = -actor.rotation * Math.PI / 180;
  const fx = actor.flipX ? -1 : 1, fy = actor.flipY ? -1 : 1;
  const half = actor.width * K / 2, height = actor.height * K;
  return [[-half, 0], [half, 0], [-half, -height], [half, -height]].map(([lx, ly]) => {
    const x = lx * actor.scale * fx, y = ly * actor.scale * fy;
    return toLogical({ x: foot.x + x * Math.cos(φ) - y * Math.sin(φ), y: foot.y + x * Math.sin(φ) + y * Math.cos(φ) });
  });
}

/** Pointer position in the image's unscaled local space. Y grows upward from the foot. */
export function imageLocal(actor: Box, origin: Point, point: Point) {
  const foot = toScreen(origin), at = toScreen(point);
  const φ = -actor.rotation * Math.PI / 180, dx = at.x - foot.x, dy = at.y - foot.y;
  const cos = Math.cos(φ), sin = Math.sin(φ);
  const x = dx * cos + dy * sin, y = -dx * sin + dy * cos;
  return { x: x / (actor.scale * (actor.flipX ? -1 : 1)) / K, y: -y / (actor.scale * (actor.flipY ? -1 : 1)) / K };
}
