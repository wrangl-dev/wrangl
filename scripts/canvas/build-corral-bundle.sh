#!/usr/bin/env bash
# Build the Corral canvas web bundle from vendor/corral, matching canvas/corral.pin.
#
# The desktop app and wrangl-server only accept a bundle whose embedded host tag equals the
# pin's `tag` (the canvas answers "bundle (dev) does not match this build" otherwise), so the
# tag, version and brand are taken from the pin here instead of being left to the caller.
#
# Needs: rustup target wasm32-unknown-unknown, and trunk, wasm-bindgen (the exact version in
# vendor/corral/Cargo.lock) and wasm-opt on PATH.
#
# Output: canvas/dist/corral-web-<tag>.zip, canvas/corral.pin updated to its sha256, and the
# zip extracted into canvas/bundle/ the same way scripts/canvas/fetch-corral-bundle.mjs does.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PIN="$REPO/canvas/corral.pin"
# Tools unpacked into canvas/.tools/bin (gitignored) are used before anything on PATH.
if [[ -d "$REPO/canvas/.tools/bin" ]]; then export PATH="$REPO/canvas/.tools/bin:$PATH"; fi
TAG="$(sed -n 's/^tag=//p' "$PIN")"
[[ -n "$TAG" ]] || { echo "error: no tag= line in $PIN" >&2; exit 1; }

for tool in trunk wasm-bindgen wasm-opt; do
  command -v "$tool" >/dev/null || { echo "error: $tool not found on PATH" >&2; exit 1; }
done

export CORRAL_VERSION="$TAG" CORRAL_HOST_TAG="$TAG" CORRAL_BRAND_NAME="${CORRAL_BRAND_NAME:-Wrangl}"
export CRAFT_FONTS_DIR="$REPO/vendor/fonts" CRAFT_FONTS_REQUIRED=1
export DIST="$REPO/canvas/dist"
mkdir -p "$DIST"

"$REPO/vendor/corral/packaging/web/package.sh"

ZIP="$DIST/corral-web-$TAG.zip"
ROOT="corral-web-$TAG"
WASM="$(unzip -Z1 "$ZIP" | grep -E "^$ROOT/corral-web-.*_bg\.wasm$" || true)"
[[ -n "$WASM" ]] || { echo "error: no wasm in $ZIP" >&2; exit 1; }
# Read all input (no grep -q): an early exit would SIGPIPE unzip and fail under pipefail.
unzip -p "$ZIP" "$WASM" | grep -aF "$TAG" >/dev/null \
  || { echo "error: host tag '$TAG' is not stamped into the wasm" >&2; exit 1; }
unzip -p "$ZIP" "$ROOT/index.html" | grep -F "<title>$CORRAL_BRAND_NAME</title>" >/dev/null \
  || { echo "error: brand '$CORRAL_BRAND_NAME' is not the page title" >&2; exit 1; }

SHA="$(shasum -a 256 "$ZIP" | cut -d' ' -f1)"
sed -i.bak "s/^sha256=.*/sha256=$SHA/" "$PIN" && rm -f "$PIN.bak"
node "$REPO/scripts/canvas/fetch-corral-bundle.mjs" --pin "$PIN" --out "$REPO/canvas/bundle" --zip "$ZIP"
echo "bundle $TAG: $ZIP"
echo "sha256 $SHA (written to canvas/corral.pin)"
