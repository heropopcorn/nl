# video_game — playable Godot village sandbox

Godot 4.7 walkable village built from the approved hand-painted terrain atlas. This directory is a Godot **project root** (`project.godot` lives here).

Live Web preview of the same build: https://video-game-git-cursor-godot-village-sc-75aec0-heropopcorn1-2663.vercel.app

## How this landed in `nl`

Copied from private repo `heropopcorn/video_game`, branch `cursor/godot-village-scene-9de4` (PR #1), commit `b28d4d38dc87e7613cb1e277e4228a37cdc6811d`. That branch is the full game; `video_game` `main` is README-only.

This agent's GitHub App token can only clone public `heropopcorn/nl`, so the Godot tree was recovered from the official Vercel Web export of that exact commit (PCK unpacked / decompiled with GDRE). `res://` paths are unchanged. Approved terrain PNGs were replaced with the lossless copies already in this repo (`approved-refs/game-art-approved/`). `tools/export_web.sh` and `vercel.json` were reconstructed from that deployment's build logs.

The private `video_game` repo remains historical. **This `nl` tree is the handoff going forward.**

This is **not** `codex/asset-gen/godot/` — that folder is the newer transparent production-asset static preview.

## Open in Godot

Need **Godot 4.7.x** (4.7.2 used for the Web export):

```bash
cd video_game
godot --editor project.godot
# then F5
```

Headless smoke check:

```bash
godot --headless --path video_game --quit-after 2
```

## Controls

- WASD / arrows walk, Shift sprint
- Wheel or +/- zoom
- Right/middle-drag pan, C recenter
- F1 hide the on-screen hint
- F3 collision debug
- The approved asset atlas sits to the right of the map

## Layout

| Path | Role |
|------|------|
| `project.godot` | Godot 4.7 project; main scene `res://scenes/village/village.tscn` |
| `scenes/` | Village + player |
| `scripts/` | Movement, camera, prop placement, water collision |
| `art/approved/` | Locked terrain ground + asset atlas |
| `art/generated/` | Water mask, player placeholder, transparent sheet |
| `art/sliced/` | Individual props + `manifest.json` crop boxes |
| `shaders/` | River flow overlay |
| `tools/prepare_art.py` | Re-slice props from the transparent sheet |
| `tools/export_web.sh` | Headless Web export (Vercel) |
| `vercel.json` | Static Web export on Vercel |

## Web export

```bash
cd video_game
bash tools/export_web.sh
# output: build/web/
```
