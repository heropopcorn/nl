import type { RainMark } from './weather';

// Geometry is deterministic: pausing/exporting the same frame must not shimmer.
export function splashShape(mark: Pick<RainMark, 'splash' | 'size' | 'landingX' | 'landingY'>) {
  const t = Math.max(0, Math.min(1, mark.splash));
  const seed = Math.sin(mark.landingX * 12.9898 + mark.landingY * 78.233) * 43758.5453;
  const variation = seed - Math.floor(seed);
  const size = mark.size * (0.8 + variation * 0.35);
  const fade = (1 - t) ** 2;
  const droplets = [-1, 1, -0.45, 0.55].map((direction, i) => {
    const flight = Math.min(1, t / (0.62 + i * 0.065));
    const height = (3.5 + ((variation + i * 0.37) % 1) * 4) * size;
    return {
      x: direction * (0.6 + flight * (4 + variation * 3)) * size,
      y: -4 * height * flight * (1 - flight),
      radius: (0.42 + (i % 2) * 0.13) * size,
      alpha: flight >= 1 ? 0 : (1 - flight) * 0.72,
    };
  });
  return { radius: (0.7 + 5.5 * Math.sqrt(t)) * size, alpha: Math.sin(Math.PI * t) * fade * 0.48,
    impact: Math.max(0, 1 - t / 0.18) * 0.65, size, droplets };
}

export function drawRainSplash(ctx: CanvasRenderingContext2D, mark: RainMark) {
  const shape = splashShape(mark);
  ctx.translate(mark.landingX, mark.landingY);
  ctx.strokeStyle = '#c9e0ec'; ctx.fillStyle = '#e1f0f5'; ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(0.45, 0.65 * shape.size);
  // Broken, flattened ripples avoid the old bright expanding "bubble" outlines.
  ctx.globalAlpha = shape.alpha;
  ctx.beginPath();
  ctx.ellipse(0, 0, shape.radius, shape.radius * 0.27, 0, 0.15, Math.PI * 0.85);
  ctx.stroke(); ctx.beginPath();
  ctx.ellipse(0, 0, shape.radius, shape.radius * 0.27, 0, Math.PI * 1.12, Math.PI * 1.8);
  ctx.stroke();
  ctx.globalAlpha = shape.impact;
  ctx.beginPath(); ctx.ellipse(0, 0, 1.3 * shape.size, 0.5 * shape.size, 0, 0, Math.PI * 2); ctx.fill();
  for (const drop of shape.droplets) {
    if (drop.alpha <= 0) continue;
    ctx.globalAlpha = drop.alpha;
    ctx.beginPath(); ctx.ellipse(drop.x, drop.y, drop.radius, drop.radius * 1.35, 0, 0, Math.PI * 2); ctx.fill();
  }
}
