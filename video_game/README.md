# video_game

Godot **4.7.2** 2D sandbox for art / tech experiments (yuanli game-video). First milestone: a walkable village built from the approved orthographic ground map plus sliced isometric farm props.

## Open in Godot

1. Install [Godot 4.7.2 stable](https://godotengine.org/download/archive/4.7.2-stable/) (standard build, GDScript — not the .NET build).
2. In the Project Manager choose **Import**, then select `project.godot` at the repo root.
3. Press **F5** (or Run). The main scene is `scenes/village/village.tscn`.

GL Compatibility renderer is selected so the project runs on machines without Vulkan.

### Controls

| Input | Action |
| --- | --- |
| WASD / arrow keys | Walk |
| Shift | Sprint |
| Mouse wheel or `+` / `-` | Zoom |
| Right-drag or middle-drag | Pan camera |
| C or Home | Recenter camera on the player |
| F1 | Toggle the on-screen hint |
| F3 | Toggle collision debug |

The stream uses a canvas shader on a generated water mask. Wooden plank bridges on the map are gaps in that mask so you can cross.

## Scene tree

```
Village (Node2D)                  scripts/village.gd
├── World (Node2D, y-sort)
│   ├── Terrain                   approved orthographic ground
│   ├── WaterOverlay              water mask + shaders/water_flow.gdshader
│   ├── Props (empty organizer)
│   ├── Player                    scenes/player/player.tscn
│   │   ├── Sprite2D              placeholder token
│   │   ├── CollisionShape2D
│   │   └── Camera2D             scripts/follow_camera.gd
│   ├── <sliced buildings…>      spawned at runtime from art/sliced/
│   ├── ApprovedAtlasReference   full atlas parked to the right of the map
│   ├── WaterCollision           polygons from the water mask
│   └── MapBounds
└── HUD
    └── ControlsHint
```

There is no RPG layer (inventory, quests, dialogue, combat). This repo is for looking at art in-engine and trying screen effects.

## Art folders

```
art/approved/     Locked style references (ground map + farm atlas)
art/sliced/       Individual isometric cutouts (tools/prepare_art.py)
art/generated/    Water mask, transparent atlas, player placeholder
```

Art direction notes live in `art/approved/ART_DIRECTION.md`.

Re-slice after replacing approved PNGs:

```bash
python3 -m pip install -r tools/requirements.txt
python3 tools/prepare_art.py
```

### House follow-up

The current atlas includes two-story / turret cottages. Later house assets should be slightly **lower-tier** with fewer two-story buildings. Keep using this sheet until that pack exists.

## Custom ground / water / path (planned)

Feasibility for swapping the terrain PNG, painting the water mask in-engine, and editing a walk polyline: [`docs/custom-editor-feasibility.md`](docs/custom-editor-feasibility.md). Example data contract: [`resources/scene_layout.example.json`](resources/scene_layout.example.json). Not wired into gameplay yet (WASD sandbox is unchanged).

## Next art-tech experiments

- 8-direction (or 4-direction) **walk-cycle spritesheet** for a farmer that matches the painted atlas, replacing `art/generated/player_placeholder.png`.
- More village props: fences, chickens in motion, smoke from chimneys, lantern flicker.
- Tile the ground map (or rebuild it as a Godot TileMap) so the village can grow past one texture.
- True orthographic building set vs. keeping the isometric-on-top-down mix.
- Richer water: foam at banks, a flow map, or AnimatedSprite caustics.
- Day/night `CanvasModulate` and window lights.
- Y-sort polish (per-sprite foot offsets, shadow blobs).

## Headless check (desktop)

```bash
godot --headless --path . --import --quit
godot --headless --path . --quit-after 20
```

Pass `-- --screenshot` after the project path to dump `user://village_preview.png` (needs a display to be useful).

Press **F5** in the Godot editor to run the desktop build. That path is unchanged by the Web export.

## Web (HTML5) export

The village is exported as a **single-threaded** Godot 4.7.2 Web build (no `SharedArrayBuffer`, so Vercel does **not** need COOP/COEP headers). Gameplay is the same as desktop: WASD walk, camera, water shader.

### Export locally

```bash
bash tools/export-web.sh
```

The script finds Godot 4.7.2 (`GODOT_BIN`, `godot` on `PATH`, or a download), installs the bundled `web_nothreads` templates from `tools/web-templates/`, and writes a static site to `export/web/` (`index.html`, `.wasm`, `.pck`, …). `export/` is gitignored.

### Preview the export folder

Do not open `index.html` as a `file://` URL (the wasm/pck fetch will fail). From the repo root:

```bash
python3 -m http.server 8080 --directory export/web
```

Then open http://127.0.0.1:8080/ and click the canvas once if WASD does not move the farmer (browser focus).

### Vercel

[`vercel.json`](vercel.json) builds with `tools/export-web.sh` and serves `export/web` as a static site. Wasm is `Content-Type: application/wasm`; `.pck` is `application/octet-stream`. Linked GitHub repo: `heropopcorn/video_game`, Vercel project **`video-game`** (Hobby team `heropopcorn1-2663`). Vercel Authentication is off on this project so the HTML5 build can be opened without a Vercel login.

Playable preview (this branch, until it is merged to `main`):

**https://video-game-git-cursor-godot-village-sc-75aec0-heropopcorn1-2663.vercel.app**

Production aliases after merge: **https://video-game-beta.vercel.app** and `https://video-game-heropopcorn1-2663.vercel.app` (those currently still serve `main`, which is the README-only commit).

GitHub Action [`.github/workflows/web-export.yml`](.github/workflows/web-export.yml) is a second, reproducible export that uploads the `village-web` artifact.
