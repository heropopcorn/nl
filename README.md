# nl — 元力游戏视频 / 2D 资产接力仓

公开接力仓库：不同 AI / 开发者应基于本仓继续，不要只从聊天上下文猜状态。

仓库：https://github.com/heropopcorn/nl

## 网页导演台：两种运行模式

- 功能开发／线上预览：`npm ci` 后执行 `npm run dev`；`npm run build` 默认只打包精简测试素材，Vercel 仍发布静态前端。
- 本地实际工作：`npm run work`，自动构建完整资源并启动本地服务，项目与自定义素材默认保存到仓库内 `projects/default/`。
- 其他作品使用 `npm run work -- --workspace projects/作品名称`。项目 JSON 与素材可一起提交 Git；缓存、工作锁、备份和回收区不提交。详见 [作品目录说明](projects/README.md) 和 [运行、迁移与备份说明](docs/runtime-modes.md)。
- 桌面右下角／手机顶部菜单里的“本地文件”支持二进制项目包、恢复草稿、容量检查及可恢复清理。跨设备切换前保存、停止服务并推送，另一台先拉取再启动；Git LFS 尚未启用。
- 视频制作入口：“自定义资源 → 制作序列帧”。本地模式支持保存／重开制作草稿，原视频、选帧顺序、处理帧及图集均随工作目录同步；不接云存储。详见 [视频制作说明](docs/spritesheet-integration.md)。
- 顶部“资源确认”：将待审图片／视频／动图放入 `resource-review/inbox/`，启用后临时发布未标记素材，确认记录存 Supabase，bot 用 `npm run review:sync` 拉取结果。需先配置数据库迁移和 Vercel 环境变量，默认不启用；详见 [资源确认说明](docs/resource-review.md)。

### 手机与桌面布局

- 按浏览器可用宽度自动切换：小于 1024 CSS 像素使用手机布局，1024 及以上使用桌面多栏布局；不依赖设备型号。缩放窗口、横竖屏切换不会重建项目或丢弃绘制草稿。
- 手机通过“画布 / 元素 / 资源 / 属性 / 场景”导航切换工作区；短横屏使用左侧导航。文件、编辑、导入导出、备份等入口集中在顶部“菜单”。
- 画布单指操作当前工具，双指缩放和平移；“平移画布”支持单指拖动视图，“适应画布”复位。套索、路线绘制后点“闭合范围 / 完成线段”，不需要键盘；从属性面板启动绘制会自动回到画布。
- 资源大图、资源确认和序列帧制作在手机上使用全屏弹窗与分区切换；登录、备份、旧场景导入和磁盘管理也适配小屏、安全区和滚动表单。自定义素材和项目的保存位置仍由运行模式决定，不会因为换成手机布局而自动跨设备同步。
- 回归检查：`npm run test:e2e -- tests/browser/mobile.spec.ts`（包含 320px 小屏、常见竖屏、平板宽度、短横屏、触屏手势和断点切换）。
- 安装 Playwright WebKit 及系统依赖后，可用 `TEST_BROWSER=webkit npm run test:e2e -- tests/browser/mobile.spec.ts` 复查 WebKit 布局与业务流程；多指注入用例仅在 Chromium 中运行，仍建议用 iOS / Android 真机做最终体验验收。

### 编辑可靠性与操作反馈

- 修改始终基于最新项目提交；连续应用资源不会覆盖前一次添加，画布拖拽不会覆盖其他属性修改。拖拽目标同时被修改时会提示重新操作。
- 连续输入和拖动同一滑杆合并为一次撤销，无变化的操作不占用历史；撤销、重做按钮随历史状态启用。数值可先清空再输入，不会误存为 0，无效值离开输入框时恢复。
- 顶部显示保存位置与未保存状态，支持手动保存／失败重试。水域重叠或写入失败时保留离开页面提醒；当前数据与所有恢复副本都损坏时禁止用示例项目覆盖。
- 打开项目须确认替换并先建立恢复备份；删除其他场景时保留当前布景。上传、应用、备份与导入结果在对应弹窗内反馈，失败不会伪装为成功。
- 工具按选中元素启用并说明用法；未完成或校验失败的线段、区域保留草稿。重新抽帧会确认是否替换当前制作结果。
- 静态画面不持续刷新，隐藏标签页或手机非画布页面暂停连续预览；回到画布恢复动态天气与序列帧。资源加载去重并支持失败重试。
- 验证入口：`npm test`、`npm run test:e2e`；新增专项位于 `editor-optimizations.spec.ts`、`tool-optimizations.spec.ts`、`storage-optimizations.spec.ts`。本地生产模式另外运行 `node --test tests/local-work.test.mjs tests/workspace-startup.test.mjs`（需先构建本地版本）。

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

## 语音合成（Fish Audio）

脚本与说明：[`tools/audio-gen/`](tools/audio-gen/) · [`docs/fish-audio-tts.md`](docs/fish-audio-tts.md)  
需自备 `FISH_API_KEY`（https://fish.audio/app/api-keys），勿提交密钥。

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
