#!/usr/bin/env bash
# Vercel build (project Root Directory = video_game): build the new web director
# from the repo root and publish it into export/web, which vercel.json serves.
# Login stays enforced by video_game/middleware.ts.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="$(cd "$ROOT/.." && pwd)"
OUT_DIR="${OUT_DIR:-$ROOT/export/web}"

cd "$REPO"
npm ci --no-audit --no-fund
npm run build

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"
cp -R "$REPO/apps/director-web/dist/." "$OUT_DIR/"
echo "Published web director to $OUT_DIR:"
ls -la "$OUT_DIR"
