// Adapted from imageHandle main d87aaa2 (src/lib/spritePack.ts).
import type { SpriteFrame, SpritePackPivot, SpritePackSettings } from "./spriteFrames";
import { clampPackSettings, enabledFrames } from "./spriteFrames";

export const SPRITESHEET_FORMAT = "imagehandle.spritesheet.v1";

export type PackedCell = {
  id: string;
  name: string;
  index: number;
  time: number;
  x: number;
  y: number;
  drawX: number;
  drawY: number;
  width: number;
  height: number;
  scale: number;
};

export type PackLayout = {
  columns: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
  padding: number;
  spacing: number;
  sheetWidth: number;
  sheetHeight: number;
  pivot: SpritePackPivot;
  cells: PackedCell[];
};

export type SpritesheetJson = {
  format: typeof SPRITESHEET_FORMAT;
  image: string;
  cell: { width: number; height: number };
  padding: number;
  spacing: number;
  columns: number;
  rows: number;
  pivot: { x: number; y: number; unity: string; godot: string };
  frameCount: number;
  frames: Array<{
    filename: string;
    index: number;
    time: number;
    frame: { x: number; y: number; w: number; h: number };
    spriteSourceSize: { x: number; y: number; w: number; h: number };
    sourceSize: { w: number; h: number };
  }>;
  unity: {
    textureType: "Sprite";
    spriteMode: "Multiple";
    slice: "GridByCellSize";
    pixelSize: { x: number; y: number };
    pivot: string;
  };
};

export function pivotNormalized(pivot: SpritePackPivot): { x: number; y: number } {
  if (pivot === "center") return { x: 0.5, y: 0.5 };
  if (pivot === "top-left") return { x: 0, y: 1 };
  return { x: 0.5, y: 0 };
}

export function unityPivotName(pivot: SpritePackPivot): string {
  if (pivot === "center") return "Center";
  if (pivot === "top-left") return "Custom";
  return "Bottom";
}

export function godotPivotName(pivot: SpritePackPivot): string {
  if (pivot === "center") return "center";
  if (pivot === "top-left") return "top_left";
  return "bottom_center";
}

function autoColumns(count: number): number {
  if (count <= 0) return 1;
  return Math.max(1, Math.ceil(Math.sqrt(count)));
}

function alignInCell(
  cellX: number,
  cellY: number,
  cellWidth: number,
  cellHeight: number,
  padding: number,
  frameWidth: number,
  frameHeight: number,
  pivot: SpritePackPivot,
): { drawX: number; drawY: number; scale: number } {
  const innerW = Math.max(1, cellWidth - padding * 2);
  const innerH = Math.max(1, cellHeight - padding * 2);
  const scale = Math.min(1, innerW / Math.max(1, frameWidth), innerH / Math.max(1, frameHeight));
  const drawW = frameWidth * scale;
  const drawH = frameHeight * scale;
  let dx = cellX + padding;
  let dy = cellY + padding;
  if (pivot === "center") {
    dx += (innerW - drawW) / 2;
    dy += (innerH - drawH) / 2;
  } else if (pivot === "bottom") {
    dx += (innerW - drawW) / 2;
    dy += innerH - drawH;
  }
  return { drawX: Math.round(dx), drawY: Math.round(dy), scale };
}

export function layoutSpritesheet(
  frames: Array<Pick<SpriteFrame, "id" | "index" | "time" | "enabled" | "width" | "height">>,
  settings: SpritePackSettings,
): PackLayout {
  const pack = clampPackSettings(settings);
  const active = enabledFrames(frames);
  if (!active.length) {
    throw new Error("Enable at least one frame");
  }
  const maxW = Math.max(...active.map((frame) => frame.width));
  const maxH = Math.max(...active.map((frame) => frame.height));
  const cellWidth = pack.cellWidth > 0 ? pack.cellWidth : maxW + pack.padding * 2;
  const cellHeight = pack.cellHeight > 0 ? pack.cellHeight : maxH + pack.padding * 2;
  const columns = pack.columns > 0 ? pack.columns : autoColumns(active.length);
  const rows = Math.max(1, Math.ceil(active.length / columns));
  const sheetWidth = columns * cellWidth + Math.max(0, columns - 1) * pack.spacing;
  const sheetHeight = rows * cellHeight + Math.max(0, rows - 1) * pack.spacing;
  if (!Number.isFinite(sheetWidth + sheetHeight) || columns > 64 || rows > 64 || sheetWidth > 8192 || sheetHeight > 8192 || sheetWidth * sheetHeight > 16777216) throw new Error('图集过大：请减小帧尺寸或帧数（单边最多 8192，总像素最多 1600 万）');
  const cells: PackedCell[] = active.map((frame, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = col * (cellWidth + pack.spacing);
    const y = row * (cellHeight + pack.spacing);
    const aligned = alignInCell(x, y, cellWidth, cellHeight, pack.padding, frame.width, frame.height, pack.pivot);
    return {
      id: frame.id,
      name: `frame_${String(index).padStart(3, "0")}`,
      index,
      time: frame.time,
      x,
      y,
      width: frame.width,
      height: frame.height,
      ...aligned,
    };
  });
  return {
    columns,
    rows,
    cellWidth,
    cellHeight,
    padding: pack.padding,
    spacing: pack.spacing,
    sheetWidth,
    sheetHeight,
    pivot: pack.pivot,
    cells,
  };
}

export function spritesheetJson(layout: PackLayout, imageName = "spritesheet.png"): SpritesheetJson {
  const pivot = pivotNormalized(layout.pivot);
  return {
    format: SPRITESHEET_FORMAT,
    image: imageName,
    cell: { width: layout.cellWidth, height: layout.cellHeight },
    padding: layout.padding,
    spacing: layout.spacing,
    columns: layout.columns,
    rows: layout.rows,
    pivot: {
      x: pivot.x,
      y: pivot.y,
      unity: unityPivotName(layout.pivot),
      godot: godotPivotName(layout.pivot),
    },
    frameCount: layout.cells.length,
    frames: layout.cells.map((cell) => ({
      filename: cell.name,
      index: cell.index,
      time: cell.time,
      frame: { x: cell.x, y: cell.y, w: layout.cellWidth, h: layout.cellHeight },
      spriteSourceSize: {
        x: cell.drawX - cell.x,
        y: cell.drawY - cell.y,
        w: Math.round(cell.width * cell.scale),
        h: Math.round(cell.height * cell.scale),
      },
      sourceSize: { w: cell.width, h: cell.height },
    })),
    unity: {
      textureType: "Sprite",
      spriteMode: "Multiple",
      slice: "GridByCellSize",
      pixelSize: { x: layout.cellWidth, y: layout.cellHeight },
      pivot: unityPivotName(layout.pivot),
    },
  };
}

export function drawSpritesheet(
  framesById: Map<string, CanvasImageSource>,
  layout: PackLayout,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(layout.sheetWidth));
  canvas.height = Math.max(1, Math.round(layout.sheetHeight));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas is not available");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  for (const cell of layout.cells) {
    const image = framesById.get(cell.id);
    if (!image) continue;
    const drawW = Math.max(1, Math.round(cell.width * cell.scale));
    const drawH = Math.max(1, Math.round(cell.height * cell.scale));
    ctx.drawImage(image, cell.drawX, cell.drawY, drawW, drawH);
  }
  return canvas;
}
