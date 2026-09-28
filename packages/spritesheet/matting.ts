// Adapted from imageHandle main d87aaa2 (src/lib/matting.ts).
type Point = { x: number; y: number };
type Rect = Point & { width: number; height: number };
import { colorDistance, polygonBounds } from "./geometry";
import { createCanvas } from "./images";

export type PixelBuffer = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

export function cloneBuffer(buffer: PixelBuffer): PixelBuffer {
  return {
    width: buffer.width,
    height: buffer.height,
    data: new Uint8ClampedArray(buffer.data),
  };
}

function indexAt(width: number, x: number, y: number): number {
  return (y * width + x) * 4;
}

export function opaqueBounds(buffer: PixelBuffer, alphaMin = 8): Rect | null {
  let minX = buffer.width;
  let minY = buffer.height;
  let maxX = -1;
  let maxY = -1;
  const { width, height, data } = buffer;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[indexAt(width, x, y) + 3] >= alphaMin) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

export function cropBuffer(buffer: PixelBuffer, rect: Rect, padding = 0): PixelBuffer {
  const x = Math.max(0, Math.floor(rect.x - padding));
  const y = Math.max(0, Math.floor(rect.y - padding));
  const right = Math.min(buffer.width, Math.ceil(rect.x + rect.width + padding));
  const bottom = Math.min(buffer.height, Math.ceil(rect.y + rect.height + padding));
  const width = Math.max(1, right - x);
  const height = Math.max(1, bottom - y);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < height; row++) {
    const src = indexAt(buffer.width, x, y + row);
    data.set(buffer.data.subarray(src, src + width * 4), row * width * 4);
  }
  return { width, height, data };
}

export function applyPolygonMask(buffer: PixelBuffer, points: Point[]): PixelBuffer {
  const out = cloneBuffer(buffer);
  if (points.length < 3) {
    out.data.fill(0);
    return out;
  }

  const { width, height, data } = out;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);

  for (let y = 0; y < height; y++) {
    const crossings: number[] = [];
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const yi = ys[i];
      const yj = ys[j];
      if ((yi > y) !== (yj > y)) {
        const x = xs[i] + ((y - yi) * (xs[j] - xs[i])) / (yj - yi || 1);
        crossings.push(x);
      }
    }
    crossings.sort((a, b) => a - b);
    let inside = false;
    let next = 0;
    for (let x = 0; x < width; x++) {
      while (next < crossings.length && x > crossings[next]) {
        inside = !inside;
        next++;
      }
      if (!inside) data[indexAt(width, x, y) + 3] = 0;
    }
  }
  return out;
}

export function applyMaskBuffer(source: PixelBuffer, mask: PixelBuffer): PixelBuffer {
  const out = cloneBuffer(source);
  const n = out.data.length;
  for (let i = 3; i < n; i += 4) {
    const alpha = mask.data[i] ?? 0;
    out.data[i] = Math.round((out.data[i] * alpha) / 255);
  }
  return out;
}

export function removeBackgroundByFlood(
  buffer: PixelBuffer,
  threshold: number,
  seedRgb?: [number, number, number],
): PixelBuffer {
  const out = cloneBuffer(buffer);
  const { width, height, data } = out;
  const visited = new Uint8Array(width * height);
  const queue: number[] = [];

  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = y * width + x;
    if (visited[i]) return;
    visited[i] = 1;
    queue.push(i);
  };

  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    push(0, y);
    push(width - 1, y);
  }

  const sample = seedRgb ?? averageEdgeColor(buffer);
  const maxDist = Math.max(4, threshold);

  while (queue.length) {
    const i = queue.pop()!;
    const x = i % width;
    const y = (i / width) | 0;
    const pi = i * 4;
    const rgb: [number, number, number] = [data[pi], data[pi + 1], data[pi + 2]];
    if (colorDistance(rgb, sample) > maxDist) continue;
    data[pi + 3] = 0;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }

  featherAlpha(out, 1);
  return out;
}

export function averageEdgeColor(buffer: PixelBuffer): [number, number, number] {
  const { width, height, data } = buffer;
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  const add = (x: number, y: number) => {
    const i = indexAt(width, x, y);
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    n++;
  };
  for (let x = 0; x < width; x += Math.max(1, Math.floor(width / 80))) {
    add(x, 0);
    add(x, height - 1);
  }
  for (let y = 0; y < height; y += Math.max(1, Math.floor(height / 80))) {
    add(0, y);
    add(width - 1, y);
  }
  return n ? [r / n, g / n, b / n] : [255, 255, 255];
}

function featherAlpha(buffer: PixelBuffer, radius: number): void {
  if (radius <= 0) return;
  const { width, height, data } = buffer;
  const copy = new Uint8ClampedArray(data);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = indexAt(width, x, y);
      if (copy[i + 3] === 0) continue;
      let min = 255;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
            min = 0;
            continue;
          }
          min = Math.min(min, copy[indexAt(width, nx, ny) + 3]);
        }
      }
      if (min === 0) data[i + 3] = Math.min(data[i + 3], 140);
    }
  }
}

export function bufferFromImageData(imageData: ImageData): PixelBuffer {
  return {
    width: imageData.width,
    height: imageData.height,
    data: imageData.data,
  };
}

export function imageToBuffer(image: CanvasImageSource, width: number, height: number): PixelBuffer {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2D canvas is not available");
  ctx.drawImage(image, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  return { width, height, data: new Uint8ClampedArray(imageData.data) };
}

export function bufferToCanvas(buffer: PixelBuffer): HTMLCanvasElement {
  const canvas = createCanvas(buffer.width, buffer.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas is not available");
  const imageData = new ImageData(new Uint8ClampedArray(buffer.data), buffer.width, buffer.height);
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

export type PlacedCutout = {
  canvas: HTMLCanvasElement;
  x: number;
  y: number;
};

export function cropOrigin(bounds: Rect | null, padding = 1): Point {
  if (!bounds) return { x: 0, y: 0 };
  return {
    x: Math.max(0, Math.floor(bounds.x - padding)),
    y: Math.max(0, Math.floor(bounds.y - padding)),
  };
}

function placedFromBuffer(buffer: PixelBuffer, bounds: Rect | null, padding = 1): PlacedCutout {
  const origin = cropOrigin(bounds, padding);
  return {
    canvas: bufferToCanvas(bounds ? cropBuffer(buffer, bounds, padding) : buffer),
    x: origin.x,
    y: origin.y,
  };
}

export function extractCutoutPlaced(
  source: CanvasImageSource,
  width: number,
  height: number,
  mask: PixelBuffer,
): PlacedCutout {
  const pixels = applyMaskBuffer(imageToBuffer(source, width, height), mask);
  return placedFromBuffer(pixels, opaqueBounds(pixels));
}

export function extractPolygonCutoutPlaced(
  source: CanvasImageSource,
  width: number,
  height: number,
  points: Point[],
): PlacedCutout {
  const masked = applyPolygonMask(imageToBuffer(source, width, height), points);
  return placedFromBuffer(masked, polygonBounds(points) ?? opaqueBounds(masked));
}

export function extractAutoCutoutPlaced(
  source: CanvasImageSource,
  width: number,
  height: number,
  threshold: number,
): PlacedCutout {
  const removed = removeBackgroundByFlood(imageToBuffer(source, width, height), threshold);
  return placedFromBuffer(removed, opaqueBounds(removed));
}

export function extractCutout(
  source: CanvasImageSource,
  width: number,
  height: number,
  mask: PixelBuffer,
): HTMLCanvasElement {
  return extractCutoutPlaced(source, width, height, mask).canvas;
}

export function extractPolygonCutout(
  source: CanvasImageSource,
  width: number,
  height: number,
  points: Point[],
): HTMLCanvasElement {
  return extractPolygonCutoutPlaced(source, width, height, points).canvas;
}

export function extractAutoCutout(
  source: CanvasImageSource,
  width: number,
  height: number,
  threshold: number,
): HTMLCanvasElement {
  return extractAutoCutoutPlaced(source, width, height, threshold).canvas;
}

export function maskFromBrushCanvas(maskCanvas: HTMLCanvasElement): PixelBuffer {
  const ctx = maskCanvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2D canvas is not available");
  const imageData = ctx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
  return { width: imageData.width, height: imageData.height, data: new Uint8ClampedArray(imageData.data) };
}
