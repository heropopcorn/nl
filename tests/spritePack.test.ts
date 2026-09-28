import { describe, expect, it } from "vitest";
import { layoutSpritesheet, SPRITESHEET_FORMAT, spritesheetJson } from "../packages/spritesheet/spritePack";
import type { SpriteFrame } from "../packages/spritesheet/spriteFrames";

function frame(id: string, width: number, height: number, enabled = true): SpriteFrame {
  return {
    id,
    index: 0,
    time: 0,
    enabled,
    blob: new Blob(),
    width,
    height,
    cutout: false,
    previewUrl: "",
  };
}

describe("layoutSpritesheet", () => {
  it("packs enabled frames into a Unity grid of equal cells", () => {
    const layout = layoutSpritesheet(
      [frame("a", 32, 32), frame("b", 32, 32), frame("c", 32, 32), frame("skip", 8, 8, false)],
      { columns: 0, padding: 2, spacing: 0, cellWidth: 0, cellHeight: 0, pivot: "bottom" },
    );
    expect(layout.columns).toBe(2);
    expect(layout.rows).toBe(2);
    expect(layout.cellWidth).toBe(36);
    expect(layout.cellHeight).toBe(36);
    expect(layout.sheetWidth).toBe(72);
    expect(layout.sheetHeight).toBe(72);
    expect(layout.cells.map((cell) => [cell.x, cell.y])).toEqual([
      [0, 0],
      [36, 0],
      [0, 36],
    ]);
  });

  it("aligns a smaller frame to the bottom-center of the cell", () => {
    const layout = layoutSpritesheet([frame("a", 16, 16)], {
      columns: 1,
      padding: 2,
      spacing: 0,
      cellWidth: 36,
      cellHeight: 36,
      pivot: "bottom",
    });
    expect(layout.cells[0]).toMatchObject({ drawX: 10, drawY: 18 });
  });

  it("uses spacing between cells", () => {
    const layout = layoutSpritesheet([frame("a", 10, 10), frame("b", 10, 10)], {
      columns: 2,
      padding: 0,
      spacing: 4,
      cellWidth: 10,
      cellHeight: 10,
      pivot: "top-left",
    });
    expect(layout.cells[1]?.x).toBe(14);
    expect(layout.sheetWidth).toBe(24);
  });

  it("throws when nothing is enabled", () => {
    expect(() =>
      layoutSpritesheet([frame("a", 8, 8, false)], {
        columns: 1,
        padding: 0,
        spacing: 0,
        cellWidth: 0,
        cellHeight: 0,
        pivot: "center",
      }),
    ).toThrow(/Enable at least one frame/);
  });
});

describe("spritesheetJson", () => {
  it("describes a Unity Multiple grid slice and Godot-usable frame rects", () => {
    const layout = layoutSpritesheet([frame("a", 32, 48), frame("b", 32, 48)], {
      columns: 2,
      padding: 0,
      spacing: 0,
      cellWidth: 0,
      cellHeight: 0,
      pivot: "bottom",
    });
    const json = spritesheetJson(layout, "spritesheet.png");
    expect(json.format).toBe(SPRITESHEET_FORMAT);
    expect(json.unity).toEqual({
      textureType: "Sprite",
      spriteMode: "Multiple",
      slice: "GridByCellSize",
      pixelSize: { x: 32, y: 48 },
      pivot: "Bottom",
    });
    expect(json.pivot).toMatchObject({ x: 0.5, y: 0, unity: "Bottom", godot: "bottom_center" });
    expect(json.frames).toHaveLength(2);
    expect(json.frames[1]?.frame).toEqual({ x: 32, y: 0, w: 32, h: 48 });
  });
});
