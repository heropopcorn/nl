你是本机 Codex，在 /workspace/yuanli-game-video（heropopcorn/nl 检出，已最新 main）里直接改代码，实现导演台 V2。

必读：/workspace/yuanli-game-video/codex/director-desk-v2-req/REQUIREMENTS.md

工程：video_game/（Godot 4，Web 导出根目录，线上 https://nl-ivory.vercel.app）

用户要（必须落地）：
1. 编辑模式 / 播放模式
2. 可新建章节；章节下新建场景
3. 场景放背景图 + 元素（房屋树木等）；每元素整数显示层级（越高越前）；同层级用现有 Y 排序（脚底锚点）
4. 底图可圈选区域并设定层级
5. 流水更逼真（不要只像雾）；水域可调大小控制点 + 套索/多边形圈选（类似 PS 套索）
6. 多角色；点角色才显/编其路线；路线可显隐；每条路线可设速度；播放时各走各的
7. 全中文、逻辑清晰的 UI

完成标准：
- 改好 Godot；更新 video_game/docs/director-desk/ 中文说明
- 尽量补 --selftest
- 在本仓库提交 git commit（不要 force push）；若可 push origin 则 push，否则 commit 后写清分支与提交哈希到 codex/director-desk-v2-req/lastmsg.txt
- 把摘要写入 codex/director-desk-v2-req/lastmsg.txt

非目标：云存盘、TTS、视频管线接入。

自己读现有 director desk 代码，可推翻错误假设。保持 Web 导出可部署。不要停下来问人。
