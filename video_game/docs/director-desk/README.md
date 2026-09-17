# 导演台设计交付

本目录是 `video_game/`「导演台」的实现依据与用法。

阅读顺序：

1. [`usage.md`](usage.md)：P0 用户操作（中文 HUD、多场景、矩形水域、角色路线、下雨）。
2. [`director-desk-design.md`](director-desk-design.md)：产品边界、数据模型、P0/P1、验收。
3. [`scene-schema.example.json`](scene-schema.example.json)：v2 场景实例（解析 / round-trip 测试）。
4. [`cursor-handoff.md`](cursor-handoff.md)：实现顺序备忘。

关键决策：

- 产品是镜头编排导演台，不是 RPG 或完整关卡编辑器。
- P0 支持多场景，新建时可选预设、空白画布或上传背景。
- 水域是互不重叠的 UV 矩形，每个矩形有独立流向、速度和碰撞开关。
- P0 每场景一个角色，可在两个占位角色预设中选择并编辑一条折线路线；数据用数组，为 P1 多角色保留兼容空间。
- 天气 P0 为下雨开关与强度；更多天气放 P1。
- 用户数据位于 `user://director_desk/`；不覆盖 approved 美术，不做云存档。

实现期间如果代码现状与文档冲突，以本目录的数据契约和 P0 验收标准为准；确需改变契约时，应先更新文档与示例 JSON，再修改代码。
