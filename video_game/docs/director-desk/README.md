# 导演台 V2 文档

本目录是 `video_game/`「导演台」的实现依据与用法。

阅读顺序：

1. [`usage.md`](usage.md)：V2 用户操作（章节、元素/层级、套索水域、多角色播放）。
2. [`scene-schema.example.json`](scene-schema.example.json)：兼容扩展后的 v2 场景实例和 round-trip 测试数据。
3. [`director-desk-design.md`](director-desk-design.md)：P0 历史设计与底层数据约束；与 V2 冲突处以本页和 `usage.md` 为准。
4. [`cursor-handoff.md`](cursor-handoff.md)：实现顺序备忘。

关键决策：

- 产品是镜头编排导演台，不是 RPG 或完整关卡编辑器。
- V2 左栏是章节 → 场景层级，两级均可维护和排序；播放范围明确为当前场景。
- 元素、角色与底图裁片使用整数 `layer`，层级越高越靠前，同层使用脚底 Y 排序。
- 水域可为可缩放矩形或套索多边形，每区有独立流向、速度、材质和碰撞。
- 场景支持多个角色；只有选中角色显示路线，各路线独立速度并在播放时并行。
- 天气 P0 为下雨开关与强度；更多天气放 P1。
- 用户数据位于 `user://director_desk/`；不覆盖 approved 美术，不做云存档。

场景 `schema_version` 仍为 2，以兼容已有 P0 数据；缺失的 `elements`、`background_regions`、`shape`、`layer` 和 `route.visible` 均按安全默认值迁移。章节存于 `index.json` schema 2。
