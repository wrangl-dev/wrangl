# Corral

The canvas engine Wrangl embeds: document model, rendering, text, import/export, the MCP control
surface (`crates/mcp`) and the browser build (`apps/corral-web`).

Vendored and modified for Wrangl. Licensed MIT OR Apache-2.0 (`LICENSE-MIT`, `LICENSE-APACHE`);
copyright and third-party notices are in `src-tauri/resources/licenses/corral.md`.

## Build the web bundle

    CRAFT_FONTS_DIR=$PWD/../fonts CRAFT_FONTS_REQUIRED=1 CORRAL_BRAND_NAME=Wrangl \
      CORRAL_VERSION=corral-v0.6.0 packaging/web/package.sh

Needs the `wasm32-unknown-unknown` target, trunk, wasm-bindgen-cli 0.2.129 and wasm-opt.
