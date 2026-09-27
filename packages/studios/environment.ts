import { position, type Shot, type Effect } from '../core';
import { containsPoint, regionPoints } from '../core/geometry';
import { actorPosition, alongPath } from '../core/routes';
import type { MediaAsset } from '../core/media';

export const random = (seed: number) => { let x = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; return (Math.imul(x, 0xc2b2ae35) >>> 0) / 4294967296; };
export type DrawItem = { layer: number; y: number; draw: () => void };
export const depthCompare = (a: Pick<DrawItem, 'layer' | 'y'>, b: Pick<DrawItem, 'layer' | 'y'>) => a.layer - b.layer || b.y - a.y;
const sx = (x: number) => 100 + x * 1080 / 1536;
const sy = (y: number) => 720 - y * 720 / 1024;
const k = 720 / 1024;
export function particles(effect: Effect, frame: number, regionIndex: number) {
  const r = effect.regions[regionIndex];
  const count = Math.ceil(effect.intensity * (effect.type === 'fog' ? 28 : 600) * r.width * r.height / (1536 * 1024));
  return Array.from({ length: count }, (_, i) => {
    const seed = effect.seed + i * 17 + regionIndex * 10007;
    const phase = random(seed + 3) + frame / 30 * effect.speed * (effect.type === 'snow' ? 0.18 : 0.85);
    return { x: r.x + random(seed) * r.width, y: r.y + random(seed + 1) * r.height, phase: phase - Math.floor(phase), size: 1 + random(seed + 2) * 2 };
  }).filter(p => containsPoint(r, p));
}
export function compositeEnvironment(ctx: CanvasRenderingContext2D, shot: Shot, frame: number, player: HTMLImageElement, background: CanvasImageSource, sprites: Record<string, HTMLImageElement> = {}, assets: MediaAsset[] = []) {
  const items: DrawItem[] = [];
  for (const actor of shot.actors) {
    if (!actor.enabled) continue;
    const p = actorPosition(actor, shot, frame), image = sprites[actor.assetId] ?? player, asset = assets.find(a => a.id === actor.assetId);
    const columns = asset?.columns ?? 1, rows = asset?.rows ?? 1, cell = Math.floor(frame / 30 * (asset?.fps ?? 12)) % (columns * rows);
    items.push({ layer: actor.layer, y: actor.sortY === null ? p.y : actor.sortY + p.y - actor.start.y, draw: () => {
      ctx.save(); ctx.translate(sx(p.x), sy(p.y)); ctx.rotate(-actor.rotation * Math.PI / 180); ctx.scale(actor.scale * (actor.flipX ? -1 : 1), actor.scale * (actor.flipY ? -1 : 1));
      ctx.drawImage(image, cell % columns * image.naturalWidth / columns, Math.floor(cell / columns) * image.naturalHeight / rows, image.naturalWidth / columns, image.naturalHeight / rows, -actor.width * k / 2, -actor.height * k, actor.width * k, actor.height * k); ctx.restore();
    } });
  }
  for (const effect of shot.effects) {
    if (!effect.enabled || (effect.type !== 'cutout' && effect.intensity === 0)) continue;
    effect.regions.forEach((r, ri) => {
      const x = sx(r.x), y = sy(r.y + r.height), w = r.width * k, h = r.height * k;
      const clipped = (draw: () => void) => () => { ctx.save(); ctx.beginPath(); regionPoints(r).forEach((p, i) => { if (i === 0) ctx.moveTo(sx(p.x), sy(p.y)); else ctx.lineTo(sx(p.x), sy(p.y)); }); ctx.closePath(); ctx.clip(); draw(); ctx.restore(); };
      if (effect.type === 'cutout') {
        items.push({ layer: effect.layer, y: effect.sortY ?? r.y, draw: clipped(() => ctx.drawImage(background, 0, 0, 1280, 720)) });
      } else if (effect.type === 'rain' || effect.type === 'snow') {
        for (const p of particles(effect, frame, ri)) {
          items.push({ layer: effect.layer, y: effect.sortY ?? p.y, draw: clipped(() => {
            const fall = effect.type === 'rain' ? 230 : 110;
            const airborne = p.phase < 0.82;
            const t = Math.min(1, p.phase / 0.82);
            const wind = Math.max(-1, Math.min(1, effect.wind + (shot.wind.enabled ? shot.wind.strength : 0)));
            const px = sx(p.x) - (1 - t) * wind * fall, py = sy(p.y) - (1 - t) * fall;
            ctx.strokeStyle = '#d1e7ffb0'; ctx.fillStyle = '#edf5fff0'; ctx.lineWidth = 1.4;
            if (effect.type === 'snow') {
              ctx.globalAlpha = airborne ? 0.9 : (1 - p.phase) / 0.18;
              ctx.beginPath(); ctx.arc(px + Math.sin(t * 8 + p.x) * 8 * (1 - t), py, p.size, 0, Math.PI * 2); ctx.fill();
            } else if (airborne) {
              ctx.beginPath(); ctx.moveTo(px - wind * 20, py - 20); ctx.lineTo(px, py); ctx.stroke();
            } else if (effect.splashes) {
              const splash = (p.phase - 0.82) / 0.18;
              ctx.globalAlpha = 1 - splash; ctx.beginPath(); ctx.ellipse(sx(p.x), sy(p.y), 1 + splash * 9, 1 + splash * 3, 0, 0, Math.PI * 2); ctx.stroke();
            }
          }) });
        }
      } else {
        items.push({ layer: effect.layer, y: effect.sortY ?? r.y, draw: clipped(() => {
          const time = frame / 30 * effect.speed;
          if (effect.type === 'fog') {
            for (const p of particles(effect, 0, ri)) {
              const drift = ((p.x - r.x + time * (15 + effect.wind * 35)) % r.width + r.width) % r.width;
              const px = sx(r.x + drift), py = sy(p.y), radius = 100 + p.size * 40;
              const gradient = ctx.createRadialGradient(px, py, 0, px, py, radius);
              gradient.addColorStop(0, `rgba(220,232,238,${effect.intensity * 0.18})`); gradient.addColorStop(1, 'rgba(220,232,238,0)');
              ctx.fillStyle = gradient; ctx.fillRect(px - radius, py - radius, radius * 2, radius * 2);
            }
          } else {
            ctx.fillStyle = `rgba(28,145,176,${effect.intensity * 0.25})`; ctx.fillRect(x, y, w, h);
            ctx.strokeStyle = `rgba(170,239,255,${effect.intensity * 0.7})`; ctx.lineWidth = 1.4;
            for (let i = 0; i < 90; i++) {
              if (effect.flowLines.length) {
                const line = effect.flowLines[i % effect.flowLines.length], distance = time * 80 + random(effect.seed + i) * 2500;
                const a = alongPath(line, distance, true), b = alongPath(line, distance + 18, true);
                if (Math.hypot(a.x - b.x, a.y - b.y) < 40) { ctx.beginPath(); ctx.moveTo(sx(a.x), sy(a.y)); ctx.lineTo(sx(b.x), sy(b.y)); ctx.stroke(); }
                continue;
              }
              const direction = effect.wind < 0 ? -1 : 1;
              const px = x + ((random(effect.seed + i * 7) * w + time * direction * (25 + Math.abs(effect.wind) * 60)) % w + w) % w;
              const py = y + random(effect.seed + i * 7 + 1) * h;
              ctx.beginPath(); ctx.moveTo(px, py); ctx.quadraticCurveTo(px + 12, py - 3, px + 26, py); ctx.stroke();
            }
          }
        }) });
      }
    });
  }
  ctx.save(); ctx.beginPath(); ctx.rect(100, 0, 1080, 720); ctx.clip();
  items.sort(depthCompare).forEach(item => item.draw());
  if (shot.wind.enabled) {
    ctx.strokeStyle = `rgba(223,242,244,${Math.abs(shot.wind.strength) * 0.35})`; ctx.lineWidth = 1;
    for (let i = 0; i < 45; i++) { const x = 100 + ((random(i + 891) * 1080 + frame * shot.wind.speed * shot.wind.strength * 8) % 1080 + 1080) % 1080, y = random(i + 210) * 720; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 35, y - 6, x + 70, y); ctx.stroke(); }
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
  if (shot.lightning.enabled) {
    const phase = frame / 30 % shot.lightning.interval;
    const flash = Math.max(Math.exp(-phase * 18), Math.exp(-Math.abs(phase - 0.18) * 34) * 0.72) * shot.lightning.intensity;
    ctx.fillStyle = `rgba(218,235,255,${flash * 0.65})`; ctx.fillRect(100, 0, 1080, 720);
    if (flash > 0.1) { ctx.strokeStyle = `rgba(240,250,255,${flash})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(840, 0); ctx.lineTo(780, 100); ctx.lineTo(820, 90); ctx.lineTo(720, 250); ctx.stroke(); }
  }
  ctx.restore();
}
