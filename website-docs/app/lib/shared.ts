export const appName = 'Wrangl Docs'
// Site path the docs are served under. Vite `base` and the React Router
// `basename` are both derived from it.
export const docsRoute = '/docs'
// Below the basename, so fumadocs prefixes it with the Vite base.
export const docsContentRoute = '/llms.mdx'

// Where the docs are served, no trailing slash. Canonicals, social cards, robots.txt
// and the sitemap are built from it. docs.wrangl.dev is not live yet.
export const docsSiteUrl = 'https://wrangl-docs.pages.dev'
// Shared with the landing site, which hosts the image.
export const ogImageUrl = 'https://wrangl-landing.pages.dev/og-image.png'

export const xHandle = '@wranglterm'
export const xUrl = 'https://x.com/wranglterm'

export const gitConfig = {
  user: 'wrangl-dev',
  repo: 'wrangl',
  branch: 'main'
}
