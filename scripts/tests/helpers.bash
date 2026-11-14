WRANGL_TEST_REPO_ROOT="$(cd "${BATS_TEST_DIRNAME:-$(dirname "${BASH_SOURCE[0]}")}/../.." && pwd)"

make_tmp() {
  WRANGL_TEST_TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/wrangl-install-test.XXXXXX")"
  WRANGL_TEST_STUB_BIN="$WRANGL_TEST_TMP_DIR/bin"
  mkdir -p "$WRANGL_TEST_STUB_BIN"

  WRANGL_TEST_ORIGINAL_PATH="${WRANGL_TEST_ORIGINAL_PATH:-$PATH}"
  PATH="$WRANGL_TEST_STUB_BIN:$WRANGL_TEST_ORIGINAL_PATH"

  export WRANGL_TEST_TMP_DIR
  export WRANGL_TEST_STUB_BIN
  export WRANGL_TEST_ORIGINAL_PATH
  export PATH
}

cleanup_tmp() {
  if [[ -n "${WRANGL_TEST_TMP_DIR:-}" && -d "$WRANGL_TEST_TMP_DIR" ]]; then
    rm -rf "$WRANGL_TEST_TMP_DIR"
  fi

  if [[ -n "${WRANGL_TEST_ORIGINAL_PATH:-}" ]]; then
    PATH="$WRANGL_TEST_ORIGINAL_PATH"
    export PATH
  fi

  unset WRANGL_TEST_TMP_DIR
  unset WRANGL_TEST_STUB_BIN
  unset WRANGL_TEST_ORIGINAL_PATH
}

stub_cmd() {
  local name="$1"
  shift

  if [[ -z "${WRANGL_TEST_STUB_BIN:-}" ]]; then
    make_tmp
  fi

  local stub_path="$WRANGL_TEST_STUB_BIN/$name"
  {
    printf '#!/usr/bin/env bash\n'
    printf '%s\n' "$*"
  } >"$stub_path"
  chmod +x "$stub_path"
}

load_install() {
  source "$WRANGL_TEST_REPO_ROOT/scripts/install.sh"
}
