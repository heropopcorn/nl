# 元力静态游戏资产 V1

本目录包含真实透明背景 PNG、裁切说明，以及一个可直接运行的 Godot 4.x 村庄预览项目。图片由内置 imagegen 基于已批准地形/资产表和角色 V1 设定板生成。

## 文件清单

- `characters/characters-leads-teachers-sheet.png`：男主、女主普通版、女主精致版、男老师 2、女老师 2、同学代表 1；4×2 等分网格。
- `characters/characters-classmates-sheet.png`：6 位不同体型与性格的同学代表；3×2 等分网格。
- `props/nature-sheet.png`：树木、花树、竹子、灌木、花丛、石块；4×3 等分网格。
- `props/village-props-sheet.png`：井、灯、箱子、木桶、告示牌、推车、水缸、栅栏门；4×3 等分网格。
- `props/modest-houses-sheet.png`：两座普通单层低档村屋；2×1 等分网格。
- `manifest.json`：图片尺寸、相机类型、网格和大致裁切框。
- `PROMPTS.md`：本轮内置 imagegen 的最终生产提示词集合与参考图映射。
- `godot/`：Godot 4.x 最小预览项目；项目内 `assets/` 是上述资源与批准地形底图的运行时副本。

所有 sheet 都保留较宽透明间距，以便按 `manifest.json` 的网格切分。角色当前是静态全身正面/3/4 侧形象，不是俯视四方向动画；后续通过角色稳定性测试后再扩方向和动作。

## 透明度验证

五张新图均为 PNG，IHDR color type 为 6（RGBA）。逐像素检查确认每张图都含 alpha=0 的完全透明像素；不是棋盘格或黑底烘焙图。边缘含部分透明像素用于抗锯齿。

## 打开与运行

需要 Godot 4.x：

```bash
cd /workspace/yuanli-game-video/codex/asset-gen/godot
godot --editor project.godot
```

编辑器中按 F5 即可。也可从命令行验证：

```bash
godot --headless --path /workspace/yuanli-game-video/codex/asset-gen/godot --editor --quit
godot --headless --path /workspace/yuanli-game-video/codex/asset-gen/godot --quit-after 2
```

预览用批准地形图作缩放底图，并通过 `AtlasTexture` 从透明 sheet 中裁出房屋、树木、井、路灯、角色和同学摆放；不会修改原始资产。

## 生成提示词摘要

- 角色：V1 设定外貌与服饰锁定；7–8 岁儿童或成年人；完整全身、正面/轻 3/4、透明底、网格留白。
- 环境：批准资产表约束固定 `top-down isometric / orthographic oblique` 相机、材质、比例、柔和日光和低饱和村庄配色。
- 村屋：普通单层、奶油灰泥墙、朴素木构、蓝灰/旧陶瓦屋顶，刻意低于原批准表两层房的档次。
- 共通负向：无写实、无 3D 渲染、无像素风、无强中式宫殿符号、无文字/水印、无完整背景场景。

生成方式：OpenAI 内置 imagegen（不是 CLI fallback）。
