#!/usr/bin/env bash
# Headless MVP check: custom ground, water mask, path playback.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GODOT="${GODOT_BIN:-}"
if [[ -z "$GODOT" ]]; then
  if command -v godot >/dev/null 2>&1; then
    GODOT="$(command -v godot)"
  else
    GODOT="/tmp/godot-web-export/bin/Godot_v4.7.2-stable_linux.x86_64"
  fi
fi
exec "$GODOT" --headless --path "$ROOT" -- --selftest
