# 自定义背景 / 水域 / 路径 — 可行性评估

评估对象：公开仓 `heropopcorn/nl` 里的可玩 Godot 工程 `video_game/`（Godot 4.7.2）。  
**不**使用私有仓 `heropopcorn/video_game`。不改 `codex/asset-gen/` 与已锁定美术树。

结论先看：[总体结论](#总体结论) → [三项对照](#三项对照) → [分期](#建议分期-mvp--完整)。

---

## 总体结论

三项的 **MVP 都好做**，而且和现有沙盒契合。当前村子不是写死场景图，而是 `village.gd` 在运行时绑地形、水 overlay、碰撞和镜头范围；地面只有 **1152×864**，适合运行时换贴图和画 mask。

| 功能 | 难度 | 工作量（相对） | 建议实现面 | 现在做？ |
| --- | --- | --- | --- | --- |
| 1. 自定义背景图 | **易** | 小：1 个加载入口 + 重算 bounds | Godot 运行时 UI（桌面 F5 与 Web 同一套） | 先做 |
| 2. 自定义流水范围 | **中** | 中：画刷/多边形 + 重建碰撞；分段流向另算 | 同上，画在游戏画布上 | 紧随背景 |
| 3. 自定义行进路线 | **易～中** | 小～中：折线 + 模式切换；完整时间轴另算 | 同上；`Path2D` 即可 | 第三 |

**不要**先做独立 HTML/React「页面编辑器」去套 Godot canvas：坐标、缩放、镜头 pan 都要对齐，而 Web 导出已经是整页 canvas（`export_presets.cfg` + `vercel.json` 静态站）。用户说的「在页面上画」应落成 **Godot 运行时编辑模式**，导出到 Vercel 后就是网页操作。

Godot 编辑器内 `@tool` / 资源写回 `res://` 只作为进阶：「把这次摆好的布局提交进仓库」。Web 与导出包 **写不进** `res://`，只能 `user://`。

**值得现在做 MVP。** 完整「关卡编辑器 + 云端存档 + Flow Map」不值得现在做。  
**先做自定义背景**，因为它最小，且水域 mask / 镜头 / 地图边界都跟着地形尺寸走。

本 PR 只落地评估文档 + 数据契约示例，**不改玩法脚本**，避免半成品编辑器把现有 WASD 沙盒弄坏。

---

## 现有架构（评估依据）

关键文件：

| 路径 | 角色 |
| --- | --- |
| `scripts/village.gd` | 运行时绑地形、水 overlay、切片道具 UV、水体碰撞、地图边界、出生点、镜头 limit |
| `scenes/village/village.tscn` | 主场景：`Terrain` / `WaterOverlay` / `Player` / HUD |
| `scripts/player.gd` | 仅 WASD + Shift；`move_and_slide` |
| `scripts/follow_camera.gd` | 滚轮缩放、右键/中键拖拽平移 |
| `shaders/water_flow.gdshader` | canvas shader：用贴图 **alpha 当 mask**，单一 `flow_dir` UV 扰动 |
| `resources/water_flow_material.tres` | 上述 shader 的默认参数 |
| `tools/prepare_art.py` | 离线切 atlas + **按地皮颜色启发式生成** `art/generated/water_mask.png` |
| `art/approved/chatgpt-terrain-ground-approved.png` | 锁定正交地皮 1152×864 RGB |
| `art/generated/water_mask.png` | 同尺寸 RGBA mask |
| `project.godot` | 主场景即村子；物理层 `world` / `player` |
| `vercel.json` / `tools/export-web.sh` | 无后端的静态 HTML5 导出 |

运行时已经不是「场景里写死一张图就结束」：

- `_bind_terrain()`：若 `terrain.texture` 为空则 `load(GROUND_PATH)`，`centered`，按贴图尺寸后续全部换算。
- `_bind_water()`：把 `water_mask.png` 赋给 `WaterOverlay`，套 `water_flow_material.tres`。
- `_build_water_collision()`：从 mask **alpha** 做 `BitMap.opaque_to_polygons`，生成 `WaterCollision`。
- `_build_map_bounds()` / `_limit_camera()`：完全由 `terrain.texture.get_size()` 推导。
- 道具：`PROP_LAYOUT` 里是 **UV 0–1**，不是绝对像素。

玩家没有寻路、没有 `PathFollow2D`、没有文件选择器、没有 `user://` 覆盖层。Web 是 **单线程** Godot 包，无上传 API。

历史方案（`share/chatgpt-share-6aa8e3a7.md` Turn 32–34）：手工圈水域 → 黑白 mask → shader 只在 mask 里动 → 弯曲河再分成 3–5 段流向。当前实现只做到「启发式整图 mask + **一个** `flow_dir`」，还没做手绘与分段。

---

## 三项对照

### 1. 自定义传入背景图

**难度：易**（桌面/运行时换 PNG）；**中**（若要 Web 持久化、多设备同步）。

**工作量：** 小。主要改 `village.gd` 的加载入口，以及换图后重跑 `_build_map_bounds()` / `_limit_camera()` /（可选）藏道具。不需要新渲染管线。

**推荐路径：Godot 运行时 UI，顺带在 Web 上用。**

- MVP：HUD「选择背景」→ 桌面 `FileDialog`（`access = ACCESS_FILESYSTEM`）读 PNG → `ImageTexture` 赋给 `World/Terrain` → 重算边界与镜头。默认仍是 `art/approved/chatgpt-terrain-ground-approved.png`。覆盖只写 `user://custom_ground.png`，**禁止覆盖** `art/approved/`。
- Web：导出包不能读用户磁盘；用 `JavaScriptBridge` + `<input type="file">`，或 Godot 4 的 Web 文件选择，把字节写成 `user://`。刷新后 IndexedDB 里的 `user://` 通常还在；换设备则没有。
- 不要做：单独上传到 Vercel/Blob 的关卡站（无后端，也超出沙盒范围）。
- 编辑器进阶：`@tool` 把选中的 PNG 复制进 `art/custom/` 并改场景导出，供提交仓库。这是第二期。

**契合度：高。** 地形已经是一张 `Sprite2D`，尺寸驱动世界。`_bind_terrain()` 已有「缺贴图则 load」的形状。

**风险 / 依赖**

- 道具 UV 是按**当前验收地皮**摆的（`PROP_LAYOUT`）。换一张构图不同的图，房子会错位。MVP：换自定义地皮时提供「隐藏切片道具」开关；完整版才做点选摆放。
- 水 mask 与碰撞按旧河生成。只换背景不改水域，河会错。所以水域是背景之后的下一刀，不是可选项。
- 大图显存：现在 1152×864 很轻松；若用户丢 4K/8K，Web 可能卡。MVP 限制边长（例如最长边 ≤ 2048）并提示。
- `prepare_art.py` 的 `build_water_mask()` 是针对这张验收地皮的蓝青像素启发式，**不能**当通用「任意背景自动识别河流」。
- 不要改 `codex/asset-gen/` 的生产 sheet 来当背景。

---

### 2. 自定义流水范围

**难度：中。** Mask + 碰撞这条链已经在；缺的是绘制 UX，以及「弯曲河要多段流向」。

**工作量：** 中。画刷或多边形编辑 + 提交时重建碰撞，可复用 `_build_water_collision()`。单方向 shader 几乎不用改。分段流向 / flow map / 岸边泡沫是完整版。

**推荐路径：在 Godot 画布上画，不要外挂网页画板。**

现有水是：

1. Python 从地皮颜色生成整图 alpha（`tools/prepare_art.py` `build_water_mask`）。
2. `WaterOverlay` 用这张图当 `TEXTURE`；shader 用 `texture(TEXTURE, UV).a` 裁区域，`flow_dir` 全局一条。
3. 同 alpha 生成静态 `CollisionPolygon2D`。

这已经是「mask 驱动 overlay」，不是 TileMap 里写死的水格子。把它改成可编辑，是换 mask 的来源，不是换技术。

- MVP：编辑模式（与镜头右键拖拽互斥）→ 左键画、橡皮擦 → 画在一张与地形同尺寸的 `Image`（可先 ½ 分辨率再 blit 回去）→ `ImageTexture` 赋给 `WaterOverlay` → 松手或按「应用」后重建 `WaterCollision`。保存 `user://water_mask.png`。保留「恢复默认生成 mask」。
- 多边形圈选（更接近分享对话里的「圈河」）：点折线，闭合后填充 alpha。比像素画刷更适合河岸，实现量略大一点，仍属 MVP 可选项。
- 完整版：3–5 段 `Polygon2D` 各带 `flow_dir`（分享对话推荐，先别上 Flow Map）；岸边内缩，避免水纹爬上草地；泡沫 / 瀑布 AnimatedSprite。
- 外挂 Photopea/网页 SVG 再下载 mask：能用，但和「页面上直接划」不符，只当桌面应急。

**契合度：高。** Shader、overlay 节点、碰撞重建都已按 mask 设计。`prepare_art.py` 可继续当「从新地皮猜一个初始 mask」，再人工改。

**风险 / 依赖**

- 镜头：`follow_camera.gd` 占用右键/中键拖拽。必须有明确模式（例如按 `Tab` / HUD：游玩 | 画水 | 折线），否则画画会变成平移。
- 每帧重建多边形会卡。只在「应用」或画完一段后重建。1152×864 的 `opaque_to_polygons` 可接受。
- 单一 `flow_dir = (0.18, 0.92)`：画得出弯曲河，看起来仍像斜向滚纹。这是视觉债，不是 MVP 阻塞；文档里标成完整版。
- 自定义背景尺寸若与 1152×864 不同，必须按新尺寸重建 mask，不能硬套旧 `water_mask.png`。
- Web 上高频 `Image.set_pixel` 可能慢；用笔刷 stamp / 低分 buffer。
- 碰撞与视觉 mask 用同一张 alpha 时，桥上的「缺口」（README 写明木板桥是 mask 空洞）要能擦出来，否则玩家过不了桥。

---

### 3. 自定义角色行进路线与轨迹

**难度：易～中。** 折线巡逻容易；做成可导出的镜头/时间轴（游戏视频管线）是中～难。

**工作量：** MVP 小～中（`Path2D` + 玩家模式）。完整版中偏大（多段速度、等待、多角色、导出录像）。

**推荐路径：Godot 运行时点折线；播放仍在引擎里。** 不要先做独立网页时间轴。

现状：`player.gd` 每帧 `Input.get_vector` → `velocity` → `move_and_slide()`。没有 AI、NavRegion、动画状态机。占位精灵会按左右 `flip_h` 和 bob。

- MVP：编辑模式在世界坐标点折线（至少 2 点）→ 存 `PackedVector2Array`（UV 或世界坐标；**推荐 UV**，换分辨率背景还能用）→ `P` 或 HUD「沿路径走」切换：忽略 WASD，沿折线以 `WALK_SPEED` 插值，到终点停或循环。`C` 仍回中镜头。
- 引擎现成：`Path2D` + `PathFollow2D`，或自己 `lerp` 点列。沙盒级足够。
- 完整版：Catmull-Rom / 圆弧；每段速度；到点等待（说话镜头）；录路径时显示残影；与未来 walk-cycle 四向动画对齐；可选 `NavigationRegion2D` 自动绕房（要先有可靠碰撞轮廓，现在房屋只是脚底圆）。
- WASD 必须保留为默认。路径是演出模式，不是替换沙盒。

**契合度：高。** 玩家已经是独立 `CharacterBody2D`，加一种移动源即可。相机已跟随玩家，路径播放时镜头会跟着走，这对「用游戏场景出视频」直接有用。

**风险 / 依赖**

- 路径 vs 水体/房屋碰撞：`move_and_slide` 会卡住。MVP 二选一并写清：**(A)** 路径模式 `collision_mask = 0`（演出优先），或 **(B)** 沿路径仍受碰撞（沙盒优先，路径必须绕河）。建议 MVP 用 A，并画出路经预览。
- 没有四向走路动画（`art/generated/player_placeholder.png`）。路径只能旋转移动占位符；不要把「自定义路径」做成动画系统。
- 编辑折线与画水、镜头拖拽争输入。同一套模式机。
- Web 点击坐标：`get_global_mouse_position()` 即可，不必自己换算 HTML。这是「做在 Godot 里」而不是外挂 DOM 的原因之一。

---

## 建议分期（MVP → 完整）

### 现在不要做的

- 独立 Web 编辑器（React/Canvas 叠在 wasm 上）。
- 云端关卡、账号、Vercel Blob 上传。
- Flow Map、流体模拟、NavMesh 自动寻路。
- 改 `codex/asset-gen/` 或覆盖 `art/approved/`。
- 把半套编辑器接到 `village.gd` 却没有模式隔离（会破坏现有 WASD）。

### Phase 0 — 数据契约（本 PR）

见 `resources/scene_layout.example.json`。覆盖数据只进 `user://`（或日后 `art/custom/` 经人工复制）。默认场景仍是验收地皮。

### Phase 1 — 换背景（先做）

文件选择 → `ImageTexture` → 重算 bounds/camera → `user://custom_ground.png`。开关隐藏 `PROP_LAYOUT` 道具。默认图一键恢复。

### Phase 2 — 画水域（第二）

与地形同尺寸的可编辑 mask；画刷或多边形；应用后走现有 `_build_water_collision()`；恢复默认 `art/generated/water_mask.png`。仍用单一 `flow_dir`。

### Phase 3 — 折线路径（第三）

点列编辑、预览线、播放/循环、回到 WASD。路径用 UV。播放时建议关闭碰撞。

### Phase 4 — 完整（以后）

分段 `flow_dir`、mask 内缩、泡沫/瀑布；Godot 编辑器写回 `res://`；Web 导出/导入 JSON+PNG zip；道具点选摆放；路径时间轴。仍不必做独立网站编辑器，除非运行时 HUD 被证明不够。

**顺序：背景 → 水域 → 路径。**  
背景决定世界尺寸；水域必须跟这张图；路径是演出层，不挡前两步。若只想验证输入模式机，可以插一个「空编辑模式」热键，但不要把路径做到比换图还早的产品形态。

---

## 运行时覆盖约定

| 键 | 含义 |
| --- | --- |
| `ground` | `user://` 或 `res://` 下 PNG。缺省 = 验收地皮 |
| `water_mask` | 同尺寸 RGBA，alpha = 水域。缺省 = 生成 mask |
| `hide_baked_props` | 换图后是否隐藏 UV 摆放的切片建筑 |
| `path_uv` | 折线，0–1 UV（相对地形左上） |
| `path_loop` | 是否循环 |
| `path_ignore_collision` | 演出模式是否关掉玩家 `collision_mask` |

导出游戏写 `user://scene_layout.json` + 旁路 PNG。不要默认写 `res://art/approved/`。

Web：同一套 HUD；文件进来靠浏览器 file input；没有服务器。

---

## 与 Web / Vercel 的关系

- 玩法页就是 Godot canvas（`html/canvas_resize_policy=2`，无 COOP/COEP）。
- `vercel.json` 只导出静态 `export/web`，没有 API。自定义资源不能「上传到站点」除非另做后端。
- 单线程 wasm 上可以画 mask、跑 shader；避免每帧全图 CPU。
- 私有仓 Vercel 项目 `video-game` 与本 mono-repo 的后续 Web 预览是部署问题，不影响这三项的引擎设计。实现时继续只在 `video_game/` 里改 Godot。
