// Adapted from imageHandle main d87aaa2 (src/lib/spriteExtract.ts).
import { canvasToBlob, createCanvas } from "./images";
import { uid } from "./id";
import {
  assertVideoFile,
  clampExtractSettings,
  fitMaxDimension,
  sampleTimestamps,
  type SpriteExtractSettings,
  type SpriteFrame,
} from "./spriteFrames";

/**
 * Browser video-frame extraction.
 *
 * Vercel serverless cannot run ffmpeg / opencv / rembg, and ffmpeg.wasm needs
 * Cross-Origin Isolation (COOP/COEP + SharedArrayBuffer) plus a large WASM
 * download. This first version uses the browser decoder via HTMLVideoElement +
 * canvas, which works for MP4 / WebM the current browser can play.
 */

export type ExtractProgress = { current: number; total: number };

function waitForEvent(target: EventTarget, event: string, timeoutMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for video"));
    }, timeoutMs);
    const onOk = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error("Could not decode video"));
    };
    const onAbort = () => { cleanup(); reject(new DOMException('Aborted', 'AbortError')); };
    const cleanup = () => {
      window.clearTimeout(timer);
      target.removeEventListener(event, onOk);
      target.removeEventListener("error", onErr);
      signal?.removeEventListener('abort', onAbort);
    };
    target.addEventListener(event, onOk, { once: true });
    target.addEventListener("error", onErr, { once: true });
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function seekVideo(video: HTMLVideoElement, time: number, signal?: AbortSignal): Promise<void> {
  const target = Math.min(Math.max(0, time), Math.max(0, (video.duration || 0) - 0.001));
  if (Number.isFinite(video.currentTime) && Math.abs(video.currentTime - target) < 0.0005 && video.readyState >= 2) {
    return;
  }
  const seeked = waitForEvent(video, "seeked", 8000, signal);
  video.currentTime = target;
  await seeked;
}

function captureFrame(video: HTMLVideoElement, maxDimension: number): HTMLCanvasElement {
  const srcW = video.videoWidth;
  const srcH = video.videoHeight;
  if (!srcW || !srcH) throw new Error("Video has no picture");
  const size = fitMaxDimension(srcW, srcH, maxDimension);
  if (size.width * size.height > 4194304) throw new Error('单帧过大，请设置缩放尺寸（建议 512）');
  const canvas = createCanvas(size.width, size.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas is not available");
  ctx.drawImage(video, 0, 0, size.width, size.height);
  return canvas;
}

export async function extractFramesFromVideo(
  file: File,
  settings: SpriteExtractSettings,
  onProgress?: (progress: ExtractProgress) => void,
  signal?: AbortSignal,
): Promise<{ frames: SpriteFrame[]; duration: number; width: number; height: number }> {
  assertVideoFile(file);
  const extract = clampExtractSettings(settings);
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  const frames: SpriteFrame[] = [];
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;

  const throwIfAborted = () => {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  };

  try {
    await waitForEvent(video, "loadedmetadata", 20000, signal);
    try {
      await video.play();
      video.pause();
    } catch {
      // Autoplay can fail; seeking still works after loadedmetadata on most browsers.
    }
    throwIfAborted();
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const times = sampleTimestamps(duration, extract);
    const estimatedSize = fitMaxDimension(video.videoWidth, video.videoHeight, extract.maxDimension);
    if (times.length * estimatedSize.width * estimatedSize.height > 67108864) throw new Error('抽帧总像素过大，请减少帧数或缩小尺寸');
    onProgress?.({ current: 0, total: times.length });
    for (let index = 0; index < times.length; index++) {
      throwIfAborted();
      const time = times[index] ?? 0;
      await seekVideo(video, time, signal);
      throwIfAborted();
      const canvas = captureFrame(video, extract.maxDimension);
      const blob = await canvasToBlob(canvas);
      throwIfAborted();
      frames.push({
        id: uid("frame"),
        index,
        time,
        enabled: true,
        blob,
        width: canvas.width,
        height: canvas.height,
        cutout: false,
        previewUrl: URL.createObjectURL(blob),
      });
      onProgress?.({ current: index + 1, total: times.length });
    }
    return {
      frames,
      duration,
      width: video.videoWidth,
      height: video.videoHeight,
    };
  } catch (error) {
    frames.forEach(frame => URL.revokeObjectURL(frame.previewUrl));
    throw error;
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}
