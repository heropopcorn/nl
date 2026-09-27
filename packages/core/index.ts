import { z } from 'zod';
import { polygonBounds, validPolygon } from './geometry';
import { mediaSchema, audioTrackSchema, object3dSchema } from './media';
const point = z.object({ x: z.number().finite(), y: z.number().finite() });
export const actorSchema = z.object({ id: z.string(), name: z.string().min(1), start: point, end: point, layer: z.number().int().min(-100).max(100).default(0), assetId: z.string().default('player'), enabled: z.boolean().default(true), width: z.number().min(1).max(8192).default(58 * 1024 / 720), height: z.number().min(1).max(8192).default(84 * 1024 / 720), scale: z.number().min(0.01).max(20).default(1), rotation: z.number().finite().default(0), flipX: z.boolean().default(false), flipY: z.boolean().default(false), sortY: z.number().nullable().default(null), route: z.array(point).max(256).default([]), speed: z.number().min(0).max(1200).default(210), loop: z.boolean().default(false), routeVisible: z.boolean().default(true), collision: z.enum(['ignore', 'stop']).default('ignore') });
export const rectSchema = z.object({ x: z.number().min(0).max(1536), y: z.number().min(0).max(1024), width: z.number().min(1).max(1536), height: z.number().min(1).max(1024), points: z.array(z.object({ x: z.number().min(0).max(1536), y: z.number().min(0).max(1024) })).min(3).max(128).optional() }).refine(r => r.x + r.width <= 1536 && r.y + r.height <= 1024, '范围不能超出背景').refine(r => !r.points || (validPolygon(r.points) && Object.entries(polygonBounds(r.points)).every(([key, value]) => Math.abs(r[key as 'x' | 'y' | 'width' | 'height'] - value) < 0.001)), '多边形不可自交、退化或与包围盒不一致');
export const seasons = ['original', 'spring_early', 'spring_mid', 'spring_late', 'summer_early', 'summer_mid', 'summer_late', 'autumn_early', 'autumn_mid', 'autumn_late', 'winter_early', 'winter_mid', 'winter_late'] as const;
export const effectSchema = z.object({
  id: z.string(), name: z.string().min(1), type: z.enum(['rain', 'snow', 'fog', 'water', 'cutout']),
  enabled: z.boolean().default(true), layer: z.number().int().min(-100).max(100).default(0),
  intensity: z.number().min(0).max(1).default(0.6), speed: z.number().min(0).max(4).default(1),
  wind: z.number().min(-1).max(1).default(0.2), seed: z.number().int().min(0).max(1000000).default(42),
  splashes: z.boolean().default(true), sortY: z.number().min(0).max(1024).nullable().default(null),
  regions: z.array(rectSchema).min(1).max(12),
  collisionEnabled: z.boolean().default(false), flowLines: z.array(z.array(point).min(2).max(128)).max(16).default([]),
});
export type Effect = z.infer<typeof effectSchema>;
export const lightingSchema = z.object({ time: z.enum(['morning', 'noon', 'evening', 'night']).default('noon'), ambient: z.number().min(0).max(1).default(0.35), moon: z.number().min(0).max(1).default(0.65) });
export const shotSchema = z.object({
  id: z.string(), name: z.string().min(1), studio: z.enum(['pixi', 'motion', 'three']),
  frames: z.number().int().min(1).max(18000), caption: z.string(),
  background: z.enum(['protagonist_village', 'village_school']),
  season: z.enum(seasons).default('original'),
  actors: z.array(actorSchema).max(100),
  effects: z.array(effectSchema).max(30).default([]),
  lighting: lightingSchema.prefault({}),
  sceneId: z.string().default('scene-1'), setRef: z.string().nullable().default(null),
  backgroundAssetId: z.string().nullable().default(null), backgroundVersions: z.object({ x2: z.string().optional(), x4: z.string().optional() }).default({}),
  collisionEnabled: z.boolean().default(true), snap: z.number().min(0).max(128).default(0),
  wind: z.object({ enabled: z.boolean().default(false), strength: z.number().min(-1).max(1).default(0.4), speed: z.number().min(0).max(4).default(1) }).prefault({}),
  lightning: z.object({ enabled: z.boolean().default(false), intensity: z.number().min(0).max(1).default(0.7), interval: z.number().min(1).max(60).default(8) }).prefault({}),
  objects3d: z.array(object3dSchema).max(100).default([]),
  camera3d: z.object({ x: z.number().default(5), y: z.number().default(5), z: z.number().default(8), targetY: z.number().default(0), fov: z.number().min(10).max(120).default(45) }).prefault({}),
  subtitles: z.array(z.object({ id: z.string(), start: z.number().int().min(0), end: z.number().int().min(1), text: z.string() }).refine(s => s.end > s.start)).max(200).default([]),
  motionTitle: z.string().default('万物相生 · 五行'), motionLabels: z.array(z.string()).length(5).default(['木', '火', '土', '金', '水']),
});
export const projectSchema = z.object({ version: z.literal(1), name: z.string().min(1), fps: z.literal(30), shots: z.array(shotSchema).min(1).max(100), assets: z.array(mediaSchema).max(200).default([]), audioTracks: z.array(audioTrackSchema).max(16).default([]), chapters: z.array(z.object({ id: z.string(), name: z.string().min(1) })).min(1).max(100).default([{ id: 'chapter-1', name: '第一章' }]), scenes: z.array(z.object({ id: z.string(), name: z.string().min(1), chapterId: z.string() })).min(1).max(200).default([{ id: 'scene-1', name: '初识元力', chapterId: 'chapter-1' }]), sets: z.array(z.object({ id: z.string(), name: z.string(), version: z.number().int().positive(), content: shotSchema })).max(100).default([]) }).refine(p => new Set(p.shots.map(s => s.id)).size === p.shots.length && p.shots.every(s => new Set([...s.actors, ...s.effects].map(a => a.id)).size === s.actors.length + s.effects.length), '元素和镜头 ID 不可重复').refine(p => p.scenes.every(s => p.chapters.some(c => c.id === s.chapterId)) && p.shots.every(s => p.scenes.some(scene => scene.id === s.sceneId)) && new Set(p.assets.map(a => a.id)).size === p.assets.length, '章节/场景引用无效或资源 ID 重复');
export type Project = z.infer<typeof projectSchema>;
export type Shot = Project['shots'][number];
export const totalFrames = (p: Project) => p.shots.reduce((n, s) => n + s.frames, 0);
export function locate(p: Project, frame: number) {
  let local = Math.max(0, Math.min(totalFrames(p) - 1, Math.floor(frame)));
  for (let index = 0; index < p.shots.length; index++) {
    const shot = p.shots[index];
    if (local < shot.frames) return { shot, index, local };
    local -= shot.frames;
  }
  throw new Error('Invalid timeline');
}
export function position(actor: Shot['actors'][number], frame: number, duration: number) {
  const t = Math.max(0, Math.min(1, frame / Math.max(1, duration - 1)));
  return { x: actor.start.x + (actor.end.x - actor.start.x) * t, y: actor.start.y + (actor.end.y - actor.start.y) * t };
}
export const sample: Project = projectSchema.parse({
  version: 1, name: '元力 · 村庄的一天', fps: 30,
  shots: [
    { id: 'village', name: '01 村庄 · 出发', studio: 'pixi', frames: 180, caption: '清晨，从村庄出发。', background: 'protagonist_village', actors: [{ id: 'hero', name: '主角（占位贴图）', start: { x: 460, y: 300 }, end: { x: 1020, y: 450 } }] },
    { id: 'school', name: '02 学校 · 抵达', studio: 'pixi', frames: 180, caption: '来到学堂，探索万物的联系。', background: 'village_school', actors: [{ id: 'student', name: '学生（占位贴图）', start: { x: 560, y: 240 }, end: { x: 850, y: 420 } }] },
    { id: 'elements', name: '03 五行 · 相生', studio: 'motion', frames: 180, caption: '木生火，火生土，土生金，金生水，水生木。', background: 'village_school', actors: [] },
  ],
});
