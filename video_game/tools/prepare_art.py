#!/usr/bin/env python3
"""Slice the approved farm atlas, build a water mask, and paint a player token.

Re-run from the repo root after replacing files in art/approved/:

    python3 tools/prepare_art.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
APPROVED = ROOT / "art" / "approved"
SLICED = ROOT / "art" / "sliced"
GENERATED = ROOT / "art" / "generated"

GROUND_NAME = "chatgpt-terrain-ground-approved.png"
ASSETS_NAME = "chatgpt-terrain-assets-approved.png"

# Expected atlas order: top-to-bottom rows, left-to-right within a row.
# Follow-up note: later house packs should be slightly lower-tier / fewer two-story
# buildings than this sheet. These names match the current approved atlas.
ATLAS_NAMES = [
    "house_blue_cottage",
    "house_market",
    "house_round_green",
    "house_watermill",
    "tree_oak",
    "tree_cherry",
    "tree_pine",
    "windmill",
    "well",
    "bridge_stone",
    "signboard",
    "lamppost",
    "garden_plot",
    "coop",
    "cart",
    "crates_still_life",
    "flowers_white_a",
    "flowers_white_b",
    "flowers_blue",
    "flowers_pink",
]


def _as_png(path: Path) -> Image.Image:
    image = Image.open(path)
    if image.mode not in ("RGB", "RGBA"):
        image = image.convert("RGB")
    # The agent-side copies sometimes arrive as JPEG bytes with a .png suffix.
    image.save(path, format="PNG")
    return Image.open(path)


def _knockout_border_black(rgb: np.ndarray, black_max: int = 30) -> np.ndarray:
    """Treat near-black pixels connected to the image border as transparent."""
    maxc = rgb.max(axis=2)
    near_black = maxc < black_max
    h, w = near_black.shape
    bg = np.zeros((h, w), dtype=bool)
    stack = []
    for x in range(w):
        stack.append((0, x))
        stack.append((h - 1, x))
    for y in range(h):
        stack.append((y, 0))
        stack.append((y, w - 1))
    while stack:
        y, x = stack.pop()
        if y < 0 or y >= h or x < 0 or x >= w or bg[y, x] or not near_black[y, x]:
            continue
        bg[y, x] = True
        stack.extend(((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)))
    rgba = np.dstack([rgb, np.where(bg, 0, 255).astype(np.uint8)])
    return rgba


def _box_from_mask(mask: np.ndarray, ox: int, oy: int) -> dict | None:
    ys, xs = np.where(mask)
    if xs.size == 0:
        return None
    x0, x1 = int(xs.min()), int(xs.max())
    y0, y1 = int(ys.min()), int(ys.max())
    return {
        "x": ox + x0,
        "y": oy + y0,
        "w": x1 - x0 + 1,
        "h": y1 - y0 + 1,
        "cx": ox + float(xs.mean()),
        "cy": oy + float(ys.mean()),
        "area": int(xs.size),
    }


def _split_on_waist(alpha: np.ndarray, box: dict) -> list[dict]:
    """Split a tall JPEG blob when two sprites are stacked with a dark gap."""
    x, y, w, h = box["x"], box["y"], box["w"], box["h"]
    if h < 300:
        return [box]
    crop = alpha[y : y + h, x : x + w] > 8
    fill = crop.mean(axis=1)
    lo, hi = int(h * 0.22), int(h * 0.78)
    waist = lo + int(np.argmin(fill[lo:hi]))
    if fill[waist] > 0.04:
        return [box]
    parts: list[dict] = []
    for mask, oy in ((crop[:waist], y), (crop[waist:], y + waist)):
        child = _box_from_mask(mask, x, oy)
        if child is not None and child["area"] >= 12000:
            parts.extend(_split_on_waist(alpha, child))
    return parts or [box]


def _reading_order(boxes: list[dict], y_gap: float = 70.0) -> list[dict]:
    ordered = sorted(boxes, key=lambda b: b["cy"])
    rows: list[list[dict]] = []
    for box in ordered:
        if not rows or box["cy"] - rows[-1][-1]["cy"] > y_gap:
            rows.append([box])
        else:
            rows[-1].append(box)
    out: list[dict] = []
    for row in rows:
        row.sort(key=lambda b: b["cx"])
        out.extend(row)
    return out


def _boxes_from_alpha(alpha: np.ndarray, min_area: int = 2500) -> list[dict]:
    binary = (alpha > 8).astype(np.uint8)
    num, _labels, stats, centroids = cv2.connectedComponentsWithStats(binary, connectivity=8)
    boxes: list[dict] = []
    for i in range(1, num):
        x, y, bw, bh, area = stats[i]
        if area < min_area:
            continue
        seed = {
            "x": int(x),
            "y": int(y),
            "w": int(bw),
            "h": int(bh),
            "cx": float(centroids[i][0]),
            "cy": float(centroids[i][1]),
            "area": int(area),
        }
        boxes.extend(_split_on_waist(alpha, seed))
    boxes = [b for b in boxes if b["area"] >= min_area]
    return _reading_order(boxes)


def _pad_box(box: dict, w: int, h: int, pad: int = 4) -> tuple[int, int, int, int]:
    x0 = max(0, box["x"] - pad)
    y0 = max(0, box["y"] - pad)
    x1 = min(w, box["x"] + box["w"] + pad)
    y1 = min(h, box["y"] + box["h"] + pad)
    return x0, y0, x1, y1


def slice_atlas(assets_png: Path) -> list[dict]:
    image = _as_png(assets_png).convert("RGB")
    rgb = np.array(image)
    rgba = _knockout_border_black(rgb)
    Image.fromarray(rgba, "RGBA").save(GENERATED / "assets_sheet_transparent.png")

    boxes = _boxes_from_alpha(rgba[:, :, 3])
    SLICED.mkdir(parents=True, exist_ok=True)
    for old in SLICED.glob("*.png"):
        old.unlink()

    entries: list[dict] = []
    h, w = rgba.shape[:2]
    for i, box in enumerate(boxes):
        name = ATLAS_NAMES[i] if i < len(ATLAS_NAMES) else f"prop_{i:02d}"
        x0, y0, x1, y1 = _pad_box(box, w, h)
        crop = rgba[y0:y1, x0:x1]
        out = SLICED / f"{name}.png"
        Image.fromarray(crop, "RGBA").save(out)
        entries.append(
            {
                "name": name,
                "file": f"art/sliced/{name}.png",
                "bbox": [x0, y0, x1, y1],
                "centroid": [box["cx"], box["cy"]],
                "area": box["area"],
            }
        )

    (SLICED / "manifest.json").write_text(json.dumps(entries, indent=2) + "\n")
    _write_preview(rgba, boxes, entries)
    return entries


def _write_preview(rgba: np.ndarray, boxes: list[dict], entries: list[dict]) -> None:
    preview = Image.fromarray(rgba, "RGBA").convert("RGBA")
    draw = ImageDraw.Draw(preview)
    for box, entry in zip(boxes, entries):
        x0, y0, x1, y1 = _pad_box(box, rgba.shape[1], rgba.shape[0])
        draw.rectangle((x0, y0, x1 - 1, y1 - 1), outline=(255, 220, 120, 220), width=2)
        draw.text((x0 + 4, y0 + 4), entry["name"], fill=(255, 245, 200, 255))
    preview.save(GENERATED / "atlas_slice_preview.png")


def build_water_mask(ground_png: Path) -> None:
    image = _as_png(ground_png).convert("RGB")
    rgb = np.array(image).astype(np.int16)
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    # Stream / pond / waterfall: cyan-blue, brighter in B than R, not green grass.
    water = (b > 88) & (b > r + 8) & (b > g - 12) & (r < 155)
    mask = water.astype(np.uint8) * 255
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((7, 5), np.uint8), iterations=2)
    mask = cv2.dilate(mask, np.ones((3, 3), np.uint8), iterations=1)
    mask = cv2.GaussianBlur(mask, (7, 7), 0)
    # Soften edges and keep a readable overlay, not a solid flood.
    alpha = (mask.astype(np.float32) / 255.0)
    alpha = np.clip(alpha * 0.72, 0.0, 0.78)
    color = np.zeros((*mask.shape, 4), dtype=np.uint8)
    color[:, :, 0] = 92
    color[:, :, 1] = 168
    color[:, :, 2] = 210
    color[:, :, 3] = (alpha * 255).astype(np.uint8)
    Image.fromarray(color, "RGBA").save(GENERATED / "water_mask.png")


def paint_player_token() -> None:
    """Obvious placeholder walker — not part of the locked village atlas."""
    img = Image.new("RGBA", (96, 112), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.ellipse((28, 88, 68, 106), fill=(42, 32, 18, 80))
    draw.polygon([(48, 34), (70, 90), (26, 90)], fill=(186, 96, 48, 255))
    draw.ellipse((34, 24, 62, 52), fill=(236, 198, 154, 255))
    draw.ellipse((30, 14, 66, 34), fill=(210, 158, 72, 255))
    draw.rectangle((26, 24, 70, 29), fill=(168, 122, 48, 255))
    draw.ellipse((40, 34, 46, 40), fill=(72, 48, 32, 255))
    draw.ellipse((50, 34, 56, 40), fill=(72, 48, 32, 255))
    img = img.filter(ImageFilter.SMOOTH)
    img.save(GENERATED / "player_placeholder.png")


def main() -> int:
    GENERATED.mkdir(parents=True, exist_ok=True)
    SLICED.mkdir(parents=True, exist_ok=True)
    ground = APPROVED / GROUND_NAME
    assets = APPROVED / ASSETS_NAME
    if not ground.exists() or not assets.exists():
        print(f"Missing approved art under {APPROVED}", file=sys.stderr)
        return 1
    _as_png(ground)
    entries = slice_atlas(assets)
    build_water_mask(ground)
    paint_player_token()
    print(f"sliced {len(entries)} sprites -> {SLICED}")
    for entry in entries:
        print(f"  {entry['name']:24s} area={entry['area']}")
    if len(entries) != len(ATLAS_NAMES):
        print(
            f"warning: expected {len(ATLAS_NAMES)} slices, got {len(entries)}",
            file=sys.stderr,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
