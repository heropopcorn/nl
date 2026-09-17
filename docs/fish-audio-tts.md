# Fish Audio 文本转语音（TTS）

脚本：`tools/audio-gen/tts.py`  
官方文档：https://docs.fish.audio/developer-guide/getting-started/quickstart  
API Keys：https://fish.audio/app/api-keys  
OpenAPI：https://api.fish.audio/openapi.json

## 调用方式

- **URL**：`POST https://api.fish.audio/v1/tts`
- **鉴权**：`Authorization: Bearer <FISH_API_KEY>`
- **必需 Header**：`model`（如 `s2-pro`；免费开发档可用 `s2.1-pro-free`）
- **Body（JSON）**：至少 `text`、`format`（如 `mp3`）；可选 `reference_id`（音色 ID）

## 密钥

```bash
cp tools/audio-gen/.env.example tools/audio-gen/.env
# 编辑 .env，填入从 https://fish.audio/app/api-keys 创建的密钥
```

或：`export FISH_API_KEY=...`  
**禁止把真实密钥提交进 Git。**

## 示例

```bash
cd tools/audio-gen
python3 tts.py --text "主角走到村口，土路上尘土飞扬。" --out output/line.mp3
python3 tts.py --text "..." --reference-id "<voice_id>" --model s2-pro --out output/char.mp3
```

Python SDK（可选）：`pip install fish-audio-sdk`，见官方 Quick Start。

## 常见错误

| HTTP | 含义 |
|------|------|
| 401 | 密钥无效或缺失 |
| 402 | 额度不足 |
| 429 | 限流，稍后重试 |
