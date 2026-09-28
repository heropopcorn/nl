import { describe, expect, it } from "vitest";
import {
  clampExtractSettings,
  clampPackSettings,
  DEFAULT_EXTRACT_SETTINGS,
  enabledFrames,
  fitMaxDimension,
  moveItem,
  sampleTimestamps,
  spriteDownloadStem,
} from "../packages/spritesheet/spriteFrames";

describe("sampleTimestamps", () => {
  it("samples at fps until duration, honoring max frames", () => {
    expect(sampleTimestamps(1, { mode: "fps", fps: 10, interval: 1, maxFrames: 48 })).toEqual([
      0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9,
    ]);
  });

  it("caps at maxFrames", () => {
    expect(sampleTimestamps(10, { mode: "fps", fps: 12, interval: 1, maxFrames: 4 })).toHaveLength(4);
  });

  it("samples by interval", () => {
    expect(sampleTimestamps(1, { mode: "interval", fps: 12, interval: 0.25, maxFrames: 48 })).toEqual([
      0, 0.25, 0.5, 0.75,
    ]);
  });

  it("returns a single zero timestamp for empty video", () => {
    expect(sampleTimestamps(0, { mode: "fps", fps: 12, interval: 0.1, maxFrames: 8 })).toEqual([0]);
  });
});

describe("fitMaxDimension", () => {
  it("downscales the long edge", () => {
    expect(fitMaxDimension(1920, 1080, 512)).toEqual({ width: 512, height: 288 });
  });

  it("keeps original size when already small or max is 0", () => {
    expect(fitMaxDimension(64, 48, 512)).toEqual({ width: 64, height: 48 });
    expect(fitMaxDimension(1920, 1080, 0)).toEqual({ width: 1920, height: 1080 });
  });
});

describe("frame helpers", () => {
  it("filters enabled frames and reorders", () => {
    const frames = [
      { id: "a", enabled: true },
      { id: "b", enabled: false },
      { id: "c", enabled: true },
    ];
    expect(enabledFrames(frames).map((frame) => frame.id)).toEqual(["a", "c"]);
    expect(moveItem(frames, 2, 0).map((frame) => frame.id)).toEqual(["c", "a", "b"]);
  });

  it("clamps extract/pack settings", () => {
    expect(clampExtractSettings({ ...DEFAULT_EXTRACT_SETTINGS, maxFrames: 999, fps: 0 })).toMatchObject({
      maxFrames: 120,
      fps: 0.25,
    });
    expect(clampPackSettings({ columns: -1, padding: 2, spacing: 0, cellWidth: 0, cellHeight: 0, pivot: "bottom" }).columns).toBe(0);
  });

  it("sanitizes download names", () => {
    expect(spriteDownloadStem("  walk cycle  ")).toBe("walk_cycle");
    expect(spriteDownloadStem("角色 跑")).toBe("角色_跑");
    expect(spriteDownloadStem("")).toBe("spritesheet");
  });
});
