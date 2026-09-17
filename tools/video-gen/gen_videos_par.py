#!/usr/bin/env python3
"""Parallel runner for the remaining static/视频生成任务清单.md entries.

fal dispatches queued requests up to the account concurrency limit and parks the
rest in IN_QUEUE, so oversubmitting is safe: nothing is rejected and nothing is
billed twice. We therefore submit a pool of requests and let fal pace them,
recording how many ever sit in IN_PROGRESS at once so the real limit is observed
rather than guessed.

Reuses the task table and image prep from gen_videos.py; talks to the queue API
directly so each keyframe is uploaded once instead of once per shot.
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import gen_videos as G  # noqa: E402

MODEL = "fal-ai/veo3.1/lite/image-to-video"
QUEUE = f"https://queue.fal.run/{MODEL}"

BILLING_MARKERS = G.BILLING_MARKERS

state_lock = threading.Lock()
print_lock = threading.Lock()
upload_lock = threading.Lock()
stop_flag = threading.Event()

_uploads: dict[str, str] = {}

# Concurrency observation: how many of our requests are IN_PROGRESS right now.
inflight_lock = threading.Lock()
inflight = 0
peak_inflight = 0


def log(msg: str) -> None:
    with print_lock:
        print(msg, flush=True)


def load_key() -> str:
    import os

    key = os.environ.get("FAL_KEY", "").strip()
    if key:
        return key
    for path in [Path(__file__).resolve().parent / ".env", Path.home() / ".config/fal/key"]:
        if not path.is_file():
            continue
        for line in path.read_text(encoding="utf-8").strip().splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("FAL_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
            return line
    sys.exit("Missing FAL_KEY")


class ApiError(RuntimeError):
    def __init__(self, code: int, body: str):
        super().__init__(f"HTTP {code}: {body[:400]}")
        self.code = code
        self.body = body


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
    with urllib.request.urlopen(req, timeout=120) as resp:
        raw = resp.read().decode()
        return json.loads(raw) if raw else {}


def api_retry(method: str, url: str, key: str, body: dict | None = None) -> dict:
    """429 means we hit the concurrency limit; back off instead of failing."""
    delay = 2.0
    for attempt in range(8):
        try:
            return api(method, url, key, body)
        except urllib.error.HTTPError as exc:
            err = exc.read().decode()
            if exc.code == 429:
                log(f"  429 concurrency limit, backing off {delay:.0f}s")
                time.sleep(delay)
                delay = min(delay * 2, 60)
                continue
            raise ApiError(exc.code, err) from exc
        except urllib.error.URLError as exc:
            if attempt == 7:
                raise
            time.sleep(delay)
            delay = min(delay * 2, 60)
    raise ApiError(429, "still rate limited after retries")


def upload_image(path: Path, key: str) -> str:
    """Upload each distinct keyframe once and share the URL across shots."""
    cache_key = str(path)
    with upload_lock:
        if cache_key in _uploads:
            return _uploads[cache_key]
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    blob = path.read_bytes()
    init = api_retry(
        "POST",
        "https://rest.alpha.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3",
        key,
        {"content_type": mime, "file_name": path.name},
    )
    req = urllib.request.Request(
        init["upload_url"], data=blob, method="PUT", headers={"Content-Type": mime}
    )
    with urllib.request.urlopen(req, timeout=300):
        pass
    url = init["file_url"]
    with upload_lock:
        _uploads[cache_key] = url
    return url


def mark(vid: str, entry: dict) -> None:
    with state_lock:
        state = G.load_state()
        state[vid] = entry
        tmp = G.STATE.with_suffix(".json.tmp")
        tmp.write_text(
            json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        tmp.replace(G.STATE)


def run_task(task: dict, key: str) -> None:
    global inflight, peak_inflight
    vid = task["id"]
    if stop_flag.is_set():
        return
    outdir = G.OUTROOT / task["folder"]
    outdir.mkdir(parents=True, exist_ok=True)
    out = outdir / f"{vid}_{task['dur']}_{G.RESOLUTION}.mp4"
    if out.is_file():
        mark(vid, {"status": "ok", "sec": int(task["dur"][:-1]), "path": str(out)})
        return

    try:
        img = upload_image(G.prep_image(task["img"]), key)
        payload = {
            "prompt": task["prompt"],
            "image_url": img,
            "aspect_ratio": "16:9",
            "duration": task["dur"],
            "resolution": G.RESOLUTION,
            "generate_audio": False,
        }
        submitted = api_retry("POST", QUEUE, key, payload)
        rid = submitted.get("request_id")
        if not rid:
            raise RuntimeError(f"no request_id: {submitted}")
        status_url = submitted.get("status_url") or (
            f"https://queue.fal.run/fal-ai/veo3.1/requests/{rid}/status"
        )
        result_url = submitted.get("response_url") or (
            f"https://queue.fal.run/fal-ai/veo3.1/requests/{rid}"
        )
        log(f"[{vid}] queued {rid} ({task['dur']})")

        counted = False
        try:
            while True:
                if stop_flag.is_set():
                    log(f"[{vid}] abandoning poll, stop flag set")
                    return
                st = api_retry("GET", status_url, key).get("status")
                if st == "IN_PROGRESS" and not counted:
                    counted = True
                    with inflight_lock:
                        inflight += 1
                        peak_inflight = max(peak_inflight, inflight)
                        now = inflight
                    log(f"[{vid}] IN_PROGRESS (running now: {now})")
                if st == "COMPLETED":
                    break
                if st in {"FAILED", "CANCELLED"}:
                    raise RuntimeError(f"{vid} ended {st}")
                time.sleep(5)
        finally:
            if counted:
                with inflight_lock:
                    inflight -= 1

        result = api_retry("GET", result_url, key)
        video_url = (result.get("video") or {}).get("url")
        if not video_url:
            raise RuntimeError(f"no video.url: {json.dumps(result)[:400]}")
        tmp_out = out.with_suffix(".mp4.part")
        urllib.request.urlretrieve(video_url, tmp_out)
        tmp_out.replace(out)
        sec = int(task["dur"][:-1])
        mark(vid, {"status": "ok", "sec": sec, "path": str(out)})
        log(f"[{vid}] saved {out.name}")
    except Exception as exc:  # noqa: BLE001 - record and keep the pool going
        blob = str(exc)
        if isinstance(exc, ApiError):
            blob = f"{exc} {exc.body[:400]}"
        low = blob.lower()
        billing = any(m in low for m in BILLING_MARKERS)
        mark(
            vid,
            {
                "status": "billing_stop" if billing else "failed",
                "error": blob[-600:],
            },
        )
        log(f"[{vid}] FAILED {blob[:300]}")
        if billing:
            log("!!! BILLING STOP — halting all workers.")
            stop_flag.set()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--reverse", action="store_true")
    ap.add_argument("--resolution", choices=["720p", "1080p"])
    ap.add_argument("--state")
    ap.add_argument("--outroot")
    ap.add_argument(
        "--exclude", nargs="*", default=[],
        help="video ids owned by another process right now",
    )
    args = ap.parse_args()
    G.apply_run_config(
        reverse=args.reverse,
        resolution=args.resolution,
        state=args.state,
        outroot=args.outroot,
    )

    key = load_key()
    state = G.load_state()
    order = {"P0": 0, "P1": 1, "P2": 2}
    todo = [
        t
        for t in sorted(G.TASKS, key=lambda t: order[t["prio"]])
        if state.get(t["id"], {}).get("status") != "ok"
        and t["id"] not in args.exclude
    ]
    log(
        f"remaining={len(todo)} workers={args.workers} excluded={args.exclude} "
        f"resolution={G.RESOLUTION} out={G.OUTROOT}"
    )

    # Prep images up front; PIL resizing is not thread safe to do concurrently
    # on the same destination path.
    for t in todo:
        G.prep_image(t["img"])

    start = time.time()
    lock = threading.Lock()
    queue_iter = iter(todo)

    def worker() -> None:
        while not stop_flag.is_set():
            with lock:
                try:
                    task = next(queue_iter)
                except StopIteration:
                    return
            run_task(task, key)

    threads = [threading.Thread(target=worker, daemon=True)
               for _ in range(args.workers)]
    for th in threads:
        th.start()
    for th in threads:
        th.join()

    state = G.load_state()
    ok = [k for k, v in state.items() if v.get("status") == "ok"]
    bad = [k for k, v in state.items() if v.get("status") not in (None, "ok")]
    log("\n===== SUMMARY =====")
    log(f"ok={len(ok)} failed={len(bad)} total={len(G.TASKS)}")
    log(f"peak observed concurrency={peak_inflight}")
    log(f"elapsed={time.time() - start:.0f}s")
    if bad:
        log(f"failed: {bad}")


if __name__ == "__main__":
    main()
