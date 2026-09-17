# 小红书参考视频 → 图文 slides

来源视频：`/workspace/xhs-downloader/downloads/*.mp4`  
处理工具：`/workspace/skills`（Whisper small + `scripts/bilibili.py run --no-download --slides --no-correct --min-interval 8`）  
映射：`xhs_video_mapping.txt`  
字幕副本：`srt/`  
图文输出：`slides/<stem>/slides.md` + `frame_*.jpg`

> 未配置 `/workspace/skills/.env`（无 DashScope/API-KEY），故跳过字幕纠正（`--no-correct`）。部分短视频几乎无对白，SRT 很短，slides 仍按场景/均匀抽帧生成。

## Index

| # | 原视频（标题要点） | ASCII 名 | slides.md | 观感（侧视 / 2.5D） | 帧数 |
|---|-------------------|----------|-----------|---------------------|------|
| 1 | Alpha_AI · **如何0成本用AI制作整套2D游戏** | `xhs01_ai_2d_game` | [slides/xhs01_ai_2d_game/slides.md](slides/xhs01_ai_2d_game/slides.md) | **2D 横版侧视**（素材/角色立绘与横版卷轴） | 29 |
| 2 | Dr_c · Godot0基础 · **tilemap 瓦片地图第二期** | `xhs02_godot_tilemap` | [slides/xhs02_godot_tilemap/slides.md](slides/xhs02_godot_tilemap/slides.md) | **2.5D / 斜俯视瓦片**（山体/地形 auto-tile） | 5 |
| 3 | 游研社 · **乡村小镇《Milki Delivery》** | `xhs03_milki_delivery` | [slides/xhs03_milki_delivery/slides.md](slides/xhs03_milki_delivery/slides.md) | **2D 侧视**（骑车送奶、横版场景） | 4 |
| 4 | 明鬼studio · **Codex+Godot 第7期**（GPT-6 Astra） | `xhs04_codex_godot_ep7` | [slides/xhs04_codex_godot_ep7/slides.md](slides/xhs04_codex_godot_ep7/slides.md) | **2D 侧视像素**（横版场景演示；几乎无对白） | 5 |
| 5 | **unity_godot 开发者**（短片） | `xhs05_unity_godot_dev` | [slides/xhs05_unity_godot_dev/slides.md](slides/xhs05_unity_godot_dev/slides.md) | **2D 俯视 / 世界地图感**（非横版侧视；几乎无对白） | 2 |

## Paths (skills 与本仓库)

- Skills 输出根：`/workspace/skills/output/slides/`
- 本仓库副本：`/workspace/yuanli-game-video/xhs-refs/slides/`（已整目录复制）
- Skills 侧本地视频软链：`/workspace/skills/xhs0{1..5}_*.mp4` → downloader

## Regenerating

```bash
cd /workspace/skills
PY=service/.venv/bin/python
$PY scripts/bilibili.py run --no-download all --slides --no-correct --min-interval 8
# then refresh this copy:
cp -a output/slides/. /workspace/yuanli-game-video/xhs-refs/slides/
cp -a output/xhs*.srt /workspace/yuanli-game-video/xhs-refs/srt/
```
