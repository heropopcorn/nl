import { Application, Assets, Sprite } from 'pixi.js';
import { locate, type Project, type Shot } from '../core';
import { compositeEnvironment } from './environment';
import { manifestSchema, resolveBackground, type BackgroundManifest, type Quality } from '../core/backgrounds';
import { builtinAssets } from '../core/media';
import type { ThreeStudio } from './three';

export interface Studio {
  render(shot: Shot, frame: number, backgroundUrl?: string): HTMLCanvasElement;
  dispose(): void;
}
class PixiStudio implements Studio {
  constructor(private app: Application, private textures: Record<string, Awaited<ReturnType<typeof Assets.load>>>) {}
  render(shot: Shot, frame: number, backgroundUrl = `/art/${shot.background}.png`) {
    this.app.stage.removeChildren().forEach(child => child.destroy());
    if (!this.textures[backgroundUrl]) throw new Error('背景尚未加载');
    const bg = new Sprite(this.textures[backgroundUrl]);
    bg.width = 1080; bg.height = 720; bg.x = 100;
    this.app.stage.addChild(bg);
    this.app.render();
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
  private three?: ThreeStudio;
  private pending = new Map<string, Promise<void>>();
  private constructor(private pixi: Studio, private motion: Studio, private images: Record<string, HTMLImageElement>, public readonly manifest: BackgroundManifest, private textures: Record<string, Awaited<ReturnType<typeof Assets.load>>>) {}
  static async create() {
    const app = new Application();
    await app.init({ width: 1280, height: 720, autoStart: false, sharedTicker: false, preference: 'webgl', backgroundColor: '#0a1018', preserveDrawingBuffer: true });
    const textures: Record<string, Awaited<ReturnType<typeof Assets.load>>> = {};
    try {
      const response = await fetch('/assets.json');
      if (!response.ok) throw new Error('背景清单加载失败');
      const manifest = manifestSchema.parse(await response.json());
      for (const name of ['protagonist_village', 'village_school']) {
        const url = manifest[name].default.url; textures[url] = await Assets.load(url);
      }
      const images: Record<string, HTMLImageElement> = {};
      for (const name of ['player']) {
        const img = new Image(); img.src = `/art/${name}.png`; await img.decode(); images[name] = img;
        images[`/art/${name}.png`] = img;
      }
      return new DirectorRenderer(new PixiStudio(app, textures), new MotionStudio(), images, manifest, textures);
    } catch (error) { app.destroy(true); throw error; }
  }
  isPrepared(project: Project, frame: number, quality: Quality = 'default') {
    const { shot } = locate(project, frame);
    if (shot.studio === 'three') return !!this.three && this.three.isPrepared(shot, project.assets);
    return shot.studio !== 'pixi' || (!!this.textures[resolveBackground(this.manifest, shot, quality, project.assets).url] && shot.actors.filter(a => a.enabled).every(a => { const asset = [...builtinAssets, ...project.assets].find(m => m.id === a.assetId); return !!asset && !!this.images[asset.src]; }));
  }
  async prepare(project: Project, frame: number, quality: Quality = 'default') {
    const { shot } = locate(project, frame);
    if (shot.studio === 'three') { if (!this.three) { const { ThreeStudio } = await import('./three'); this.three ??= new ThreeStudio(); } await this.three.prepare(shot, project.assets); return; }
    if (shot.studio !== 'pixi') return;
    for (const actor of shot.actors.filter(a => a.enabled)) {
      const media = [...builtinAssets, ...project.assets].find(m => m.id === actor.assetId);
      if (!media) throw new Error(`缺失资源：${actor.name}`);
      if (!this.images[media.src]) { const img = new Image(); img.src = media.src; await img.decode(); this.images[media.src] = img; }
    }
    const asset = resolveBackground(this.manifest, shot, quality, project.assets);
    if (this.textures[asset.url]) return;
    if (!this.pending.has(asset.url)) this.pending.set(asset.url, Assets.load(asset.url).then(texture => { this.textures[asset.url] = texture; }).finally(() => this.pending.delete(asset.url)));
    await this.pending.get(asset.url);
  }
  render(project: Project, frame: number, output: HTMLCanvasElement, quality: Quality = 'default') {
    const { shot, local } = locate(project, frame);
    const source = (shot.studio === 'pixi' ? this.pixi : shot.studio === 'three' ? this.three! : this.motion).render(shot, local, shot.studio === 'pixi' ? resolveBackground(this.manifest, shot, quality, project.assets).url : undefined);
    const ctx = output.getContext('2d')!;
    ctx.drawImage(source, 0, 0);
    if (shot.studio === 'pixi') { const media = [...builtinAssets, ...project.assets]; compositeEnvironment(ctx, shot, local, this.images.player, source, Object.fromEntries(media.map(a => [a.id, this.images[a.src]])), media); }
    const caption = shot.subtitles.find(s => local >= s.start && local < s.end)?.text ?? shot.caption;
    if (caption) {
      ctx.fillStyle = '#000000aa'; ctx.fillRect(0, 648, 1280, 72);
      ctx.fillStyle = 'white'; ctx.font = '24px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(caption, 640, 693, 1200);
    }
  }
  dispose() { this.pixi.dispose(); this.motion.dispose(); this.three?.dispose(); }
}
