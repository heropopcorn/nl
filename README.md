# nl — 元力游戏视频 / 2D 资产接力仓

公开接力仓库：不同 AI / 开发者应基于本仓继续，不要只从聊天上下文猜状态。

仓库：https://github.com/heropopcorn/nl

## 这是什么

教学成长向「元力」幻想乡村 2D 游戏视频管线的工作区：锁定美术与设定、角色设定板、透明底可切分资产、**可玩的 Godot 村子沙盒**、Godot 4 静态资产预览、小红书参考图文，以及进度评估笔记。

**本仓是今后的交接 mono-repo**（资产/设定 + 真正可玩的 Godot 工程）。私有仓 https://github.com/heropopcorn/video_game 仅作历史备份；其 `main` 几乎是空 README，完整游戏代码在分支 `cursor/godot-village-scene-9de4`（PR #1）。`video_game/` 现为该分支的 **GitHub zipball 真源码**（commit `b28d4d3`），不是 Vercel Web 导出重建版。

## 两套 Godot 工程（都要保留）

| 路径 | 是什么 | 怎么打开 |
|------|--------|----------|
| **`video_game/`** | **可玩村子 + 导演台 P0**：走路、多场景、矩形水域、角色路线、下雨预览。来自 `heropopcorn/video_game` PR 分支并在本仓继续。 | `cd video_game && godot --editor project.godot`，然后 F5。需要 Godot **4.7.x**。 |
| **`codex/asset-gen/godot/`** | **更新的生产资产静态预览**：透明 PNG sheet 摆在批准地皮上，没有玩法。不要用它替换 `video_game/`。 | `cd codex/asset-gen/godot && godot --editor project.godot`，然后 F5。需要 Godot **4.x**。 |

`video_game/` 的 `project.godot` 在子目录根上，Godot 必须从该目录打开；`res://` 路径相对该根，不指向仓库顶层。

## 目录地图

| 路径 | 内容 |
|------|------|
| `video_game/` | **可玩 Godot 村子**（场景、脚本、切片美术、Web 导出脚本） |
| `approved-refs/game-art-approved/` | 已锁定地形图、资产表、美术圣经、世界观摘要、ChatGPT 剧本讨论存档 |
| `codex/character-v1/` | 角色 V1 设定板（男主/女主/老师/同学） |
| `codex/character-v1-heroine-refined/` | 女主服饰精致版 |
| `codex/asset-gen/` | **当前生产资产**：透明 PNG sheet + `manifest.json` + Godot 4 **静态**预览 |
| `codex/perspective-eval/` | 双视角评估结论（主俯视斜俯 + 辅侧视） |
| `codex/progress-eval*.md` | 分享对话进度评估 |
| `xhs-refs/` | 小红书参考：视频、抽帧 slides、PDF、字幕 |
| `share/` | ChatGPT 分享页相关材料 |
| `notes/` | 问题与备注 |

## 图生视频（fal Veo）

脚本与说明：[`tools/video-gen/`](tools/video-gen/) · [`docs/video-generation-fal-veo.md`](docs/video-generation-fal-veo.md)  
模型：`fal-ai/veo3.1/lite/image-to-video`（需自备 `FAL_KEY`，勿提交密钥）。

## 导演台设计（下一阶段实现依据）

Codex 设计稿：`codex/director-desk-design/`（与 `video_game/docs/director-desk/` 同步）。
Cursor 按该文档把运行时编辑器升级为多场景导演台（框选水域+流向、角色路线、天气等）。

## 当前资产入口（生产 sheet 优先看这里）

- 说明：`codex/asset-gen/README.md`
- 裁切网格：`codex/asset-gen/manifest.json`
- 角色 sheet：`codex/asset-gen/characters/`
- 环境/道具/村屋：`codex/asset-gen/props/`
- Godot 静态预览：`codex/asset-gen/godot/`

角色目前是**正面静态全身**透明底；树木/道具是**斜俯视**透明 sheet，可按 manifest 切分。尚未做四方向走路动画。

可玩沙盒仍使用 `video_game/art/` 里较早的批准地皮 + 切片道具；尚未接到 `codex/asset-gen/` 新 sheet。后续接力可以在不删任何一边的前提下把新资产接到 `video_game/`。

## 锁定管线（不要擅自改顺序）

1. ChatGPT / 出图工具出静图 → 人工确认  
2. 视频模型生成走路（左/前/后；右=左镜像）  
3. 抽帧 / spritesheet  
4. Godot 做水面等动态与场景搭建  

美术：温暖手绘幻想乡村、轻东方、非强中式宫殿；地图 strict top-down orthographic；独立资产固定 top-down isometric / orthographic oblique。细节以 `approved-refs/game-art-approved/` 内文档为准。

## 给接力 AI 的约定

1. 先读本 README，再读 `video_game/README.md`、`codex/asset-gen/README.md` 与 `approved-refs/game-art-approved/art-style-locked-summary.md`。  
2. 新资产保持**真透明 PNG**（不要棋盘格/黑底烘焙）。  
3. 大改玩法或视角前，先看 `codex/perspective-eval/two-perspectives.md`。  
4. 提交时写清「改了什么资产 / 是否可切分 / 哪一个 Godot 工程仍可跑」。  
5. 不要提交密钥、`.env`、Godot `.godot/` 缓存。  
6. 不要用 `codex/asset-gen/godot/` 覆盖 `video_game/`，也不要删已锁定的 `approved-refs/`。

## 本地打开

可玩村子：

```bash
cd video_game
godot --editor project.godot
# 然后 F5
# WASD 走路，Shift 冲刺，滚轮缩放
```

生产资产静态预览：

```bash
cd codex/asset-gen/godot
godot --editor project.godot
# 然后 F5
```

## 来源说明

内容由 Grok Bot（niulai）协调工作区同步推送；含 Codex 生成的资产、既有批准参考，以及从 `heropopcorn/video_game` PR 分支并入的可玩 Godot 工程。
