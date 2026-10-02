import { spriteFrame } from '../../../packages/core/sprite-frame';

/** This viewer deliberately supports only an explicitly configured, gapless grid. */
export function reviewSequenceError(width: number, height: number, columns: number, rows: number, count: number) {
  if (![width, height].every(value => Number.isSafeInteger(value) && value > 0)) return '请等待图片加载完成后再预览。';
  if (![columns, rows].every(value => Number.isInteger(value) && value >= 1 && value <= 64)) return '行数和列数必须是 1 至 64 的整数。';
  if (columns > width || rows > height) return '每帧至少需要 1 × 1 像素，请减少行数或列数。';
  if (width % columns || height % rows) return '图片尺寸无法按当前行列等分，请检查行列设置；带边距或不规则图集需要裁切信息。';
  if (!Number.isInteger(count) || count < 1 || count > columns * rows) return `有效帧数必须在 1 至 ${columns * rows} 之间。`;
  return '';
}

export function reviewSequenceRect(width: number, height: number, columns: number, rows: number, index: number) {
  // Reuse the scene renderer's geometry without importing or persisting this preview as an asset.
  // One FPS and integral 30-FPS ticks address the frame exactly, without fractional rounding.
  return spriteFrame({ id: 'review-only', name: 'review-only', category: 'characters', src: '', width, height, columns, rows, fps: 1 }, width, height, Math.max(0, Math.floor(index)) * 30);
}

export function reviewPreviewSize(width: number, height: number) {
  const scale = Math.min(1, 1024 / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
