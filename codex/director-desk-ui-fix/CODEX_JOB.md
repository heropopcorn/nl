本机 Codex 任务：修导演台 UI（heropopcorn/nl，工作区 /workspace/yuanli-game-video，已在 main=da0b24e）。

必看截图：/workspace/yuanli-game-video/codex/director-desk-ui-fix/user-screenshot.png
用户原话：有乱码，界面布局还要优化；树木等资产要单独框维护，分类（任务/树木/房屋等），可用抽屉调出，拖到画布上。

## 必须修复
1) **乱码/缺字**：截图里章节旁、套索旁、底栏「已停止」旁出现方框占位（缺字形）。
   - 根因多半是主题字体 `droid_sans_fallback.ttf` 缺部分中文/符号，或按钮用了字体没有的特殊字符/emoji。
   - 修法：换/补可用 CJK 字体（可下载 Noto Sans SC 等开源字体进 `video_game/fonts/`），`_make_theme()` 全 UI 统一用该字体；去掉无法显示的特殊符号，改纯中文文案。
   - Web 导出也必须不乱码。

2) **资产分类抽屉 + 拖放**
   - 右侧不要把所有 sliced 资产糊成一坨无分类。
   - 分类至少：房屋、树木、道具（可再细分「任务/角色相关」若有资产；没有就先房屋/树木/道具）。
   - UI：可收起/展开的抽屉（分类 Tab 或手风琴）；从抽屉 **拖到画布** 放置元素（落点 UV，默认层级合理）；也可点击选中后在画布放置作为兜底。
   - 更新 `SceneContentController.ASSETS` 带 category 字段。

3) **布局优化**（在不大改信息架构前提下）
   - 左：章节/场景；中：画布；右：属性/水域/角色/天气 + 资产抽屉不抢主操作。
   - 底栏工具文案完整可见、无截断乱码。
   - 保持编辑/播放模式。

## 交付
- 改 `video_game/` Godot 代码与字体资源
- 更新 `video_game/docs/director-desk/usage.md` 一两段说明抽屉用法
- 新分支 `codex/director-desk-ui-fix`，commit，push，开 PR 到 main
- 写摘要到 /workspace/yuanli-game-video/codex/director-desk-ui-fix/lastmsg.txt
- 若遇 API 额度/rate limit：在 lastmsg.txt 写明 QUOTA_EXHAUSTED 与错误原文，然后干净退出（不要死循环）

成功标准：截图同类文案无方框乱码；资产可按类从抽屉拖到场景；Web 可导出。
