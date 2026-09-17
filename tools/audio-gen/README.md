# tools/audio-gen

Fish Audio 文本转语音（TTS）脚本。

完整说明：[`docs/fish-audio-tts.md`](../../docs/fish-audio-tts.md)

```bash
cp .env.example .env   # 填入 FISH_API_KEY，勿提交
python3 tts.py --text "你好，这是测试。" --out output/hello.mp3
```
