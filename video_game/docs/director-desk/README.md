# 导演台 Layout V3 文档

本目录是 `video_game/`「导演台」的实现依据与用法。

阅读顺序：

1. [`usage.md`](usage.md)：Layout V3 用户操作（Hierarchy、资源库、Inspector、Project、套索水域、多角色播放）。
2. [`scene-schema.example.json`](scene-schema.example.json)：兼容扩展后的 v2 场景实例和 round-trip 测试数据。
3. [`director-desk-design.md`](director-desk-design.md)：P0 历史设计与底层数据约束；与 Layout V3 冲突处以本页和 `usage.md` 为准。
4. [`cursor-handoff.md`](cursor-handoff.md)：实现顺序备忘。

关键决策：

- 产品是镜头编排导演台，不是 RPG 或完整关卡编辑器。
- Layout V3 采用顶部菜单、左侧 Hierarchy/资源库、中间画布/工具、右侧 Inspector、底部 Project 的桌面编辑器布局。
- “一切皆元素”是统一选择与属性模型；底层继续复用兼容的 `background`、`elements`、`actors`、`water_regions`、`background_regions`、`rain_regions` 和 `weather` 数据。
- Project 中章节 → 场景两级均可维护和排序；播放范围明确为当前场景。
- 元素、角色与底图裁片使用整数 `layer`，层级越高越靠前，同层使用脚底 Y 排序。
- 水域可为可缩放矩形或套索多边形，每区有独立流向、速度、材质和碰撞。
- 普通图片元素支持 PS 式抓取移动、四角缩放和外圈旋转；中键平移不会打断当前操作，变换值可撤销并随场景保存。
- 场景支持多个角色；只有选中角色显示路线，各路线独立速度并在播放时并行。
- 环境支持早晨、中午、傍晚、夜晚与强度变化明确的夜间月光；雨幕始终从全屏上方落下，支持随机双段闪电。风具有方向、风力与独立风速，风丝会在固定位置逐步延伸、尾部淡出并轻微摆动，同时实时改变雨线倾斜；降雨区域内部会生成独立落点，每个落点都有一滴从屏幕顶部落下的对应雨滴，并可独立决定是否显示同步水花。
- 用户数据位于 `user://director_desk/`；不覆盖 approved 美术，不做云存档。

场景 `schema_version` 仍为 2，以兼容已有 P0 数据；缺失的 `elements`、`background_regions`、`rain_regions`、`shape`、`layer`、`rotation_degrees` 和 `route.visible` 均按安全默认值迁移。章节存于 `index.json` schema 2。
