#!/usr/bin/env python3
"""fal-ai/veo3.1/lite/image-to-video — widescreen, silent."""

from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

MODEL = "fal-ai/veo3.1/lite/image-to-video"
QUEUE = f"https://queue.fal.run/{MODEL}"
DEFAULT_IMAGE = (
    "https://storage.googleapis.com/falserverless/example_inputs/veo3-i2v-input.png"
)
DEFAULT_PROMPT = (
    "The subject turns to face the camera and smiles warmly. "
    "Cinematic, smooth camera, natural motion."
)


def load_key() -> str:
    key = os.environ.get("FAL_KEY", "").strip()
    if key:
        return key
    candidates = [
        Path(__file__).resolve().parent / ".env",
        Path.home() / ".config/fal/key",
    ]
    for path in candidates:
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8").strip()
        for line in text.splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("FAL_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
            return line
    sys.exit("Missing FAL_KEY. Export it or put FAL_KEY=... in tools/video-gen/.env or export FAL_KEY")


def api(method: str, url: str, key: str, body: dict | None = None) -> dict:
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": f"Key {key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            raw = resp.read().decode()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        err = exc.read().decode()
        sys.exit(f"HTTP {exc.code} {url}\n{err}")


def upload_local_image(path: Path, key: str) -> str:
    """Put a local file in fal storage; fall back to an inline data URI."""
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    blob = path.read_bytes()
    try:
        init = api(
            "POST",
            "https://rest.alpha.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3",
            key,
            {"content_type": mime, "file_name": path.name},
        )
        upload_url = init["upload_url"]
        req = urllib.request.Request(
            upload_url, data=blob, method="PUT", headers={"Content-Type": mime}
        )
        with urllib.request.urlopen(req, timeout=300):
            pass
        return init["file_url"]
    except (urllib.error.URLError, KeyError, SystemExit) as exc:
        print(f"storage upload failed ({exc}); falling back to data URI")
        return f"data:{mime};base64," + base64.b64encode(blob).decode()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Veo 3.1 Lite image-to-video (16:9, no audio)"
    )
    parser.add_argument(
        "--image", default=DEFAULT_IMAGE, help="Public image URL or local file path"
    )
    parser.add_argument("--prompt", default=DEFAULT_PROMPT)
    parser.add_argument("--duration", default="4s", choices=["4s", "6s", "8s"])
    parser.add_argument("--resolution", default="1080p", choices=["720p", "1080p"])
    parser.add_argument("--out", default="output/veo_i2v.mp4")
    args = parser.parse_args()

    key = load_key()
    image_url = args.image
    if not image_url.startswith(("http://", "https://", "data:")):
        local = Path(image_url).expanduser().resolve()
        if not local.is_file():
            sys.exit(f"No such image: {local}")
        image_url = upload_local_image(local, key)
        print(f"image {image_url[:96]}")

    payload = {
        "prompt": args.prompt,
        "image_url": image_url,
        "aspect_ratio": "16:9",
        "duration": args.duration,
        "resolution": args.resolution,
        "generate_audio": False,
    }
    printable = dict(payload, image_url=image_url[:96])
    print("submit", json.dumps(printable, ensure_ascii=False))
    submitted = api("POST", QUEUE, key, payload)
    request_id = submitted.get("request_id")
    if not request_id:
        sys.exit(f"No request_id: {submitted}")
    print(f"queued {request_id}")
    # fal returns canonical URLs; nested model paths 405 if you append /requests yourself
    status_url = submitted.get("status_url") or (
        f"https://queue.fal.run/fal-ai/veo3.1/requests/{request_id}/status"
    )
    result_url = submitted.get("response_url") or (
        f"https://queue.fal.run/fal-ai/veo3.1/requests/{request_id}"
    )
    while True:
        status = api("GET", status_url, key)
        state = status.get("status")
        logs = status.get("logs") or []
        for log in logs[-3:]:
            msg = log.get("message") if isinstance(log, dict) else log
            if msg:
                print(f"  {msg}")
        print(f"status {state}")
        if state == "COMPLETED":
            break
        if state in {"FAILED", "CANCELLED"}:
            sys.exit(json.dumps(status, indent=2))
        time.sleep(5)

    result = api("GET", result_url, key)
    video_url = (result.get("video") or {}).get("url")
    if not video_url:
        sys.exit(f"No video.url: {json.dumps(result, indent=2)}")

    out = Path(args.out)
    if not out.is_absolute():
        out = Path(__file__).resolve().parent / out
    out.parent.mkdir(parents=True, exist_ok=True)
    urllib.request.urlretrieve(video_url, out)
    print(f"saved {out}")
    print(f"url {video_url}")


if __name__ == "__main__":
    main()
