import { describe, expect, it } from 'vitest';
import { reviewPreviewSize, reviewSequenceError, reviewSequenceRect } from '../apps/director-web/src/review-sequence';

describe('manual review sequence preview', () => {
  it('validates natural dimensions, whole-pixel grid cells and effective frame count', () => {
    expect(reviewSequenceError(400, 240, 4, 3, 10)).toBe('');
    for (const [width, height, columns, rows, count] of [[0, 240, 4, 3, 10], [Infinity, 240, 4, 3, 10], [400, 240, 0, 3, 10], [400, 240, 4.5, 3, 10], [400, 240, 65, 3, 10], [2, 240, 4, 3, 10], [401, 240, 4, 3, 10], [400, 241, 4, 3, 10], [400, 240, 4, 3, 13], [400, 240, 4, 3, 0], [400, 240, 4, 3, 2.5]]) {
      expect(reviewSequenceError(width, height, columns, rows, count)).not.toBe('');
    }
  });
  it('crops exact row-major frames with the renderer geometry, including the final row', () => {
    expect(reviewSequenceRect(400, 240, 4, 3, 0)).toEqual({ x: 0, y: 0, width: 100, height: 80 });
    expect(reviewSequenceRect(400, 240, 4, 3, 5)).toEqual({ x: 100, y: 80, width: 100, height: 80 });
    expect(reviewSequenceRect(400, 240, 4, 3, 11)).toEqual({ x: 300, y: 160, width: 100, height: 80 });
    for (let frame = 0; frame < 4096; frame++) {
      expect(reviewSequenceRect(640, 640, 64, 64, frame)).toEqual({ x: frame % 64 * 10, y: Math.floor(frame / 64) * 10, width: 10, height: 10 });
    }
  });
  it('bounds the preview canvas without allocating the original atlas on every frame', () => {
    expect(reviewPreviewSize(100, 80)).toEqual({ width: 100, height: 80 });
    expect(reviewPreviewSize(8192, 4096)).toEqual({ width: 1024, height: 512 });
    expect(reviewPreviewSize(1, 8192)).toEqual({ width: 1, height: 1024 });
  });
});
