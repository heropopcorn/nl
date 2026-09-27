import type { Effect, Shot } from '../core';
import { containsPoint, polygonBounds, regionPoints, regionUvArea, type Point, type Region } from '../core/geometry';

export const RAIN_STREAM_CAP = 1280;
export const RAIN_DRAW_CAP = 320;
const SPLASH_DURATION = 0.62;

export type ResolvedWind = { x: number; y: number; strength: number; gust: number; speed: number; enabled: boolean };
export type RainMark = {
  landingX: number; landingY: number; layerY: number;
  headX: number; headY: number; tailX: number; tailY: number;
  airborne: boolean; splash: number; size: number;
};

/** Godot stores wind_direction in screen axes: +x right, +y down. Negative strength is the older horizontal-only encoding. */
export function resolveWind(wind: Shot['wind']): ResolvedWind {
  let x = wind.direction.x, y = wind.direction.y, strength = wind.strength;
  if (strength < 0) { x = -1; y = 0; strength = -strength; }
  const len = Math.hypot(x, y) || 1;
  return { x: x / len, y: y / len, strength: Math.min(1, strength), gust: wind.gust, speed: wind.speed, enabled: wind.enabled };
}

export const windVisualScale = (strength: number) => (2 / 3) + (3 - 2 / 3) * Math.max(0, Math.min(1, strength));
export const gustSpeedScale = (gust: number) => 20 ** Math.max(0, Math.min(1, gust));

function hash01(value: number) {
  const x = Math.sin(value * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export function rainStreamCount(effect: Pick<Effect, 'intensity' | 'density'>, region: Region) {
  if (effect.intensity <= 0 || effect.density <= 0) return 0;
  const desired = Math.round(regionUvArea(region) * (150 + 9000 * effect.density ** 4));
  return Math.max(2, Math.min(RAIN_STREAM_CAP, desired));
}

/** Horizontal wind tilts the fall up to 60°. Purely vertical wind keeps the drop upright and only changes speed. */
export function fallDirection(wind: { x: number; y: number; strength: number }) {
  if (wind.strength <= 0.0001 || Math.abs(wind.x) <= 0.0001) return { x: 0, y: 1 };
  const tilt = 60 * Math.min(1, wind.strength) * Math.PI / 180;
  const dir = { x: Math.sign(wind.x) * Math.sin(tilt), y: Math.cos(tilt) };
  const len = Math.hypot(dir.x, dir.y);
  return { x: dir.x / len, y: dir.y / len };
}

export function combinedRainWind(effect: Pick<Effect, 'wind'>, wind: ResolvedWind) {
  const gx = wind.enabled ? wind.x * wind.strength : 0;
  const gy = wind.enabled ? wind.y * wind.strength : 0;
  const x = gx + effect.wind, y = gy, mag = Math.hypot(x, y);
  if (mag < 1e-6) return { x: 0, y: 1, strength: 0 };
  return { x: x / mag, y: y / mag, strength: Math.min(1, mag) };
}

const screen = (p: Point) => ({ x: 100 + p.x * 1080 / 1536, y: 720 - p.y * 720 / 1024 });

function landingPool(region: Region, seed: number) {
  const points = regionPoints(region);
  const bounds = polygonBounds(points);
  const shape = region.points ? { ...bounds, points: region.points } : bounds;
  const pool: Point[] = [];
  for (let attempt = 0; pool.length < 48 && attempt < 48 * 12; attempt++) {
    const candidate = { x: bounds.x + hash01(seed + attempt * 17.17) * Math.max(bounds.width, 0.001), y: bounds.y + hash01(seed + attempt * 31.73 + 9.1) * Math.max(bounds.height, 0.001) };
    if (containsPoint(shape, candidate)) pool.push(candidate);
  }
  if (!pool.length) pool.push({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 });
  return pool;
}

export function rainSamples(effect: Effect, frame: number, regionIndex: number) {
  const region = effect.regions[regionIndex];
  const count = Math.min(rainStreamCount(effect, region), RAIN_DRAW_CAP);
  if (!count) return [];
  const time = frame / 30 * effect.speed;
  const pool = landingPool(region, effect.seed + regionIndex * 13.37);
  return Array.from({ length: count }, (_, slot) => {
    const seed = hash01(effect.seed + regionIndex * 19.1 + slot * 7.91 + 3.7);
    const cycle = Math.floor(time * (0.35 + effect.intensity) + seed * 4);
    const target = pool[Math.min(pool.length - 1, Math.floor(hash01(seed * 47.11 + cycle * 101.73) * pool.length))];
    return { x: target.x, y: target.y, phase: (time * 0.85 + seed) % 1, size: 0.62 + hash01(seed * 71.3) * 0.8 };
  });
}

export function rainMarks(effect: Effect, frame: number, regionIndex: number, wind: ResolvedWind): RainMark[] {
  const region = effect.regions[regionIndex];
  const streams = Math.min(rainStreamCount(effect, region), RAIN_DRAW_CAP);
  if (!streams) return [];
  const time = frame / 30 * effect.speed;
  const flow = combinedRainWind(effect, wind);
  const fall = fallDirection(flow);
  const dirY = Math.max(fall.y, 0.18);
  const speedScale = Math.min(1.2, Math.max(0.78, 1 + flow.y * flow.strength * 0.18));
  const baseSpeed = (520 + (1120 - 520) * effect.intensity) * speedScale;
  const overlap = 1.6 + (3.2 - 1.6) * effect.intensity;
  const interval = Math.max((720 + 174) / dirY / Math.max(baseSpeed, 1) / overlap, 0.02);
  const pool = landingPool(region, effect.seed + regionIndex * 13.37);
  const marks: RainMark[] = [];
  for (let slot = 0; slot < streams; slot++) {
    const seed = hash01(effect.seed + regionIndex * 19.1 + slot * 7.91 + 3.7);
    const phase = seed * interval * 7.3;
    const newest = Math.floor((time - phase) / interval);
    for (let k = newest - 2; k <= newest; k++) {
      const emit = phase + (k + hash01(seed * 53.7 + k * 7.31) * 0.9) * interval;
      const age = time - emit;
      if (age < 0) continue;
      const target = pool[Math.min(pool.length - 1, Math.floor(hash01(effect.seed + regionIndex + slot * 47.11 + k * 101.73) * pool.length))];
      const at = screen(target);
      const distance = (at.y + 54) / dirY;
      const speed = baseSpeed * (0.88 + hash01(seed * 91.1 + k * 13.7) * 0.24);
      const travel = distance / speed;
      const splashes = region.splashes ?? effect.splashes;
      const splashLife = splashes ? SPLASH_DURATION : 0;
      if (age >= travel + splashLife) continue;
      const scale = (0.62 + hash01(seed * 71.3 + k * 23.17) * 0.8) * (0.78 + effect.intensity * 0.44);
      const landing = { x: at.x, y: at.y };
      if (age < travel) {
        const travelled = age * speed;
        const head = { x: landing.x - fall.x * (distance - travelled), y: landing.y - fall.y * (distance - travelled) };
        const tailLength = Math.min((26 + 36 * effect.intensity) * scale, travelled);
        marks.push({ landingX: landing.x, landingY: landing.y, layerY: target.y, headX: head.x, headY: head.y, tailX: head.x - fall.x * tailLength, tailY: head.y - fall.y * tailLength, airborne: true, splash: 0, size: scale });
      } else if (splashes) {
        marks.push({ landingX: landing.x, landingY: landing.y, layerY: target.y, headX: landing.x, headY: landing.y, tailX: landing.x, tailY: landing.y, airborne: false, splash: (age - travel) / SPLASH_DURATION, size: scale });
      }
    }
  }
  return marks;
}

export type Gust = { x1: number; y1: number; x2: number; y2: number; hookX: number; hookY: number; alpha: number; hooked: boolean };

/** Canvas stand-in for wind.gdshader: strands stay put and grow along the wind, with a 1×–20× cycle and an occasional short hook. */
export function gusts(frame: number, wind: ResolvedWind): Gust[] {
  if (!wind.enabled || wind.strength <= 0) return [];
  const clock = frame / 30 * gustSpeedScale(wind.gust) * Math.max(wind.speed, 0.05);
  const visual = windVisualScale(wind.strength);
  const result: Gust[] = [];
  for (let i = 0; i < 42; i++) {
    const cellX = i % 7, cellY = Math.floor(i / 7);
    const cycle = Math.floor(clock * 0.22 + hash01(i + 2.7));
    const life = (clock * 0.22 + hash01(i + 2.7)) % 1;
    const keep = hash01(cellX * 13.1 + cellY * 7.7 + cycle * 3.1);
    if (keep > 0.35 + wind.strength * 0.45) continue;
    const origin = { x: 100 + (cellX + 0.15 + hash01(i + cycle * 9.2) * 0.7) * (1080 / 7), y: (cellY + 0.2 + hash01(i + 4.4 + cycle) * 0.6) * (720 / 6) };
    const length = (90 + hash01(i + 8.8) * 150) * visual;
    const head = Math.min(1, life / 0.58), tail = Math.max(0, (life - 0.28) / 0.72);
    const bow = (hash01(i + 1.7) - 0.5) * 28 * visual;
    const start = tail, end = head;
    if (end - start < 0.04) continue;
    const at = (t: number) => ({
      x: origin.x + wind.x * length * t - wind.y * Math.sin(t * Math.PI) * bow,
      y: origin.y + wind.y * length * t + wind.x * Math.sin(t * Math.PI) * bow,
    });
    const a = at(start), b = at(end);
    const hooked = hash01(i + cycle * 1.9) > 0.76 && head > 0.72;
    const tip = at(Math.min(head, 0.92));
    result.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, hookX: tip.x + wind.y * 18, hookY: tip.y - wind.x * 18, alpha: (0.18 + wind.strength * 0.35) * (1 - tail), hooked });
  }
  return result;
}
