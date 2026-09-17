#!/usr/bin/env bash
# Headless Godot 4.7 Web export used by Vercel (and local CI).
# Progress/logs go to stderr so captured stdout is only the editor binary path.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

GODOT_VERSION="${GODOT_VERSION:-4.7.2-stable}"
CACHE_DIR="${GODOT_CACHE_DIR:-${HOME}/.cache/godot-web-export}"
BIN_DIR="${CACHE_DIR}/bin"
GODOT_BIN="${BIN_DIR}/Godot_v${GODOT_VERSION}_linux.x86_64"
TEMPLATE_DIR="${HOME}/.local/share/godot/export_templates/${GODOT_VERSION/-/.}"
OUT_DIR="${ROOT}/build/web"

mkdir -p "$BIN_DIR" "$OUT_DIR"

if [[ ! -x "$GODOT_BIN" ]]; then
  zip_url="https://github.com/godotengine/godot-builds/releases/download/${GODOT_VERSION}/Godot_v${GODOT_VERSION}_linux.x86_64.zip"
  echo "Downloading ${zip_url}" >&2
  tmp_zip="$(mktemp)"
  # Keep curl progress off stdout — CI used to capture the URL log line as the binary.
  curl -fsSL "$zip_url" -o "$tmp_zip" >&2
  unzip -o "$tmp_zip" -d "$BIN_DIR" >&2
  rm -f "$tmp_zip"
  chmod +x "$GODOT_BIN"
fi

echo "Using Godot: ${GODOT_BIN}" >&2
"$GODOT_BIN" --version >&2

if [[ ! -f "${TEMPLATE_DIR}/web_nothreads_release.zip" ]]; then
  echo "Installing official web export templates" >&2
  mkdir -p "$TEMPLATE_DIR"
  tpz="$(mktemp)"
  curl -fsSL "https://github.com/godotengine/godot-builds/releases/download/${GODOT_VERSION}/Godot_v${GODOT_VERSION}_export_templates.tpz" -o "$tpz" >&2
  python3 - "$tpz" "$TEMPLATE_DIR" <<'PY'
import sys, zipfile
from pathlib import Path
tpz, dest = sys.argv[1], Path(sys.argv[2])
with zipfile.ZipFile(tpz) as z:
    for name in z.namelist():
        base = Path(name).name
        if base.startswith("web_") and base.endswith(".zip"):
            dest.joinpath(base).write_bytes(z.read(name))
PY
  rm -f "$tpz"
  ls -lh "${TEMPLATE_DIR}"/web_nothreads_*.zip >&2
fi

mkdir -p "$OUT_DIR"
"$GODOT_BIN" --headless --path "$ROOT" --export-release "Web" "${OUT_DIR}/index.html"
echo "Exported:" >&2
ls -lh "$OUT_DIR" >&2
