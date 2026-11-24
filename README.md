# Wrangl

The agent terminal for Robinhood Chain.

Wrangl puts a terminal and your AI coding agents in one desktop window. Agents can read Robinhood Chain and prepare token swaps; you sign every transaction in your own wallet. Wrangl never holds a private key.

> Status: early rebuild. The previous app lives at [wrangl-dev/wrangl-legacy](https://github.com/wrangl-dev/wrangl-legacy).

## Develop

Needs [Rust](https://rustup.rs), [bun](https://bun.sh) and the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS.

```bash
bun install
bun run dev
```

### In a browser

The same UI runs in a browser for development and testing, with real terminals behind it. Run these in two terminals, then open http://localhost:1420:

```bash
bun run web:server
```

```bash
bun run web:dev
```

`wrangl-web` listens on `127.0.0.1:4220` only and accepts pages from `localhost:1420` and `localhost:4220`, so other websites cannot reach it. Terminals a browser tab opened end when the tab closes.

Checks:

```bash
bun run lint && bun run typecheck && bun run test
cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
```

### End-to-end tests

`tests/e2e/` drives the real UI and the real backend (`wrangl-web`) in a browser, with a scripted ACP agent (`tests/e2e/fake-agent.ts`) instead of an LLM. It covers the agent picker, chat and Markdown, approvals, plans, stop, chats running in the background, terminals, the wallet, Settings, and the chain and swap tools through Wrangl's own MCP server. Each run uses a throwaway data folder (`WRANGL_DATA_DIR`), so your own projects and settings are never touched.

```bash
bunx playwright install chromium   # once
bun run test:e2e                   # builds the UI and wrangl-web, then runs the suite
bun run test:e2e:only --grep-invert @network   # skip the tests that reach the chain
```

`E2E_CHANNEL=msedge` (or `chrome`) runs it in an installed browser instead of Playwright's Chromium.

## License

MIT, see [LICENSE](LICENSE).
