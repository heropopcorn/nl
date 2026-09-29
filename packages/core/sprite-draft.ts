import { z } from 'zod';

const localSource = (extensions: string) => z.string().regex(new RegExp(`^/api/workspace/media/[a-f0-9]{64}\\.(${extensions})$`));
const png = localSource('png');
export const spriteDraftSchema = z.object({
  id: z.string().uuid(), version: z.literal(1), name: z.string().trim().min(1).max(200),
  categoryId: z.string().max(200), updatedAt: z.number().int().nonnegative(),
  source: z.object({ src: localSource('mp4|webm|mov|mkv'), name: z.string().min(1).max(255), type: z.enum(['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska']) }),
  frames: z.array(z.object({
    id: z.string().min(1).max(200), index: z.number().int().min(0).max(119),
    time: z.number().finite().nonnegative(), enabled: z.boolean(), cutout: z.boolean(),
    width: z.number().int().min(1).max(8192), height: z.number().int().min(1).max(8192), src: png,
  })).max(120).refine(frames => new Set(frames.map(f => f.id)).size === frames.length, '抽帧 ID 不可重复'),
  extract: z.object({ mode: z.enum(['fps', 'interval']), fps: z.number().min(0.25).max(60), interval: z.number().min(0.01).max(10), maxFrames: z.number().int().min(1).max(120), maxDimension: z.number().int().min(0).max(2048) }),
  pack: z.object({ columns: z.number().int().min(0).max(64), padding: z.number().int().min(0).max(64), spacing: z.number().int().min(0).max(64), cellWidth: z.number().int().min(0).max(2048), cellHeight: z.number().int().min(0).max(2048), pivot: z.enum(['center', 'bottom', 'top-left']) }),
  threshold: z.number().min(8).max(120), crop: z.boolean(), fps: z.number().min(0.1).max(60),
  output: z.object({ src: png }).nullable(),
});
export type SpriteDraft = z.infer<typeof spriteDraftSchema>;
