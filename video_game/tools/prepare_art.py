#!/usr/bin/env python3
"""Re-slice village props from the transparent atlas using art/sliced/manifest.json.

The playable project already ships sliced PNGs. Run this if you replace
art/generated/assets_sheet_transparent.png and want to refresh the crops:

    python3 tools/prepare_art.py
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "art/sliced/manifest.json"
SHEET = ROOT / "art/generated/assets_sheet_transparent.png"


def main() -> None:
    try:
        from PIL import Image
    except ImportError as exc:
        raise SystemExit("Pillow is required: pip install pillow") from exc

    if not SHEET.exists():
        raise SystemExit(f"missing sheet: {SHEET}")
    if not MANIFEST.exists():
        raise SystemExit(f"missing manifest: {MANIFEST}")

    sheet = Image.open(SHEET).convert("RGBA")
    items = json.loads(MANIFEST.read_text())
    for item in items:
        x0, y0, x1, y1 = item["bbox"]
        crop = sheet.crop((x0, y0, x1, y1))
        out = ROOT / item["file"]
        out.parent.mkdir(parents=True, exist_ok=True)
        crop.save(out)
        print(f"wrote {out.relative_to(ROOT)} {crop.size}")


if __name__ == "__main__":
    main()
