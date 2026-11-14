#!/usr/bin/env bats

load "helpers.bash"

setup() {
  make_tmp
  source "$WRANGL_TEST_REPO_ROOT/scripts/release/homebrew.sh"
}

teardown() {
  cleanup_tmp
}

@test "normalizes full SemVer tags with dotted prerelease and build identifiers" {
  run normalize_release_version "v1.2.3-beta.1"
  [ "$status" -eq 0 ]
  [ "$output" = "1.2.3-beta.1" ]

  run normalize_release_version "1.2.3-beta.1+macos.7"
  [ "$status" -eq 0 ]
  [ "$output" = "1.2.3-beta.1+macos.7" ]

  run normalize_release_version "1.2.3+signed-macos.7"
  [ "$status" -eq 0 ]
  [ "$output" = "1.2.3+signed-macos.7" ]
}

@test "rejects incomplete unsafe and leading-zero versions" {
  for invalid in \
    "1.2" \
    "1.2.3/../../tap" \
    "01.2.3" \
    "1.02.3" \
    "1.2.03" \
    "1.2.3-01" \
    "1.2.3-beta.01"; do
    run normalize_release_version "$invalid"
    [ "$status" -ne 0 ]
  done
}

@test "classifies prerelease before build metadata only" {
  run is_release_prerelease "1.2.3-beta.1+signed-macos.7"
  [ "$status" -eq 0 ]

  run is_release_prerelease "1.2.3+signed-macos.7"
  [ "$status" -ne 0 ]
}

@test "resolves exact DMG checksums" {
  local checksums="$WRANGL_TEST_TMP_DIR/SHA256SUMS.txt"
  local arm_sha="$(printf 'a%.0s' {1..64})"
  local intel_sha="$(printf 'b%.0s' {1..64})"
  cat >"$checksums" <<EOF
$arm_sha  Wrangl_0.1.0_aarch64.dmg
$intel_sha *Wrangl_0.1.0_x64.dmg
EOF

  run resolve_dmg_checksums "$checksums" "0.1.0"
  [ "$status" -eq 0 ]
  [ "${lines[0]}" = "$arm_sha" ]
  [ "${lines[1]}" = "$intel_sha" ]
}

@test "checksum resolution propagates missing malformed and duplicate errors" {
  local checksums="$WRANGL_TEST_TMP_DIR/SHA256SUMS.txt"
  local arm_sha="$(printf 'a%.0s' {1..64})"
  local intel_sha="$(printf 'b%.0s' {1..64})"

  printf '%s  %s\n' "$arm_sha" "Wrangl_0.1.0_aarch64.dmg" >"$checksums"
  run resolve_dmg_checksums "$checksums" "0.1.0"
  [ "$status" -ne 0 ]
  [[ "$output" == *"x64.dmg"* ]]

  cat >"$checksums" <<EOF
not-a-hash  Wrangl_0.1.0_aarch64.dmg
$intel_sha  Wrangl_0.1.0_x64.dmg
EOF
  run resolve_dmg_checksums "$checksums" "0.1.0"
  [ "$status" -ne 0 ]
  [[ "$output" == *"aarch64.dmg"* ]]

  cat >"$checksums" <<EOF
$arm_sha  Wrangl_0.1.0_aarch64.dmg
$arm_sha  Wrangl_0.1.0_aarch64.dmg
$intel_sha  Wrangl_0.1.0_x64.dmg
EOF
  run resolve_dmg_checksums "$checksums" "0.1.0"
  [ "$status" -ne 0 ]
  [[ "$output" == *"aarch64.dmg"* ]]
}

@test "writes the cask with the Wrangl app and DMG names" {
  local cask="$WRANGL_TEST_TMP_DIR/wrangl-0.1.0.rb"
  local arm_sha="6be298c2c2c8562b340b069357e8b5d6c3838791ac77c089114004db6a663e69"
  local intel_sha="72b1d5ab617dcc72c021ec4524ec90a8607870d2011fa83686c4ccda185854c8"

  write_homebrew_cask "$cask" "0.1.0" "$arm_sha" "$intel_sha"
  grep -Fxq '  url "https://github.com/wrangl-dev/wrangl/releases/download/v#{version}/Wrangl_#{version}_#{arch}.dmg"' "$cask"
  grep -Fxq '  name "Wrangl"' "$cask"
  grep -Fxq '  app "Wrangl.app"' "$cask"
  ! grep -Fq 'com.apple.quarantine' "$cask"
}

@test "prerelease metadata path does not require a Homebrew token" {
  local workflow="$WRANGL_TEST_REPO_ROOT/.github/workflows/publish-homebrew.yml"
  local metadata_section
  local checksums_section
  metadata_section="$(sed -n '/release_metadata:/,/checksums:/p' "$workflow")"
  checksums_section="$(sed -n '/checksums:/,/homebrew:/p' "$workflow")"

  grep -Fq "if: needs.release_metadata.outputs.is_prerelease == 'false'" "$workflow"
  [ -n "$metadata_section" ]
  [ -n "$checksums_section" ]
  ! grep -q 'HOMEBREW_TAP_TOKEN' <<<"$metadata_section"
  ! grep -q 'HOMEBREW_TAP_TOKEN' <<<"$checksums_section"
}

@test "release workflows preserve permissions token flow portability and tap serialization" {
  local release_workflow="$WRANGL_TEST_REPO_ROOT/.github/workflows/release.yml"
  local homebrew_workflow="$WRANGL_TEST_REPO_ROOT/.github/workflows/publish-homebrew.yml"

  grep -Fq 'group: publish-homebrew-tap' "$homebrew_workflow"
  grep -Fq 'GH_TOKEN: ${{ secrets.HOMEBREW_TAP_TOKEN }}' "$homebrew_workflow"
  grep -Fq 'contents: write' "${release_workflow}"
  grep -Fq 'source scripts/release/homebrew.sh' "$release_workflow"
  grep -Fq 'otool -L "$executable"' "$release_workflow"
  grep -Fq 'LC_RPATH' "$release_workflow"
  local macos_verification_section
  macos_verification_section="$(sed -n '/Verify macOS bundle library portability and signing/,/Collect platform release assets/p' "$release_workflow")"
  [ -n "$macos_verification_section" ]
  ! grep -q 'mapfile' <<<"$macos_verification_section"
  ! grep -Fq 'env.APPLE_CERTIFICATE' "$release_workflow"
  grep -Fq 'security import "$p12"' "$release_workflow"
  grep -Fq 'secrets.APPLE_SIGNING_IDENTITY' "$release_workflow"
  grep -Fq 'secrets.APPLE_TEAM_ID' "$release_workflow"
}

@test "generate_sha256sums writes bare-name entries and skips signatures and manifests" {
  local dir="$WRANGL_TEST_TMP_DIR/assets"
  local names="$WRANGL_TEST_TMP_DIR/names.txt"
  local out="$WRANGL_TEST_TMP_DIR/SHA256SUMS.txt"
  mkdir -p "$dir"
  printf 'app-image-bytes' >"$dir/Wrangl_0.1.0_amd64.AppImage"
  printf 'sig-bytes' >"$dir/Wrangl_0.1.0_amd64.AppImage.sig"
  printf '{}' >"$dir/latest.json"
  printf 'server-bytes' >"$dir/wrangl-server"
  cat >"$names" <<NAMES
Wrangl_0.1.0_amd64.AppImage
Wrangl_0.1.0_amd64.AppImage.sig
latest.json
wrangl-server
NAMES

  run generate_sha256sums "$dir" "$names" "$out"
  [ "$status" -eq 0 ]

  # Entries carry the bare asset name (two-space separator), not a path.
  local expected_appimage_sha expected_server_sha
  expected_appimage_sha="$(printf 'app-image-bytes' | shasum -a 256 | awk '{print $1}')"
  expected_server_sha="$(printf 'server-bytes' | shasum -a 256 | awk '{print $1}')"
  grep -Fq "$expected_appimage_sha  Wrangl_0.1.0_amd64.AppImage" "$out"
  grep -Fq "$expected_server_sha  wrangl-server" "$out"

  # Signatures and updater manifests are not checksummed.
  [ "$(grep -c '' "$out")" -eq 2 ]
  ! grep -Fq '.sig' "$out"
  ! grep -Fq 'latest.json' "$out"
}

@test "generate_sha256sums refuses filenames that do not match published asset names" {
  # A checksum entry whose name differs from the published asset (here a
  # space instead of an underscore) makes the installer's exact-match lookup
  # fail with "checksum not found".
  local dir="$WRANGL_TEST_TMP_DIR/assets"
  local names="$WRANGL_TEST_TMP_DIR/names.txt"
  local out="$WRANGL_TEST_TMP_DIR/SHA256SUMS.txt"
  mkdir -p "$dir"
  printf 'app-image-bytes' >"$dir/Wrangl App_0.1.0_amd64.AppImage"
  printf 'Wrangl_0.1.0_amd64.AppImage' >"$names"

  run generate_sha256sums "$dir" "$names" "$out"
  [ "$status" -ne 0 ]
  [[ "$output" == *"not a published release asset name"* ]]
  [[ "$output" == *"Wrangl App_0.1.0_amd64.AppImage"* ]]

  # Nothing may be written when validation fails.
  [ ! -s "$out" ]
  # The atomic-write temp file must be cleaned up too.
  [ -z "$(find "$WRANGL_TEST_TMP_DIR" -maxdepth 1 -name 'SHA256SUMS.txt.tmp.*' -print -quit)" ]
}

@test "generate_sha256sums leaves no partial output when a valid asset sorts before a mismatched one" {
  # CodeRabbit review: a valid asset processed before the failure must not
  # leave partial checksum output behind, and a previously published
  # checksum file must survive the failed regeneration.
  local dir="$WRANGL_TEST_TMP_DIR/assets"
  local names="$WRANGL_TEST_TMP_DIR/names.txt"
  local out="$WRANGL_TEST_TMP_DIR/SHA256SUMS.txt"
  mkdir -p "$dir"
  # "AAA..." sorts before "Wrangl App...", so the valid asset is
  # checksummed first and the mismatch then aborts the run.
  printf 'deb-bytes' >"$dir/AAA_valid.deb"
  printf 'app-image-bytes' >"$dir/Wrangl App_0.1.0_amd64.AppImage"
  printf 'AAA_valid.deb' >"$names"

  printf 'old-checksum-content\n' >"$out"

  run generate_sha256sums "$dir" "$names" "$out"
  [ "$status" -ne 0 ]
  [[ "$output" == *"not a published release asset name"* ]]

  # The prior checksum file is untouched — no partial write, no clobber.
  [ "$(cat "$out")" = "old-checksum-content" ]
  [ -z "$(find "$WRANGL_TEST_TMP_DIR" -maxdepth 1 -name 'SHA256SUMS.txt.tmp.*' -print -quit)" ]
}

@test "generate_sha256sums requires assets and a nonempty expected-names list" {
  local dir="$WRANGL_TEST_TMP_DIR/empty-assets"
  local names="$WRANGL_TEST_TMP_DIR/names.txt"
  local out="$WRANGL_TEST_TMP_DIR/SHA256SUMS.txt"
  mkdir -p "$dir"
  : >"$names"

  run generate_sha256sums "$dir" "$names" "$out"
  [ "$status" -ne 0 ]
  [[ "$output" == *"missing or empty"* ]]

  printf 'Wrangl_0.1.0_amd64.AppImage' >"$names"
  run generate_sha256sums "$dir" "$names" "$out"
  [ "$status" -ne 0 ]
  [[ "$output" == *"No binary release assets"* ]]
}

@test "generated cask does not declare a depends_on macos requirement" {
  local cask="$WRANGL_TEST_TMP_DIR/wrangl-0.1.0.rb"
  local arm_sha="6be298c2c2c8562b340b069357e8b5d6c3838791ac77c089114004db6a663e69"
  local intel_sha="72b1d5ab617dcc72c021ec4524ec90a8607870d2011fa83686c4ccda185854c8"

  write_homebrew_cask "$cask" "0.1.0" "$arm_sha" "$intel_sha"

  run grep -E '^[[:space:]]*depends_on[[:space:]]' "$cask"
  [ "$status" -eq 1 ]
  [ -z "$output" ]
}

@test "update_homebrew_tap writes Casks/wrangl.rb" {
  local tap="$WRANGL_TEST_TMP_DIR/tap"
  local arm_sha="6be298c2c2c8562b340b069357e8b5d6c3838791ac77c089114004db6a663e69"
  local intel_sha="72b1d5ab617dcc72c021ec4524ec90a8607870d2011fa83686c4ccda185854c8"

  update_homebrew_tap "$tap" "0.1.0" "$arm_sha" "$intel_sha"

  [ "$(ls "$tap/Casks")" = "wrangl.rb" ]
  [ ! -e "$tap/cask_renames.json" ]
  [ "$(cat "$tap/Casks/wrangl.rb")" = 'cask "wrangl" do
  arch arm: "aarch64", intel: "x64"

  version "0.1.0"
  sha256 arm:   "6be298c2c2c8562b340b069357e8b5d6c3838791ac77c089114004db6a663e69",
         intel: "72b1d5ab617dcc72c021ec4524ec90a8607870d2011fa83686c4ccda185854c8"

  url "https://github.com/wrangl-dev/wrangl/releases/download/v#{version}/Wrangl_#{version}_#{arch}.dmg"
  name "Wrangl"
  desc "Terminal-native workspace and CLI agent manager"
  homepage "https://github.com/wrangl-dev/wrangl"

  auto_updates true

  app "Wrangl.app"

  zap trash: [
    "~/Library/Application Support/dev.wrangl.app",
    "~/Library/Caches/dev.wrangl.app",
    "~/Library/HTTPStorages/dev.wrangl.app",
    "~/Library/Logs/dev.wrangl.app",
    "~/Library/Preferences/dev.wrangl.app.plist",
    "~/Library/Saved Application State/dev.wrangl.app.savedState",
    "~/Library/WebKit/dev.wrangl.app",
  ]
end' ]

  update_homebrew_tap "$tap" "0.1.1" "$arm_sha" "$intel_sha"

  [ "$(ls "$tap/Casks")" = "wrangl.rb" ]
  grep -Fxq '  version "0.1.1"' "$tap/Casks/wrangl.rb"
}
