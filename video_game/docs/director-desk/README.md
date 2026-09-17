# 导演台设计交付

本目录是 `video_game/` 下一阶段「导演台」的实现依据。本轮只有设计和契约，没有完整 Godot 实现。

阅读顺序：

1. [`director-desk-design.md`](director-desk-design.md)：产品边界、中文 HUD、P0/P1、数据模型、风险、验收与 Cursor checklist。
2. [`scene-schema.example.json`](scene-schema.example.json)：可直接用于解析/round-trip 测试的 v2 场景实例。
3. [`cursor-handoff.md`](cursor-handoff.md)：给 Cursor 的最短开工指令。

关键决策：

- 产品是镜头编排导演台，不是 RPG 或完整关卡编辑器。
- P0 支持多场景，新建时可选预设、空白画布或上传背景。
- 水域是互不重叠的 UV 矩形，每个矩形有独立流向、速度和碰撞开关。
- P0 每场景一个角色，可在两个占位角色预设中选择并编辑一条折线路线；数据用数组，为 P1 多角色保留兼容空间。
- 天气 P0 为下雨开关与强度；更多天气放 P1。
- 用户数据位于 `user://director_desk/`；不覆盖 approved 美术，不做云存档。

实现期间如果代码现状与文档冲突，以本目录的数据契约和 P0 验收标准为准；确需改变契约时，应先更新文档与示例 JSON，再修改代码。
