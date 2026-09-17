# 图生视频（fal Veo）调用说明

本仓库已收录云电脑上实际在用的 fal 图生视频脚本，路径：`tools/video-gen/`。

## 管线位置

锁定生产管线：

1. ChatGPT / 出图工具出静图 → 人工确认  
2. **本目录脚本**：静图 → 走路等短视频（通常左 / 前 / 后；右可用左镜像）  
3. 抽帧 / spritesheet（可用 `video_to_frames.py` 或 imageHandle 网页）  
4. Godot / 导演台做场景与水面等

## 文件

| 文件 | 作用 |
|------|------|
| `tools/video-gen/i2v.py` | 单次调用 fal `veo3.1/lite` 图生视频 |
| `tools/video-gen/gen_videos.py` | 按任务清单批量顺序调用 `i2v.py`（余额不足会停） |
| `tools/video-gen/gen_videos_par.py` | 批量并行版（更费额度，慎用） |
| `tools/video-gen/video_to_frames.py` | 从视频抽帧 |
| `tools/video-gen/.env.example` | 密钥模板（不要提交真实 `.env`） |

## 模型与 API

- 模型 ID：`fal-ai/veo3.1/lite/image-to-video`
- 队列：`https://queue.fal.run/fal-ai/veo3.1/lite/image-to-video`
- 鉴权：HTTP Header `Authorization: Key <FAL_KEY>`
- 密钥来源（按优先级）：环境变量 `FAL_KEY` → `tools/video-gen/.env` 里的 `FAL_KEY=` → `~/.config/fal/key`

**禁止把真实 `FAL_KEY` 提交进 Git。** 本地复制：

```bash
cp tools/video-gen/.env.example tools/video-gen/.env
# 编辑 .env，填入 FAL_KEY
```

## 单次调用示例

```bash
cd tools/video-gen
export FAL_KEY=...   # 或写好 .env
python3 i2v.py --image /path/to/still.png --prompt "character walks forward, game sprite style, loopable" --out output/walk.mp4
```

更多参数见 `python3 i2v.py -h`。

## 批量说明

`gen_videos.py` / `gen_videos_par.py` 最初绑定 `2DGame` 仓库里的任务清单与素材目录（`static/GPT台词镜头对照/...`）。在本 mono-repo 中：

- `i2v.py` 路径已改为相对本目录，可直接复用。  
- 批量脚本若仍引用 `2DGame` 的 `TASKS` / 素材路径，需要自备对应素材，或改任务表后再跑。  
- 新项目更推荐：整理静图列表后循环调用 `i2v.py`，不要直接烧旧大批量任务。

## 相关但不在本目录

- 云电脑 `/workspace/skills/scripts/run_wan_media.py`：DashScope Wan 本机路线（非 fal Veo）。  
- 云电脑上**未找到** `fal-ai/wan/.../turbo` 专用脚本。  
- 历史路径：`/workspace/fal-veo/`（与本目录 `i2v.py` 同源；以仓库副本为准做版本管理）。

## 验收

- 文档与脚本在 `heropopcorn/nl` 可查到。  
- 无真实密钥入库。  
- 设置 `FAL_KEY` 后，`i2v.py` 能对一张静图排队并下载 mp4。
