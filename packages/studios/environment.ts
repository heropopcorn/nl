import { type Shot, type Effect } from '../core';
import { containsPoint, regionPoints } from '../core/geometry';
import { actorPosition } from '../core/routes';
import type { MediaAsset } from '../core/media';
import { gusts, lightningFlash, rainMarks, rainSamples, resolveWind } from './weather';
import type { WaterSurface } from './water';

export const random = (seed: number) => { let x = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; return (Math.imul(x, 0xc2b2ae35) >>> 0) / 4294967296; };
export type DrawItem = { layer: number; y: number; draw: () => void };
export const depthCompare = (a: Pick<DrawItem, 'layer' | 'y'>, b: Pick<DrawItem, 'layer' | 'y'>) => a.layer - b.layer || b.y - a.y;
const sx = (x: number) => 100 + x * 1080 / 1536;
const sy = (y: number) => 720 - y * 720 / 1024;
const k = 720 / 1024;
export function particles(effect: Effect, frame: number, regionIndex: number) {
  const r = effect.regions[regionIndex];
  if (effect.type === 'rain') return rainSamples(effect, frame, regionIndex);
  const count = Math.ceil(effect.intensity * (effect.type === 'fog' ? 28 : 600) * r.width * r.height / (1536 * 1024));
  return Array.from({ length: count }, (_, i) => {
    const seed = effect.seed + i * 17 + regionIndex * 10007;
    const phase = random(seed + 3) + frame / 30 * effect.speed * (effect.type === 'snow' ? 0.18 : 0.85);
    return { x: r.x + random(seed) * r.width, y: r.y + random(seed + 1) * r.height, phase: phase - Math.floor(phase), size: 1 + random(seed + 2) * 2 };
  }).filter(p => containsPoint(r, p));
}
export function compositeEnvironment(ctx: CanvasRenderingContext2D, shot: Shot, frame: number, player: HTMLImageElement, background: CanvasImageSource, sprites: Record<string, HTMLImageElement> = {}, assets: MediaAsset[] = [], water?: WaterSurface, actorFrame = frame, effectFrames?: Record<string, number>, lightningFrame = frame) {
  const items: DrawItem[] = [];
  for (const actor of shot.actors) {
    if (!actor.enabled) continue;
    const p = actorPosition(actor, shot, actorFrame), image = sprites[actor.assetId] ?? player, asset = assets.find(a => a.id === actor.assetId);
    const columns = asset?.columns ?? 1, rows = asset?.rows ?? 1, cell = Math.floor(frame / 30 * (asset?.fps ?? 12)) % (columns * rows);
    items.push({ layer: actor.layer, y: actor.sortY === null ? p.y : actor.sortY + p.y - actor.start.y, draw: () => {
      ctx.save(); ctx.translate(sx(p.x), sy(p.y)); ctx.rotate(-actor.rotation * Math.PI / 180); ctx.scale(actor.scale * (actor.flipX ? -1 : 1), actor.scale * (actor.flipY ? -1 : 1));
      const dw = actor.width * k, dh = actor.height * k;
      if (actor.assetId === 'farmer_blue') {
        const tinted = document.createElement('canvas'); tinted.width = Math.max(1, Math.ceil(dw)); tinted.height = Math.max(1, Math.ceil(dh));
        const g = tinted.getContext('2d')!;
        g.drawImage(image, cell % columns * image.naturalWidth / columns, Math.floor(cell / columns) * image.naturalHeight / rows, image.naturalWidth / columns, image.naturalHeight / rows, 0, 0, tinted.width, tinted.height);
        g.globalCompositeOperation = 'source-atop'; g.fillStyle = '#2f6fbe'; g.globalAlpha = 0.55; g.fillRect(0, 0, tinted.width, tinted.height);
        ctx.drawImage(tinted, -dw / 2, -dh, dw, dh);
      } else ctx.drawImage(image, cell % columns * image.naturalWidth / columns, Math.floor(cell / columns) * image.naturalHeight / rows, image.naturalWidth / columns, image.naturalHeight / rows, -dw / 2, -dh, dw, dh);
      ctx.restore();
    } });
  }
  for (const effect of shot.effects) {
    if (effect.type === 'lightning') continue;
    const effectFrame = effectFrames?.[effect.id] ?? frame;
    if (!effect.enabled || (effect.type !== 'cutout' && effect.intensity === 0)) continue;
    effect.regions.forEach((r, ri) => {
      const x = sx(r.x), y = sy(r.y + r.height), w = r.width * k, h = r.height * k;
      const clipped = (draw: () => void) => () => { ctx.save(); ctx.beginPath(); regionPoints(r).forEach((p, i) => { if (i === 0) ctx.moveTo(sx(p.x), sy(p.y)); else ctx.lineTo(sx(p.x), sy(p.y)); }); ctx.closePath(); ctx.clip(); draw(); ctx.restore(); };
      if (effect.type === 'cutout') {
        items.push({ layer: effect.layer, y: effect.sortY ?? r.y, draw: clipped(() => ctx.drawImage(background, 0, 0, 1280, 720)) });
      } else if (effect.type === 'rain') {
        const sceneWind = resolveWind(shot.wind);
        for (const mark of rainMarks(effect, effectFrame, ri, sceneWind)) {
          items.push({ layer: effect.layer, y: effect.sortY ?? mark.layerY, draw: () => {
            ctx.save();
            ctx.strokeStyle = `rgba(209,231,255,${0.45 + effect.intensity * 0.35})`;
            ctx.lineWidth = Math.max(0.52, Math.min(1.55, 0.85 * mark.size));
            if (mark.airborne) { ctx.beginPath(); ctx.moveTo(mark.tailX, mark.tailY); ctx.lineTo(mark.headX, mark.headY); ctx.stroke(); }
            else { ctx.globalAlpha = 1 - mark.splash; ctx.beginPath(); ctx.ellipse(mark.landingX, mark.landingY, (1 + mark.splash * 9) * mark.size, (1 + mark.splash * 3) * mark.size, 0, 0, Math.PI * 2); ctx.stroke(); }
            ctx.restore();
          } });
        }
      } else if (effect.type === 'snow') {
        for (const p of particles(effect, effectFrame, ri)) {
          items.push({ layer: effect.layer, y: effect.sortY ?? p.y, draw: clipped(() => {
            const airborne = p.phase < 0.82;
            const t = Math.min(1, p.phase / 0.82);
            const drift = Math.max(-1, Math.min(1, effect.wind + (shot.wind.enabled ? resolveWind(shot.wind).x * resolveWind(shot.wind).strength : 0)));
            const px = sx(p.x) - (1 - t) * drift * 110, py = sy(p.y) - (1 - t) * 110;
            ctx.fillStyle = '#edf5fff0';
            ctx.globalAlpha = airborne ? 0.9 : (1 - p.phase) / 0.18;
            ctx.beginPath(); ctx.arc(px + Math.sin(t * 8 + p.x) * 8 * (1 - t), py, p.size, 0, Math.PI * 2); ctx.fill();
          }) });
        }
      } else {
        items.push({ layer: effect.layer, y: effect.sortY ?? r.y, draw: clipped(() => {
          const time = effectFrame / 30 * effect.speed;
          if (effect.type === 'fog') {
            for (const p of particles(effect, 0, ri)) {
              const drift = ((p.x - r.x + time * (15 + effect.wind * 35)) % r.width + r.width) % r.width;
              const px = sx(r.x + drift), py = sy(p.y), radius = 100 + p.size * 40;
              const gradient = ctx.createRadialGradient(px, py, 0, px, py, radius);
              gradient.addColorStop(0, `rgba(220,232,238,${effect.intensity * 0.18})`); gradient.addColorStop(1, 'rgba(220,232,238,0)');
              ctx.fillStyle = gradient; ctx.fillRect(px - radius, py - radius, radius * 2, radius * 2);
            }
          } else {
            if (water) ctx.drawImage(water.render(ctx.canvas, effect, ri, effectFrame), 0, 0);
          }
        }) });
      }
    });
  }
  ctx.save(); ctx.beginPath(); ctx.rect(100, 0, 1080, 720); ctx.clip();
  items.sort(depthCompare).forEach(item => item.draw());
  const sceneWind = resolveWind(shot.wind);
  ctx.lineCap = 'round';
  for (const gust of gusts(frame, sceneWind)) {
    const stroke = (points: { x: number; y: number; alpha?: number }[], hook = false) => {
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i];
        const fade = hook ? gust.hookAlpha * (1 - i / points.length) : ((a.alpha ?? 0) + (b.alpha ?? 0)) / 2;
        if (fade < 0.01) continue;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
        ctx.lineWidth = gust.width * Math.sqrt(fade) + 0.9;
        ctx.strokeStyle = `rgba(87,107,99,${gust.alpha * fade * 0.3})`; ctx.stroke();
        ctx.lineWidth = gust.width * Math.sqrt(fade);
        ctx.strokeStyle = `rgba(245,237,196,${gust.alpha * fade})`; ctx.stroke();
      }
    };
    stroke(gust.points); stroke(gust.hook, true);
  }
  const light = shot.lighting;
  if (light.time === 'morning' || light.time === 'evening') {
    ctx.fillStyle = light.time === 'morning' ? '#ffd38426' : '#b7443055'; ctx.fillRect(100, 0, 1080, 720);
  } else if (light.time === 'night') {
    ctx.fillStyle = `rgba(3,10,32,${1 - light.ambient})`; ctx.fillRect(100, 0, 1080, 720);
    const moon = ctx.createRadialGradient(920, 100, 20, 920, 100, 850);
    moon.addColorStop(0, `rgba(150,191,255,${light.moon * 0.38})`); moon.addColorStop(1, 'rgba(150,191,255,0)');
    ctx.fillStyle = moon; ctx.fillRect(100, 0, 1080, 720);
  }
  const flashes = shot.effects.filter(e => e.type === 'lightning' && e.enabled).map(e => ({ frame: effectFrames?.[e.id] ?? frame, interval: 6 / Math.max(0.1, e.speed), intensity: e.intensity }));
  if (shot.lightning.enabled) flashes.push({ frame: lightningFrame, interval: shot.lightning.interval, intensity: shot.lightning.intensity });
  for (const thunder of flashes) {
    const flash = lightningFlash(thunder.frame, thunder.interval) * thunder.intensity;
    ctx.fillStyle = `rgba(218,235,255,${flash * 0.65})`; ctx.fillRect(100, 0, 1080, 720);
    if (flash > 0.1) { ctx.strokeStyle = `rgba(240,250,255,${flash})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(840, 0); ctx.lineTo(780, 100); ctx.lineTo(820, 90); ctx.lineTo(720, 250); ctx.stroke(); }
  }
  ctx.restore();
}
