# 元力项目总览

公开接力仓 [heropopcorn/nl](https://github.com/heropopcorn/nl) 的当前状态说明。读完本文即可知道项目在做什么、已经落地什么、还缺什么。细节仍以各子目录文档为准；操作入口见仓库根目录 [README.md](../README.md)。

## 这是什么

这是教学成长向幻想乡村故事「元力」的 **2D 游戏视频管线工作区**，不是一款已经做完的 RPG。

目标是用 Godot 场景当演出系统：先把可走路的村子和镜头编排工具跑起来，再往里面接静图、走路序列帧、水面和天气，用来拍短镜头。库存档同时锁着世界观、美术基准、角色设定板和生产资产。

主线已经拍板：上学、成长、认识世界、离开东南小村去远方高等学府。灾难解谜、古阵重启、废柴觉醒等早期方案作废。

## 仓库里有什么

| 路径 | 现在的角色 |
|------|------------|
| `video_game/` | **可玩工程**。Godot 4.7 村子沙盒 + 导演台 Layout V3，可导出网页。版本 `0.4.0`。 |
| `codex/asset-gen/` | **较新的生产静图**：真透明 PNG sheet、`manifest.json`、独立的 Godot 静态预览。还没接到可玩工程。 |
| `codex/asset-gen/godot/` | 只摆资产的静态预览，没有走路和导演台。不要用它替换 `video_game/`。 |
| `approved-refs/game-art-approved/` | 已锁定地皮、资产表、美术气质、世界观摘要、剧本讨论存档。 |
| `codex/character-v1/`、`codex/character-v1-heroine-refined/` | 角色 V1 制作向设定板（男女主、老师、同学）。 |
| `codex/protagonist-village-design/` | 主角村地面设计包。地面可用；建筑 sheet 仍是不透明抠图源。 |
| `codex/director-desk-design/` | 导演台设计稿，与 `video_game/docs/director-desk/` 同步。 |
| `codex/perspective-eval/` | 双视角结论：主俯视，横版只作受控副镜头。 |
| `tools/video-gen/`、`tools/audio-gen/` | fal Veo 图生视频、抽帧；Fish Audio 文本转语音。密钥只放本地 `.env`。 |
| `xhs-refs/` | 小红书参考：字幕、抽帧 slides。 |
| `share/`、`notes/`、`codex/progress-eval.md` | 分享对话与早期进度评估。其中「水面尚未实现」等判断已被后续代码超过，以本文和 `video_game/` 为准。 |

私有仓 `heropopcorn/video_game` 只作历史备份。可玩代码的真源现在就是本仓的 `video_game/`。

## 已经锁定的规则

**故事气质。** 元力是金木水火土加稀有属性（空间、自然、雷等）。稀有不等于更强。主角表面是亲和第二档，隐藏方向是空间 + 自然，前期不揭。开场在大陆东南小村；五大城为庆峰（中央）、云安（东北，与女主相关）、望雷、千湖，以及图上东南那座城。完整锚点见 `approved-refs/game-art-approved/yuanli-setting-locked-summary.md`。

**美术。** 温暖手绘幻想乡村，非像素、非写实、非 3D。轻东方，不要强中式宫殿。地面严格正交俯视；房屋、树、道具用统一斜俯视。硬基准是 `approved-refs` 里已验收的地皮图和农场资产表。后续房子要比现有两层房更矮、更普通。

**镜头。** 主视角继续用「俯视地面 + 斜俯视资产」。横版侧视可以当副镜头（旅途、离乡），建议成片里大约一到两成，而且要等一个主角先通过四方向生产测试。现在没有横版工程。

**出图顺序不要颠倒。**

1. 静图工具出图，人工确认。
2. 视频模型生成走路（左 / 前 / 后，右用左镜像）。
3. 抽帧做成 spritesheet。
4. Godot 做水面、天气和场景编排。

## 现在能直接用的

### 导演台（`video_game/`）

打开 `video_game/project.godot`（Godot **4.7.x**），F5 进入中文导演台。这是镜头编排工具：章节 → 场景、摆元素、圈水、走路线、播当前场景。没有背包、任务、对话或战斗。

已经接上的能力：

- WASD 走路、Shift 冲刺、滚轮缩放、拖动画布。
- 章节和场景的增删改排序；播放范围只有当前场景。
- 预设 / 空白 / 上传背景；四季时节背景；会话内切换默认 / x2 / x4 清晰度（标签不是自动放大）。
- 分层摆放图片元素：整数层级、同层按脚底 Y 排序、自定义遮挡基准线、缩放、旋转、镜像。
- 矩形或套索水域，每块水有独立流向、流速和碰撞；shader 做流动。
- 多个角色各自路线，播放时并行。
- 早晨 / 中午 / 傍晚 / 夜晚，月光与闪电；分区下雨（可挡在屋前屋后）、风。
- 撤销，以及约 300 ms 自动保存到 `user://director_desk/`（浏览器里是本站 IndexedDB，不是云存档）。
- 无头自测：`godot --headless --path video_game -- --selftest`。
- Web 导出：`video_game/tools/export-web.sh`，本地 `npm start` 后打开 `http://127.0.0.1:8080`。网页有管理员登录；部署必须设置 `AUTH_SECRET`。说明在 `video_game/docs/login.md`。

用法：`video_game/docs/director-desk/usage.md`。

### 静态资产预览（`codex/asset-gen/godot/`）

Godot 4.x，F5。把透明 sheet 切开放到批准地皮上，用来看比例和风格，不能玩。

### 生成工具

- 图生视频与抽帧：`tools/video-gen/`，模型 `fal-ai/veo3.1/lite/image-to-video`，需要 `FAL_KEY`。
- 语音：`tools/audio-gen/tts.py`，需要 `FISH_API_KEY`。

## 资产接到哪一步

| 内容 | 状态 |
|------|------|
| 批准地皮 + `video_game/art/sliced/` 切片道具 | 可玩工程正在用。房子仍偏两层，先留着。 |
| `codex/asset-gen/` 透明角色 / 自然 / 道具 / 低档村屋 sheet | 可按 manifest 切分，**尚未导入可玩村子**。角色是正面或轻 3/4 静态全身，没有四方向走路。 |
| 角色 V1 设定板 | 制作向分格稿已有（约 7–8 岁、男女主识别点、老师、同学分组）。还没证明同一角色换姿势、换年龄、换方向仍然稳定。 |
| 主角村地面 `ground-protagonist-village-v1.png` | 可作为更朴素的东南小村底图。配套建筑 sheet 还不是真透明 PNG。 |
| 走路序列帧、骨骼小动作原型 | 管线写好了，仓库里还没有验收过的走路 spritesheet 或绑骨原型。 |
| 横版副视角资产 | 只完成可行性结论，没有开工。 |

可玩沙盒和静态预览要一起留着。接新 sheet 时改 `video_game/`，不要覆盖或删除 `approved-refs/`。

## 还没做完

1. 把 `codex/asset-gen/` 接到导演台资源库，替换占位农民和偏豪华的旧房子。
2. 为一个定稿主角做出左 / 前 / 后走路帧，并在村子里看脚底和比例。
3. 主角村建筑抠成真透明 PNG 后再进场景。
4. 角色从儿童到少年的继承规则，以及同学之间足够拉开的个体差异。
5. 横版只在上面几步通过之后再单做一条旅途镜头，不另起一套平权管线。

## 本地怎么打开

```bash
# 可玩村子 / 导演台（Godot 4.7.x）
cd video_game
godot --editor project.godot
# F5

# 生产资产静态预览（Godot 4.x）
cd codex/asset-gen/godot
godot --editor project.godot
```

网页预览要先在 `video_game/` 里执行 `bash tools/export-web.sh`，再 `npm start`。不要用 `file://` 或普通静态服务器当登录入口。

## 接力时注意

- 新图用真透明 PNG，不要烘焙棋盘格或黑底。
- 大改玩法或视角前先读 `codex/perspective-eval/two-perspectives.md`。
- 提交说明里写清改了哪套资产、能不能切分、哪一个 Godot 工程仍能跑。
- 不要提交密钥、`.env`、Godot 的 `.godot/` 缓存。
