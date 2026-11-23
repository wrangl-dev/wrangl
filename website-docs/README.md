# Wrangl docs

The docs at https://wrangl-docs.pages.dev/docs/. Markdown pages in `content/`, turned into static HTML by `build.ts` (no framework).

```bash
bun install
bun run build     # writes dist/
bun test
bunx wrangler pages deploy dist --project-name=wrangl-docs
```

A page is `content/<slug>.md` or `content/<slug>/index.md`, served at `/docs/<slug>`. It starts with `title:` and `description:` lines between `---` fences. The sidebar order is the `NAV` list in `build.ts`; a page missing from it fails the build.
