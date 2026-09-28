export async function loadImageFromFile(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try { const image = new Image(); image.src = url; await image.decode(); return image; }
  finally { URL.revokeObjectURL(url); }
}
export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('无法编码 PNG')), 'image/png'));
}
export function createCanvas(width: number, height: number) {
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(width)); c.height = Math.max(1, Math.round(height)); return c;
}
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
