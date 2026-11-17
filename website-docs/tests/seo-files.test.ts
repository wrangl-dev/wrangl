import { describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { docPagePaths, robotsTxt, sitemapXml } from '../scripts/seo-files'

describe('seo-files', () => {
  test('lists prerendered pages and skips the llms.mdx copies', () => {
    const site = mkdtempSync(join(tmpdir(), 'docs-seo-'))
    for (const dir of ['', 'getting-started/install', 'llms.mdx/install']) {
      mkdirSync(join(site, dir), { recursive: true })
      writeFileSync(join(site, dir, 'index.html'), '<html></html>')
    }
    writeFileSync(join(site, '404.html'), '<html></html>')

    expect(docPagePaths(site, '/docs')).toEqual(['/docs/', '/docs/getting-started/install/'])
  })

  test('sitemap and robots.txt use the given origin', () => {
    expect(sitemapXml('https://example.pages.dev', ['/docs/'])).toContain(
      '<loc>https://example.pages.dev/docs/</loc>'
    )
    expect(robotsTxt('https://example.pages.dev/docs/sitemap.xml')).toContain(
      'Sitemap: https://example.pages.dev/docs/sitemap.xml'
    )
  })
})
