import type { MediaAsset } from './media';
export function spriteFrame(asset: MediaAsset | undefined, width: number, height: number, frame: number) {
  const columns = asset?.columns ?? 1, rows = asset?.rows ?? 1;
  const index = Math.floor(Math.max(0, frame) / 30 * (asset?.fps ?? 12));
  if (asset?.frameRects?.length) return asset.frameRects[index % asset.frameRects.length];
  const cell = index % (columns * rows);
  return { x: cell % columns * width / columns, y: Math.floor(cell / columns) * height / rows, width: width / columns, height: height / rows };
}
