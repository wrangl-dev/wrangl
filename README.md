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

Checks:

```bash
bun run lint && bun run typecheck && bun run test
cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
```

## License

MIT, see [LICENSE](LICENSE).
