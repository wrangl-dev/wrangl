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

Links to GitHub, the docs and the install scripts are in `src/lib/links.ts`. When the site moves to its own domain, change `SITE_URL` there.
