#!/usr/bin/env bash
# Headless Godot 4.7.2 Web (HTML5) export — single-threaded, no SharedArrayBuffer.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

GODOT_VERSION="${GODOT_VERSION:-4.7.2}"
TEMPLATE_VERSION="${GODOT_TEMPLATE_VERSION:-4.7.2.stable}"
OUT_DIR="${OUT_DIR:-$ROOT/export/web}"
CACHE_DIR="${GODOT_CACHE_DIR:-$HOME/.cache/godot-web-export}"
TEMPLATE_HOME="${GODOT_TEMPLATE_HOME:-$HOME/.local/share/godot/export_templates/$TEMPLATE_VERSION}"
RELEASES_BASE="${GODOT_RELEASES_BASE:-https://github.com/godotengine/godot-builds/releases/download/${GODOT_VERSION}-stable}"

mkdir -p "$CACHE_DIR" "$OUT_DIR" "$TEMPLATE_HOME"
# Keep generated HTML5 files out of Godot's import scan.
if [[ ! -f "$ROOT/export/.gdignore" ]]; then
  mkdir -p "$ROOT/export"
  printf '*\n' > "$ROOT/export/.gdignore"
fi

need_cmd() {
  command -v "$1" >/dev/null 2>&1
}

log() {
  echo "$@" >&2
}

download() {
  local url="$1" dest="$2"
  if [[ -f "$dest" && -s "$dest" ]]; then
    return 0
  fi
  log "Downloading $url"
  curl -fL --retry 4 --retry-delay 4 -o "$dest.partial" "$url"
  mv "$dest.partial" "$dest"
}

# Sets GODOT to an executable editor path. Progress logs go to stderr so this
# can be captured with $(resolve_godot) without picking up curl/echo noise.
resolve_godot() {
  if [[ -n "${GODOT_BIN:-}" && -x "$GODOT_BIN" ]]; then
    GODOT="$GODOT_BIN"
    return
  fi
  if need_cmd godot; then
    GODOT="$(command -v godot)"
    return
  fi
  local local_bin="/tmp/godot-bin/Godot_v${GODOT_VERSION}-stable_linux.x86_64"
  if [[ -x "$local_bin" ]]; then
    GODOT="$local_bin"
    return
  fi
  local zip="$CACHE_DIR/Godot_v${GODOT_VERSION}-stable_linux.x86_64.zip"
  local bin="$CACHE_DIR/bin/Godot_v${GODOT_VERSION}-stable_linux.x86_64"
  download "$RELEASES_BASE/Godot_v${GODOT_VERSION}-stable_linux.x86_64.zip" "$zip"
  mkdir -p "$CACHE_DIR/bin"
  unzip -o -q "$zip" -d "$CACHE_DIR/bin"
  chmod +x "$bin"
  if [[ ! -x "$bin" ]]; then
    log "Godot binary missing after unzip: $bin"
    ls -la "$CACHE_DIR/bin" >&2 || true
    exit 1
  fi
  GODOT="$bin"
}

install_web_templates() {
  local needed=("web_nothreads_release.zip" "web_nothreads_debug.zip")
  local missing=0
  local name
  for name in "${needed[@]}"; do
    if [[ ! -s "$TEMPLATE_HOME/$name" ]]; then
      missing=1
      break
    fi
  done
  if [[ "$missing" -eq 0 ]]; then
    return
  fi

  # Prefer pre-extracted web zips in the repo (keeps CI/Vercel off the 1.2GB tpz).
  local bundled="$ROOT/tools/web-templates"
  if [[ -s "$bundled/web_nothreads_release.zip" ]]; then
    log "Installing bundled web export templates"
    cp -f "$bundled/"web_nothreads_*.zip "$TEMPLATE_HOME/"
    printf '%s\n' "$TEMPLATE_VERSION" > "$TEMPLATE_HOME/version.txt"
    return
  fi

  local tpz="$CACHE_DIR/Godot_v${GODOT_VERSION}-stable_export_templates.tpz"
  download "$RELEASES_BASE/Godot_v${GODOT_VERSION}-stable_export_templates.tpz" "$tpz"
  log "Extracting web_nothreads templates from tpz"
  # The tpz is a zip; templates live under templates/
  unzip -o -q "$tpz" "templates/web_nothreads_release.zip" "templates/web_nothreads_debug.zip" -d "$CACHE_DIR/tpz"
  cp -f "$CACHE_DIR/tpz/templates/web_nothreads_release.zip" "$TEMPLATE_HOME/"
  cp -f "$CACHE_DIR/tpz/templates/web_nothreads_debug.zip" "$TEMPLATE_HOME/"
  printf '%s\n' "$TEMPLATE_VERSION" > "$TEMPLATE_HOME/version.txt"
}

GODOT=""
resolve_godot
log "Using Godot: $GODOT"
"$GODOT" --version

install_web_templates
ls -lh "$TEMPLATE_HOME"/web_nothreads_*.zip

mkdir -p "$OUT_DIR"
# Import first so .import sidecars exist, then export.
"$GODOT" --headless --path "$ROOT" --import --quit
"$GODOT" --headless --path "$ROOT" --export-release "Web" "$OUT_DIR/index.html"

# Godot may drop .import sidecars next to PNGs if export/ was scanned; do not serve them.
rm -f "$OUT_DIR"/*.import

echo "Exported:"
ls -lh "$OUT_DIR"
