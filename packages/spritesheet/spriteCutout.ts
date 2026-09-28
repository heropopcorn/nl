// Adapted from imageHandle main d87aaa2 (src/lib/spriteCutout.ts).
import { canvasToBlob, loadImageFromFile } from "./images";
import {
  bufferToCanvas,
  extractAutoCutoutPlaced,
  imageToBuffer,
  removeBackgroundByFlood,
} from "./matting";
import type { SpriteFrame } from "./spriteFrames";

/**
 * Optional per-frame cutout.
 *
 * rembg (U2Net / ONNX) cannot run reasonably in this Vite client, and Vercel
 * Functions cannot host Python rembg / long video jobs. Reuse the editor's
 * edge-flood background removal so extract → select → pack still ships.
 */
export async function cutoutFrame(
  frame: SpriteFrame,
  threshold: number,
  crop: boolean,
): Promise<SpriteFrame> {
  const image = await loadImageFromFile(frame.blob);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const canvas = crop
    ? extractAutoCutoutPlaced(image, width, height, threshold).canvas
    : bufferToCanvas(removeBackgroundByFlood(imageToBuffer(image, width, height), threshold));
  const blob = await canvasToBlob(canvas);
  return {
    ...frame,
    blob,
    width: canvas.width,
    height: canvas.height,
    cutout: true,
    previewUrl: URL.createObjectURL(blob),
  };
}
