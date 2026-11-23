#!/usr/bin/env bash
# Install Wrangl from its latest GitHub release.
#
#   curl -fsSL https://raw.githubusercontent.com/wrangl-dev/wrangl/main/scripts/install.sh | bash
#
# macOS: copies Wrangl.app into /Applications (or ~/Applications).
# Linux: puts the AppImage at ~/.local/bin/wrangl and adds a menu entry. No sudo needed.
#
# Options (environment):
#   WRANGL_VERSION=0.2.0      install that version instead of the latest
#   WRANGL_DRY_RUN=1          print what would be downloaded, change nothing
#   WRANGL_RELEASE_JSON=path  read the release from a file (for tests)
set -euo pipefail

REPO="wrangl-dev/wrangl"

say() { printf 'wrangl: %s\n' "$*"; }
fail() { printf 'wrangl: %s\n' "$*" >&2; exit 1; }

release_json() {
  if [ -n "${WRANGL_RELEASE_JSON:-}" ]; then
    cat "$WRANGL_RELEASE_JSON"
    return
  fi
  local url="https://api.github.com/repos/$REPO/releases/latest"
  if [ -n "${WRANGL_VERSION:-}" ]; then
    url="https://api.github.com/repos/$REPO/releases/tags/v${WRANGL_VERSION#v}"
  fi
  curl -fsSL -H 'Accept: application/vnd.github+json' "$url" ||
    fail "no release found at $url (is a release published?)"
}

# Every asset download URL in the release, one per line.
asset_urls() {
  grep -o '"browser_download_url": *"[^"]*"' | sed 's/.*"\(https[^"]*\)"$/\1/'
}

# The URL in stdin ending with $1.
pick() {
  grep -E -- "$1\$" | head -n 1 || true
}

os="$(uname -s)"
arch="$(uname -m)"
urls="$(release_json | asset_urls)"
[ -n "$urls" ] || fail "the release has no downloads"

case "$os" in
  Darwin)
    case "$arch" in
      arm64 | aarch64) url="$(printf '%s\n' "$urls" | pick '_aarch64\.dmg')" ;;
      *) url="$(printf '%s\n' "$urls" | pick '_x64\.dmg')" ;;
    esac
    ;;
  Linux)
    case "$arch" in
      x86_64 | amd64) url="$(printf '%s\n' "$urls" | pick '_amd64\.AppImage')" ;;
      *) fail "no Linux build for $arch yet" ;;
    esac
    ;;
  *) fail "this script is for macOS and Linux; on Windows use install.ps1" ;;
esac
[ -n "$url" ] || fail "the release has no build for $os $arch"

if [ "${WRANGL_DRY_RUN:-}" = "1" ]; then
  echo "$url"
  exit 0
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
file="$tmp/$(basename "$url")"
say "downloading $(basename "$url")"
curl -fL --progress-bar -o "$file" "$url"

if [ "$os" = "Darwin" ]; then
  mount="$tmp/mount"
  mkdir -p "$mount"
  hdiutil attach -nobrowse -quiet -mountpoint "$mount" "$file"
  dest="/Applications"
  [ -w "$dest" ] || { dest="$HOME/Applications"; mkdir -p "$dest"; }
  rm -rf "$dest/Wrangl.app"
  cp -R "$mount/Wrangl.app" "$dest/"
  hdiutil detach -quiet "$mount"
  # The app is not notarized yet; without this macOS refuses to open a downloaded copy.
  xattr -dr com.apple.quarantine "$dest/Wrangl.app" 2>/dev/null || true
  say "installed $dest/Wrangl.app"
  say "open it from Applications or run: open -a Wrangl"
else
  bin="$HOME/.local/bin"
  mkdir -p "$bin" "$HOME/.local/share/applications"
  install -m 755 "$file" "$bin/wrangl"
  cat >"$HOME/.local/share/applications/wrangl.desktop" <<EOF
[Desktop Entry]
Name=Wrangl
Comment=The agent terminal for Robinhood Chain
Exec=$bin/wrangl
Terminal=false
Type=Application
Categories=Development;
EOF
  say "installed $bin/wrangl"
  case ":$PATH:" in
    *":$bin:"*) say "run: wrangl" ;;
    *) say "add $bin to your PATH, or run: $bin/wrangl" ;;
  esac
fi
