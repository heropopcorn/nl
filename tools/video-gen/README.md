# tools/video-gen

fal.ai Veo 3.1 lite 图生视频脚本（从云电脑 `/workspace/fal-veo` 与 `2DGame/scripts` 迁入）。

完整说明见：[`docs/video-generation-fal-veo.md`](../../docs/video-generation-fal-veo.md)。

```bash
cp .env.example .env   # 填入 FAL_KEY，勿提交
python3 i2v.py --image still.png --out output/out.mp4
```
