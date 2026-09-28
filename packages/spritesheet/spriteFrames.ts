// Adapted from imageHandle main d87aaa2 (src/lib/spriteFrames.ts).
export const MAX_SPRITE_FRAMES = 120;
export const MAX_VIDEO_BYTES = 80 * 1024 * 1024;
export const DEFAULT_FPS = 12;
export const DEFAULT_INTERVAL = 0.1;
export const DEFAULT_MAX_FRAMES = 48;
export const DEFAULT_MAX_DIMENSION = 512;

export type SpriteExtractMode = "fps" | "interval";

export type SpriteExtractSettings = {
  mode: SpriteExtractMode;
  fps: number;
  interval: number;
  maxFrames: number;
  maxDimension: number;
};

export type SpritePackPivot = "center" | "bottom" | "top-left";

export type SpritePackSettings = {
  /** 0 = auto (ceil sqrt of enabled frames). */
  columns: number;
  padding: number;
  spacing: number;
  /** 0 = auto from the largest enabled frame. */
  cellWidth: number;
  cellHeight: number;
  pivot: SpritePackPivot;
};

export type SpriteFrameMeta = {
  id: string;
  index: number;
  time: number;
  enabled: boolean;
  storage_path?: string;
  width: number;
  height: number;
  cutout: boolean;
};

export type SpriteFrame = SpriteFrameMeta & {
  blob: Blob;
  previewUrl: string;
};

export const DEFAULT_EXTRACT_SETTINGS: SpriteExtractSettings = {
  mode: "fps",
  fps: DEFAULT_FPS,
  interval: DEFAULT_INTERVAL,
  maxFrames: DEFAULT_MAX_FRAMES,
  maxDimension: DEFAULT_MAX_DIMENSION,
};

export const DEFAULT_PACK_SETTINGS: SpritePackSettings = {
  columns: 0,
  padding: 2,
  spacing: 0,
  cellWidth: 0,
  cellHeight: 0,
  pivot: "bottom",
};

function finiteNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function clampExtractSettings(settings: SpriteExtractSettings): SpriteExtractSettings {
  const maxFrames = Math.min(MAX_SPRITE_FRAMES, Math.max(1, Math.round(finiteNumber(settings.maxFrames, DEFAULT_MAX_FRAMES))));
  return {
    mode: settings.mode === "interval" ? "interval" : "fps",
    fps: Math.min(60, Math.max(0.25, finiteNumber(settings.fps, DEFAULT_FPS))),
    interval: Math.min(10, Math.max(0.01, finiteNumber(settings.interval, DEFAULT_INTERVAL))),
    maxFrames,
    maxDimension: Math.min(2048, Math.max(0, Math.round(finiteNumber(settings.maxDimension, 0)))),
  };
}

export function clampPackSettings(settings: SpritePackSettings): SpritePackSettings {
  const pivot: SpritePackPivot =
    settings.pivot === "center" || settings.pivot === "top-left" ? settings.pivot : "bottom";
  return {
    columns: Math.max(0, Math.round(Number(settings.columns) || 0)),
    padding: Math.max(0, Math.round(Number(settings.padding) || 0)),
    spacing: Math.max(0, Math.round(Number(settings.spacing) || 0)),
    cellWidth: Math.max(0, Math.round(Number(settings.cellWidth) || 0)),
    cellHeight: Math.max(0, Math.round(Number(settings.cellHeight) || 0)),
    pivot,
  };
}

export function sampleTimestamps(
  durationSec: number,
  settings: Pick<SpriteExtractSettings, "mode" | "fps" | "interval" | "maxFrames">,
): number[] {
  const duration = Number.isFinite(durationSec) ? Math.max(0, durationSec) : 0;
  const maxFrames = Math.min(MAX_SPRITE_FRAMES, Math.max(1, Math.round(settings.maxFrames)));
  const step =
    settings.mode === "interval"
      ? Math.max(0.01, settings.interval)
      : 1 / Math.max(0.25, settings.fps);
  if (duration <= 0) return [0];

  const last = Math.max(0, duration - 1e-4);
  const count = Math.min(maxFrames, Math.max(1, Math.floor(last / step + 1e-9) + 1));
  const times: number[] = [];
  for (let i = 0; i < count; i++) {
    times.push(Math.min(Math.round(i * step * 1e6) / 1e6, last));
  }
  return times;
}

export function fitMaxDimension(
  width: number,
  height: number,
  maxDimension: number,
): { width: number; height: number } {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  if (!maxDimension || maxDimension <= 0) return { width: w, height: h };
  const longest = Math.max(w, h);
  if (longest <= maxDimension) return { width: w, height: h };
  const scale = maxDimension / longest;
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}

export function enabledFrames<T extends { enabled: boolean }>(frames: readonly T[]): T[] {
  return frames.filter((frame) => frame.enabled);
}

export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return [...items];
  const next = items.slice();
  const [item] = next.splice(from, 1);
  if (!item) return [...items];
  next.splice(to, 0, item);
  return next;
}

export function spriteDownloadStem(name: string): string {
  const trimmed = name.trim().replace(/[^\w\u4e00-\u9fff-]+/g, "_").replace(/^_+|_+$/g, "");
  return trimmed.slice(0, 80) || "spritesheet";
}

export function assertVideoFile(file: File, maxBytes = MAX_VIDEO_BYTES): void {
  if (!file.type.startsWith("video/") && !/\.(mp4|webm|mov|m4v|mkv)$/i.test(file.name)) {
    throw new Error("Need a video file (MP4 / WebM)");
  }
  if (file.size > maxBytes) {
    throw new Error(`Video is larger than ${Math.round(maxBytes / (1024 * 1024))} MB`);
  }
}

export function revokeFrameUrls(frames: readonly SpriteFrame[]): void {
  for (const frame of frames) {
    if (frame.previewUrl.startsWith("blob:")) URL.revokeObjectURL(frame.previewUrl);
  }
}

export function frameMeta(frame: SpriteFrame): SpriteFrameMeta {
  return {
    id: frame.id,
    index: frame.index,
    time: frame.time,
    enabled: frame.enabled,
    storage_path: frame.storage_path,
    width: frame.width,
    height: frame.height,
    cutout: frame.cutout,
  };
}
