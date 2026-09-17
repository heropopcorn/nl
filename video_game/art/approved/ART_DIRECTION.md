# Art lock

Warm hand-painted fantasy farm / village. Soft daylight, cozy rural, readable as a game map.

- Not pixel art.
- Not photoreal / 3D-render product shots.
- Light eastern flavor is fine; not a strong Chinese-palace look.
- Ground maps are **strict orthographic** (no perspective, no isometric camera).
- Building / prop sheets in this milestone are **isometric cutouts** (Stardew-like mix: top-down ground + isometric props).

## Approved files

| File | Role |
| --- | --- |
| `chatgpt-terrain-ground-approved.png` | Orthographic terrain / ground map used as the first scene background. |
| `chatgpt-terrain-assets-approved.png` | Isometric farm atlas (houses, trees, props on black). |

If you have a newer approved export, replace these files in place and run `python3 tools/prepare_art.py`.

## Known follow-up

Later house packs should be **slightly lower-tier** than the current atlas: fewer two-story buildings, simpler roofs. The current sheet is locked for this first sandbox only.

## Mixing cameras

The ground map is orthographic; the atlas is isometric. That mix is intentional for the first playable scene. A later experiment can rebuild props as true top-down or rebuild the ground as isometric — do not silently drift the ground map into perspective.
