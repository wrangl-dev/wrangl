import { readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/**
 * URL path of every prerendered page under `siteDir`, served as `${base}/...`.
 * Skips the llms.mdx copies, which are Markdown for agents, not pages.
 */
export function docPagePaths(siteDir: string, base: string, dir = siteDir): string[] {
  const paths: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (dir === siteDir && entry === 'llms.mdx') continue
      paths.push(...docPagePaths(siteDir, base, full))
    } else if (entry === 'index.html') {
      const rel = relative(siteDir, dir).split(sep).filter(Boolean).join('/')
      paths.push(rel ? `${base}/${rel}/` : `${base}/`)
    }
  }
  return paths.sort()
}

export function sitemapXml(site: string, paths: string[]): string {
  const urls = paths.map((p) => `  <url><loc>${site}${p}</loc></url>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
}

export function robotsTxt(sitemapUrl: string): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${sitemapUrl}\n`
}
