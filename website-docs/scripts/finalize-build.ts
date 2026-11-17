#!/usr/bin/env bun

/**
 * Post-build layout for the `/docs/` base path.
 *
 * React Router writes prerendered pages under build/client/docs/, but Vite
 * writes assets and public files to build/client/ while linking them as
 * /docs/... This script moves everything into build/client/docs/, so that
 * directory is the whole site as served under /docs/. The landing deploy
 * copies it to dist/docs/.
 *
 * The SPA fallback becomes docs/404.html: Cloudflare Pages serves the nearest
 * 404.html with a 404 status for unknown URLs, so /docs/* misses render the
 * docs not-found page and paths outside /docs are left to whoever owns them.
 *
 * build/client/_redirects is only read by the standalone docs project
 * (docs.wrangl.dev), which serves build/client at its root.
 */

import { existsSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { docsRoute, docsSiteUrl } from '../app/lib/shared'
import { docPagePaths, robotsTxt, sitemapXml } from './seo-files'

const client = 'build/client'
const site = join(client, docsRoute)
const spaFallback = join(client, 'index.html')

if (!existsSync(join(site, 'index.html')) || !existsSync(spaFallback)) {
  console.error(`Expected ${site}/index.html and the SPA fallback at ${spaFallback}.`)
  process.exit(1)
}

renameSync(spaFallback, join(site, '404.html'))

for (const entry of readdirSync(client)) {
  if (entry === docsRoute.slice(1)) continue
  const target = join(site, entry)
  if (existsSync(target)) {
    console.error(`${target} already exists; ${join(client, entry)} would overwrite it.`)
    process.exit(1)
  }
  renameSync(join(client, entry), target)
}

// Old root URLs from before the docs moved under /docs.
const redirects = [
  `/ ${docsRoute}/ 301`,
  `/llms.txt ${docsRoute}/llms.txt 301`,
  `/llms-full.txt ${docsRoute}/llms-full.txt 301`,
  `/llms.mdx/docs/* ${docsRoute}/llms.mdx/:splat 301`,
  `/api-reference.html ${docsRoute}/api-reference.html 301`
]
writeFileSync(join(client, '_redirects'), `${redirects.join('\n')}\n`)

// Built from the pages that exist, on the origin the docs are served from.
const pagePaths = docPagePaths(site, docsRoute)
const sitemapUrl = `${docsSiteUrl}${docsRoute}/sitemap.xml`
writeFileSync(join(site, 'sitemap.xml'), sitemapXml(docsSiteUrl, pagePaths))
writeFileSync(join(client, 'robots.txt'), robotsTxt(sitemapUrl))

console.log(`✓ ${site} holds the site; ${client}/_redirects written`)
console.log(`✓ sitemap.xml (${pagePaths.length} pages) and robots.txt written for ${docsSiteUrl}`)
