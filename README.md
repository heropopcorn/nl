# nl — 元力游戏视频 / 2D 资产接力仓

公开接力仓库：不同 AI / 开发者应基于本仓继续，不要只从聊天上下文猜状态。

仓库：https://github.com/heropopcorn/nl

## 这是什么

教学成长向「元力」幻想乡村 2D 游戏视频管线的工作区快照：锁定美术与设定、角色设定板、透明底可切分资产、Godot 4 最小预览场景、小红书参考图文，以及进度评估笔记。

相关线上 Godot 实验仓（村子场景 / Web 导出）：https://github.com/heropopcorn/video_game  
本仓是**资产与设定总库**；`video_game` 是较早的 Godot 实验。后续建议以本仓 `codex/asset-gen/godot` 为资产预览基准，再决定是否合并进 `video_game`。

## 目录地图

| 路径 | 内容 |
|------|------|
| `approved-refs/game-art-approved/` | 已锁定地形图、资产表、美术圣经、世界观摘要、ChatGPT 剧本讨论存档 |
| `codex/character-v1/` | 角色 V1 设定板（男主/女主/老师/同学） |
| `codex/character-v1-heroine-refined/` | 女主服饰精致版 |
| `codex/asset-gen/` | **当前生产资产**：透明 PNG sheet + `manifest.json` + Godot 4 预览 |
| `codex/perspective-eval/` | 双视角评估结论（主俯视斜俯 + 辅侧视） |
| `codex/progress-eval*.md` | 分享对话进度评估 |
| `xhs-refs/` | 小红书参考：视频、抽帧 slides、PDF、字幕 |
| `share/` | ChatGPT 分享页相关材料 |
| `notes/` | 问题与备注 |

## 当前资产入口（优先看这里）

- 说明：`codex/asset-gen/README.md`
- 裁切网格：`codex/asset-gen/manifest.json`
- 角色 sheet：`codex/asset-gen/characters/`
- 环境/道具/村屋：`codex/asset-gen/props/`
- Godot 预览：`codex/asset-gen/godot/`（Godot 4.x，打开后 F5）

角色目前是**正面静态全身**透明底；树木/道具是**斜俯视**透明 sheet，可按 manifest 切分。尚未做四方向走路动画。

## 锁定管线（不要擅自改顺序）

1. ChatGPT / 出图工具出静图 → 人工确认  
2. 视频模型生成走路（左/前/后；右=左镜像）  
3. 抽帧 / spritesheet  
4. Godot 做水面等动态与场景搭建  

美术：温暖手绘幻想乡村、轻东方、非强中式宫殿；地图 strict top-down orthographic；独立资产固定 top-down isometric / orthographic oblique。细节以 `approved-refs/game-art-approved/` 内文档为准。

## 给接力 AI 的约定

1. 先读本 README，再读 `codex/asset-gen/README.md` 与 `approved-refs/game-art-approved/art-style-locked-summary.md`。  
2. 新资产保持**真透明 PNG**（不要棋盘格/黑底烘焙）。  
3. 大改玩法或视角前，先看 `codex/perspective-eval/two-perspectives.md`。  
4. 提交时写清「改了什么资产 / 是否可切分 / Godot 是否仍可跑」。  
5. 不要提交密钥、`.env`、Godot `.godot/` 缓存。

## 本地打开 Godot 预览

```bash
cd codex/asset-gen/godot
godot --editor project.godot
# 然后 F5
```

## 来源说明

内容由 Grok Bot（niulai）协调工作区 `/workspace/yuanli-game-video` 同步推送；含 Codex 生成的资产与既有批准参考。
