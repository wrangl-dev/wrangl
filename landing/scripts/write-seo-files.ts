#!/usr/bin/env bun

/**
 * Post-build robots.txt and sitemap.xml writer.
 *
 * Both are built from SITE_URL and the prerendered pages in dist/, so they can
 * never point at a domain the site is not served from or list a page that does
 * not exist. Pages marked noindex (the 404) are left out.
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { SITE_URL } from '../src/lib/links';

const BUILD_DIR = 'dist';

/** URL path ("/", "/features/") for every dist/**\/index.html. */
export function pagePaths(dir: string, root = dir): string[] {
  const paths: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) paths.push(...pagePaths(full, root));
    else if (entry === 'index.html') {
      const rel = relative(root, dir).split(sep).filter(Boolean).join('/');
      paths.push(rel ? `/${rel}/` : '/');
    }
  }
  return paths.sort();
}

export function isIndexable(html: string): boolean {
  return !/<meta[^>]+name="robots"[^>]+content="[^"]*noindex/i.test(html);
}

export function sitemapXml(site: string, paths: string[]): string {
  const urls = paths.map((p) => `  <url><loc>${site}${p}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function robotsTxt(site: string): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${site}/sitemap.xml\n`;
}

if (import.meta.main) {
  if (!existsSync(BUILD_DIR)) {
    console.error(`Missing ${BUILD_DIR}/; run the build first.`);
    process.exit(1);
  }
  const paths = pagePaths(BUILD_DIR).filter((p) =>
    isIndexable(readFileSync(join(BUILD_DIR, p, 'index.html'), 'utf8')),
  );
  writeFileSync(join(BUILD_DIR, 'sitemap.xml'), sitemapXml(SITE_URL, paths));
  writeFileSync(join(BUILD_DIR, 'robots.txt'), robotsTxt(SITE_URL));
  console.log(`✓ sitemap.xml (${paths.length} pages) and robots.txt written for ${SITE_URL}`);
}
