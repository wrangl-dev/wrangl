# Wrangl Landing Page

A standalone Vite + React marketing page for Wrangl, hosted on Cloudflare Pages.

## Prerequisites

- [Bun](https://bun.sh) 1.3+ (pinned in `package.json` as `bun@1.3.11`)

Run commands from this `landing/` directory, or from the repo root via `bun run landing:dev`, `landing:build`, and `landing:lint`.

## Development

```bash
bun install
bun run dev
```

The dev server runs from this `landing/` directory and does not affect the Tauri desktop app. Dev mode is a standard SPA with HMR; prerendering only runs on production build.

## Production Build

```bash
bun run build
bun run verify:prerender
bun run preview
```

The build uses `vite-plugin-react-ssg` to prerender `/` into static HTML at build time. Crawlers receive full page content in `dist/index.html` while the client bundle hydrates for interactivity.

Static SEO files ship from `public/`:

- `robots.txt`
- `sitemap.xml`
- `og-image.png`

## Deploy to Cloudflare Pages

Deploy the static build to Cloudflare Pages via the `wrangler` CLI:

```bash
bun run build
bun run deploy
```

The `deploy` script invokes `wrangler pages deploy dist` and uploads the build output to the `wrangl-landing` project.

**First-time setup:**

1. Run `bunx wrangler login` to authenticate with your Cloudflare account.
2. Create the Pages project (already done — `wrangl-landing`):
   ```bash
   bunx wrangler pages project create wrangl-landing --production-branch main
   ```
3. Connect the custom domain `wrangl.dev`:
   - Go to [Cloudflare Pages → wrangl-landing → Custom domains](https://dash.cloudflare.com/?to=/:account/pages/view/wrangl-landing/custom-domains)
   - Click **Set up a custom domain** and enter `wrangl.dev`
   - Cloudflare auto-provisions SSL and routes traffic (DNS must be on Cloudflare)

**Routing and 404:** Every route is prerendered to static HTML, so there is no SPA catch-all rewrite. The catch-all `*` route (`NotFoundPage`) is prerendered at `/404` and `scripts/write-404.ts` moves it to `dist/404.html`, which Cloudflare Pages serves with a real 404 status for unknown URLs. If you add a route, add it to `src/routes/index.tsx` (and `public/sitemap.xml` if it should be indexed) so it is prerendered.

## Verify SEO Output

After `bun run build`:

1. Open `dist/index.html` and confirm `#app` contains rendered markup (e.g. "Terminal, reimagined", feature titles, footer CTA).
2. Run `bun run verify:prerender` for an automated check.
3. After deploy to `https://wrangl.dev`, validate with [Google Rich Results Test](https://search.google.com/test/rich-results) or view-source in the browser.
