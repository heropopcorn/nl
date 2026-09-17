# Cursor 开工指令

请先完整阅读同目录的 `director-desk-design.md` 和 `scene-schema.example.json`，再阅读现有：

- `video_game/scripts/runtime_editor.gd`
- `video_game/scripts/scene_layout.gd`
- `video_game/scripts/village.gd`
- `video_game/scripts/player.gd`
- `video_game/shaders/water_flow.gdshader`
- `video_game/docs/custom-editor-mvp.md`

按设计文档第 11 节顺序实现 P0。先做 v2 model/validator/repository 与测试，再接 HUD；不要先堆 UI。保留现有默认村庄和 WASD 预览，不写 `res://art/approved/`，不实现 P1 假按钮，不引入后端。

首个提交应只包含：

1. v2 场景模型的解析、校验、序列化和未知字段 round-trip；
2. `user://director_desk/` repository、索引重建、原子保存/备份；
3. v1 → v2 迁移；
4. 对应 headless 测试。

每个后续提交都运行：

```bash
cd video_game
godot --headless --path . --import --quit
godot --headless --path . -- --selftest
```

遇到未定义细节时，优先采用：用户数据不丢、UV 契约不变、P0 UI 不暴露 P1、桌面与 Web 行为一致。若仍会改变 schema 或产品边界，再向用户确认，不要自行扩成完整关卡编辑器。
