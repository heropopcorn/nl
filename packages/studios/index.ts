import { Application, Assets, Graphics, Sprite } from 'pixi.js';
import { locate, type Project, type Shot } from '../core';
import { compositeEnvironment } from './environment';
import { manifestSchema, resolveBackground, type BackgroundManifest, type Quality } from '../core/backgrounds';
import { builtinAssets } from '../core/media';
import type { ThreeStudio } from './three';
import { WaterSurface } from './water';
import { PendingLoads } from './pending-loads';
export type LivePreview = { environmentFrame: number; effectFrames: Record<string, number>; lightningFrame: number };

export interface Studio {
  render(shot: Shot, frame: number, backgroundUrl?: string): HTMLCanvasElement;
  dispose(): void;
}
class PixiStudio implements Studio {
  private backgroundKey = '';
  constructor(private app: Application, private textures: Record<string, Awaited<ReturnType<typeof Assets.load>>>) {}
  render(shot: Shot, frame: number, backgroundUrl = `/art/${shot.background}.png`) {
    const key = shot.blank ? `blank:${shot.blankColor}` : backgroundUrl;
    if (key === this.backgroundKey) return this.app.canvas as HTMLCanvasElement;
    this.app.stage.removeChildren().forEach(child => child.destroy());
    if (shot.blank) {
      const panel = new Graphics();
      panel.rect(100, 0, 1080, 720).fill(shot.blankColor);
      this.app.stage.addChild(panel);
    } else {
      if (!this.textures[backgroundUrl]) throw new Error('背景尚未加载');
      const bg = new Sprite(this.textures[backgroundUrl]);
      bg.width = 1080; bg.height = 720; bg.x = 100;
      this.app.stage.addChild(bg);
    }
    this.app.render();
    this.backgroundKey = key;
    return this.app.canvas as HTMLCanvasElement;
  }
  dispose() { this.app.destroy(true, { children: true, texture: false }); }
}
class MotionStudio implements Studio {
  canvas = Object.assign(document.createElement('canvas'), { width: 1280, height: 720 });
  render(_shot: Shot, frame: number) {
    const ctx = this.canvas.getContext('2d')!;
    ctx.fillStyle = '#101d2b'; ctx.fillRect(0, 0, 1280, 720);
    ctx.textAlign = 'center'; ctx.fillStyle = '#e5ecec'; ctx.font = '28px sans-serif';
    ctx.fillText(_shot.motionTitle, 640, 80);
    const labels = _shot.motionLabels;
    const colors = ['#74cba2', '#ee8778', '#c8a76a', '#e8dbc0', '#6daee3'];
    const points = labels.map((_, i) => ({ x: 640 + Math.cos(i * Math.PI * 2 / 5 - Math.PI / 2) * 225, y: 350 + Math.sin(i * Math.PI * 2 / 5 - Math.PI / 2) * 225 }));
    points.forEach((p, i) => {
      const next = points[(i + 1) % 5];
      ctx.strokeStyle = '#425766'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(next.x, next.y); ctx.stroke();
    });
    const progress = (frame / 30) % 5, index = Math.floor(progress), t = progress - index;
    const p = points[index], q = points[(index + 1) % 5];
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(p.x + (q.x - p.x) * t, p.y + (q.y - p.y) * t, 8, 0, Math.PI * 2); ctx.fill();
    points.forEach((p, i) => {
      ctx.fillStyle = colors[i]; ctx.beginPath(); ctx.arc(p.x, p.y, 42, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#10232d'; ctx.font = '32px sans-serif'; ctx.fillText(labels[i], p.x, p.y + 11);
    });
    return this.canvas;
  }
  dispose() { this.canvas.remove(); }
}
export class DirectorRenderer {
  private water?: WaterSurface;
  private three?: ThreeStudio;
  private disposed = false;
  private pending = new PendingLoads();
  private constructor(private pixi: Studio, private motion: Studio, private images: Record<string, HTMLImageElement>, public readonly manifest: BackgroundManifest, private textures: Record<string, Awaited<ReturnType<typeof Assets.load>>>) {}
  static async create() {
    const app = new Application();
    await app.init({ width: 1280, height: 720, autoStart: false, sharedTicker: false, preference: 'webgl', backgroundColor: '#0a1018', preserveDrawingBuffer: true });
    const textures: Record<string, Awaited<ReturnType<typeof Assets.load>>> = {};
    try {
      const response = await fetch('/assets.json');
      if (!response.ok) throw new Error('背景清单加载失败');
      const manifest = manifestSchema.parse(await response.json());
      const images: Record<string, HTMLImageElement> = {};
      await Promise.all([
        ...[...new Set(['protagonist_village', 'village_school'].map(name => manifest[name].default.url))].map(async url => {
          textures[url] = await Assets.load(url);
        }),
        (async () => {
          const img = new Image(); img.src = '/art/player.png'; await img.decode();
          images.player = images['/art/player.png'] = img;
        })(),
      ]);
      return new DirectorRenderer(new PixiStudio(app, textures), new MotionStudio(), images, manifest, textures);
    } catch (error) { app.destroy(true); throw error; }
  }
  isPrepared(project: Project, frame: number, quality: Quality = 'default') {
    const { shot } = locate(project, frame);
    if (shot.studio === 'three') return !!this.three && this.three.isPrepared(shot, project.assets);
    const actorsReady = shot.actors.filter(a => a.enabled).every(a => { const asset = [...builtinAssets, ...project.assets].find(m => m.id === a.assetId); return !!asset && !!this.images[asset.src]; });
    return shot.studio !== 'pixi' || ((shot.blank || !!this.textures[resolveBackground(this.manifest, shot, quality, project.assets).url]) && actorsReady);
  }
  async prepare(project: Project, frame: number, quality: Quality = 'default') {
    if (this.disposed) throw new Error('影棚已关闭');
    const { shot } = locate(project, frame);
    if (shot.studio === 'three') {
      if (!this.three) {
        const { ThreeStudio } = await import('./three');
        if (this.disposed) throw new Error('影棚已关闭');
        this.three ??= new ThreeStudio();
      }
      await this.three.prepare(shot, project.assets); return;
    }
    if (shot.studio !== 'pixi') return;
    const mediaAssets = [...builtinAssets, ...project.assets];
    // Resolve everything before starting async work, so validation errors cannot
    // leave a partially constructed Promise.all with unobserved rejections.
    const actors = shot.actors.filter(a => a.enabled).map(actor => {
      const media = mediaAssets.find(m => m.id === actor.assetId);
      if (!media) throw new Error(`缺失资源：${actor.name}`);
      return media;
    });
    const background = shot.blank ? undefined : resolveBackground(this.manifest, shot, quality, project.assets);
    const loads = actors.map(media => {
      if (this.images[media.src]) return Promise.resolve();
      return this.pending.run(`image:${media.src}`, async () => {
        const img = new Image(); img.src = media.src; await img.decode();
        if (!this.disposed) this.images[media.src] = img;
      });
    });
    if (background && !this.textures[background.url]) {
      loads.push(this.pending.run(`texture:${background.url}`, async () => {
        const texture = await Assets.load(background.url);
        if (!this.disposed) this.textures[background.url] = texture;
      }));
    }
    await Promise.all(loads);
    if (this.disposed) throw new Error('影棚已关闭');
  }
  render(project: Project, frame: number, output: HTMLCanvasElement, quality: Quality = 'default', live?: LivePreview) {
    const { shot, local } = locate(project, frame);
    const source = (shot.studio === 'pixi' ? this.pixi : shot.studio === 'three' ? this.three! : this.motion).render(shot, local, shot.studio === 'pixi' && !shot.blank ? resolveBackground(this.manifest, shot, quality, project.assets).url : undefined);
    const ctx = output.getContext('2d')!;
    ctx.drawImage(source, 0, 0);
    if (shot.studio === 'pixi') {
      if (shot.effects.some(e => e.type === 'water' && e.enabled && e.intensity > 0 && e.regions.length)) this.water ??= new WaterSurface();
      const media = [...builtinAssets, ...project.assets];
      compositeEnvironment(ctx, shot, live?.environmentFrame ?? local, this.images.player, source, Object.fromEntries(media.map(a => [a.id, this.images[a.src]])), media, this.water, local, live?.effectFrames, live?.lightningFrame);
    }
    const caption = shot.subtitles.find(s => local >= s.start && local < s.end)?.text ?? shot.caption;
    if (caption && !live) {
      ctx.fillStyle = '#000000aa'; ctx.fillRect(0, 648, 1280, 72);
      ctx.fillStyle = 'white'; ctx.font = '24px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(caption, 640, 693, 1200);
    }
  }
  dispose() { if (this.disposed) return; this.disposed = true; this.pixi.dispose(); this.motion.dispose(); this.three?.dispose(); this.water?.dispose(); }
}
