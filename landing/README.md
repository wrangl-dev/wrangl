# Wrangl website

The marketing site at https://wrangl-landing.pages.dev: Vite, React and prerendered pages, served by Cloudflare Pages.

## Develop

```bash
bun install
bun run dev
```

## Build and check

```bash
bun run build
bun run verify:prerender
bun test
```

`build` prerenders every route into `dist/`, then writes `_headers` (security headers and a CSP with the hashes of the inline scripts), a 404 page, `sitemap.xml` and `robots.txt`.

## Deploy

```bash
bunx wrangler pages deploy dist --project-name=wrangl-landing
```

`functions/api/chain.ts` is a Pages Function that serves the chain ticker (latest block and gas). It reads through the keyed RPCs in the `RPC_URLS` secret (comma-separated, for example Alchemy and Chainstack), then the public RPCs, and caches each answer for 2 seconds. It only ever asks for the block number and gas price, and the keys never reach the browser. Set or change the secret with:

```bash
bunx wrangler pages secret put RPC_URLS --project-name=wrangl-landing
```

Without the secret it still works on the public RPCs. `wrangler pages dev dist` runs the site with the function locally.

Links to GitHub, the docs and the install scripts are in `src/lib/links.ts`. When the site moves to its own domain, change `SITE_URL` there.
