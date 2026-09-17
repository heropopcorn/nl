#!/usr/bin/env python3
"""Fish Audio text-to-speech — POST https://api.fish.audio/v1/tts

Auth: Authorization: Bearer $FISH_API_KEY
Docs: https://docs.fish.audio/developer-guide/getting-started/quickstart
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

API_URL = "https://api.fish.audio/v1/tts"
DEFAULT_MODEL = "s2-pro"


def load_key() -> str:
    key = os.environ.get("FISH_API_KEY", "").strip()
    if key:
        return key
    candidates = [
        Path(__file__).resolve().parent / ".env",
        Path.home() / ".config/fish/key",
    ]
    for path in candidates:
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8").strip()
        for line in text.splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("FISH_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
            return line
    sys.exit(
        "Missing FISH_API_KEY. Export it or put FISH_API_KEY=... in tools/audio-gen/.env"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Fish Audio TTS")
    parser.add_argument("--text", required=True, help="Text to speak")
    parser.add_argument(
        "--out",
        default="output/fish_tts.mp3",
        help="Output audio path (default output/fish_tts.mp3)",
    )
    parser.add_argument(
        "--model",
        default=DEFAULT_MODEL,
        help="Header model: s1 | s2-pro | s2.1-pro | s2.1-pro-free (default s2-pro)",
    )
    parser.add_argument(
        "--format",
        default="mp3",
        choices=["mp3", "wav", "pcm", "opus"],
        help="Audio format (default mp3)",
    )
    parser.add_argument(
        "--reference-id",
        default="",
        help="Optional voice / model id from fish.audio (reference_id)",
    )
    parser.add_argument(
        "--latency",
        default="",
        help="Optional latency hint if supported by API (leave empty if unsure)",
    )
    args = parser.parse_args()

    key = load_key()
    body: dict = {"text": args.text, "format": args.format}
    if args.reference_id:
        body["reference_id"] = args.reference_id

    data = json.dumps(body).encode("utf-8")
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "model": args.model,
        "Accept": "*/*",
    }
    req = urllib.request.Request(API_URL, data=data, method="POST", headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            audio = resp.read()
            ctype = resp.headers.get("Content-Type", "")
    except urllib.error.HTTPError as exc:
        err = exc.read().decode("utf-8", errors="replace")
        sys.exit(f"HTTP {exc.code} {API_URL}\n{err}")

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(audio)
    print(f"saved {out} ({len(audio)} bytes, content-type={ctype!r})")


if __name__ == "__main__":
    main()
