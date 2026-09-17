# Runtime editor MVP — controls

In-engine HUD for the three MVP features in `docs/custom-editor-feasibility.md`. Same UI on desktop F5 and the Web export. Overrides go to **`user://`** only (`scene_layout.json`, `custom_ground.png`, `water_mask.png`). Approved art under `art/approved/` is never overwritten.

Open `video_game/project.godot`, press **F5**. The editor panel is on the **right**. WASD remains the default play mode.

## Modes

| Input | Mode |
| --- | --- |
| `1` or **Play** | Walk with WASD / arrows. Shift sprints. Camera: wheel zoom, right/middle-drag pan, `C` recenter. |
| `2` or **Water** | Draw the water mask on the map. Right-drag still pans. |
| `3` or **Path** | Left-click adds polyline points (stored as UV). |

`Esc` returns to Play (or stops path playback). `F1` hides the left hint. `F3` toggles collision debug.

## Ground

| Input | Action |
| --- | --- |
| `B` or **Load PNG** | Pick a PNG. Longest edge is clamped to 2048. World bounds and camera limits rebuild from the texture size. |
| **Reset ground** | Restore `art/approved/chatgpt-terrain-ground-approved.png` and the generated default water mask. Shows sliced props again. |
| **Hide sliced props** / `H` | Hide `PROP_LAYOUT` buildings (their UV layout is for the approved map). Loading a custom PNG turns this **on**. |

Web uses the browser file picker; desktop uses a file dialog. Nothing is written under `res://`.

## Water

Shader is still `shaders/water_flow.gdshader` (one `flow_dir`). Editing only changes the alpha mask.

| Input | Action |
| --- | --- |
| **Brush** | Left-drag paints. `E` or **Erase** toggles eraser. `[` / `]` or Brush −/+ change size. Release rebuilds collision. |
| **Polygon** | Left-click vertices. Click the first point or `Enter` to fill. |
| **Apply water** / `Enter` | Rebuild `WaterCollision` from the current mask and save `user://water_mask.png`. |
| **Reset water** | Default generated mask on the approved ground; blank mask on a custom-sized ground. |

Painted alpha and collision share the same image, so you can erase gaps (bridges) so the player can cross.

## Path

| Input | Action |
| --- | --- |
| Left-click (Path mode) | Append a UV point. Preview line is yellow. |
| Backspace / **Undo point** | Drop the last path or polygon vertex. |
| `X` / **Clear path** | Empty the polyline. |
| `P` / **Play path** | Walk the polyline at walk speed. Needs 2+ points. **WASD cancels** and returns to free walk. |
| **Stop** / `Esc` | Stop playback. |
| **Loop path** / `L` | Repeat the polyline. |
| **Ignore collision on play** | Default **on** so the farmer is not stuck on water or houses during a take. |

## Persistence

On apply/save the game writes:

- `user://custom_ground.png` when a custom ground is active
- `user://water_mask.png` when the mask was painted or blanked for a custom ground
- `user://scene_layout.json` (see `resources/scene_layout.example.json`)

Delete those files (or **Reset ground**) to return to the shipped village.

## Headless check

```bash
cd video_game
godot --headless --path . --import --quit
godot --headless --path . -- --selftest
```

`--selftest` swaps in a generated PNG, paints a lake, plays a two-point path, resets to approved art, and exits `0` on success.
