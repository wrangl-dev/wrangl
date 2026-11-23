#!/usr/bin/env bun
// Builds the Wrangl docs: Markdown in content/ becomes static HTML in dist/docs/.
// No JavaScript ships to the reader; every page is plain HTML and one stylesheet.

import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Marked, type Tokens } from 'marked';

export const SITE = 'https://wrangl-docs.pages.dev';
export const BASE = '/docs/';
const LANDING = 'https://wrangl-landing.pages.dev';
const REPO = 'https://github.com/wrangl-dev/wrangl';

/** Sidebar order. Every page in content/ must appear here exactly once. */
export const NAV: { title: string; pages: string[] }[] = [
  {
    title: 'Start',
    pages: ['', 'getting-started/install', 'projects-and-chat', 'agent-setup/install-agents'],
  },
  { title: 'Robinhood Chain', pages: ['robinhood-chain', 'settings', 'wallet', 'swaps'] },
  { title: 'Help', pages: ['troubleshooting', 'troubleshooting/report-a-problem', 'changelog'] },
];

export type Page = {
  slug: string;
  title: string;
  description: string;
  body: string;
  file?: string;
};

/** Splits the `---` front matter (title, description) from the Markdown body. */
export function parsePage(slug: string, source: string): Page {
  const match = source.replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error(`${slug || 'index'}: missing front matter`);
  const meta: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  if (!meta.title || !meta.description)
    throw new Error(`${slug || 'index'}: needs title and description`);
  return { slug, title: meta.title, description: meta.description, body: match[2] };
}

export const slugify = (text: string) =>
  text
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const markdown = new Marked({
  gfm: true,
  renderer: {
    heading({ tokens, depth }: Tokens.Heading) {
      const inner = this.parser.parseInline(tokens);
      if (depth === 1) return `<h1>${inner}</h1>\n`;
      const id = slugify(inner);
      return `<h${depth} id="${id}"><a class="anchor" href="#${id}">${inner}</a></h${depth}>\n`;
    },
    link({ href, title, tokens }: Tokens.Link) {
      const inner = this.parser.parseInline(tokens);
      const external = /^https?:\/\//.test(href);
      const t = title ? ` title="${escapeHtml(title)}"` : '';
      const rel = external ? ' rel="noopener"' : '';
      return `<a href="${escapeHtml(href)}"${t}${rel}>${inner}</a>`;
    },
  },
});

export function renderMarkdown(body: string): string {
  return markdown.parse(body, { async: false }) as string;
}

export const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const pageUrl = (slug: string) => (slug ? `${BASE}${slug}` : BASE);

/** Internal `/docs/…` links in rendered HTML that point at no page. */
export function brokenLinks(html: string, slugs: Set<string>): string[] {
  const broken: string[] = [];
  for (const [, href] of html.matchAll(/href="(\/docs\/[^"#]*)/g)) {
    const slug = href.slice(BASE.length).replace(/\/$/, '');
    if (/\.[a-z]+$/.test(slug)) continue; // a file (stylesheet, icon), not a page
    if (!slugs.has(slug)) broken.push(href);
  }
  return broken;
}

function layout(page: Page, content: string, pages: Map<string, Page>): string {
  const order = NAV.flatMap((g) => g.pages);
  const at = order.indexOf(page.slug);
  const prev = at > 0 ? pages.get(order[at - 1]) : undefined;
  const next = at < order.length - 1 ? pages.get(order[at + 1]) : undefined;
  const nav = NAV.map(
    (g) =>
      `<p class="group">${g.title}</p><ul>${g.pages
        .map((s) => {
          const p = pages.get(s);
          const current = s === page.slug ? ' aria-current="page"' : '';
          return `<li><a href="${pageUrl(s)}"${current}>${escapeHtml(p?.title ?? s)}</a></li>`;
        })
        .join('')}</ul>`,
  ).join('');
  const pager = [
    prev
      ? `<a class="prev" href="${pageUrl(prev.slug)}"><small>Previous</small>${escapeHtml(prev.title)}</a>`
      : '<span></span>',
    next
      ? `<a class="next" href="${pageUrl(next.slug)}"><small>Next</small>${escapeHtml(next.title)}</a>`
      : '<span></span>',
  ].join('');
  const title = page.slug ? `${page.title} · Wrangl docs` : 'Wrangl docs';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(page.description)}">
<link rel="canonical" href="${SITE}${pageUrl(page.slug)}">
<link rel="icon" href="${BASE}favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="${BASE}style.css">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(page.description)}">
<meta property="og:image" content="${LANDING}/og-image.png">
</head>
<body>
<header class="top">
  <a class="brand" href="${BASE}"><img src="${BASE}favicon.svg" alt="" width="22" height="22"> Wrangl <span>docs</span></a>
  <nav aria-label="Site"><a href="${LANDING}/">Home</a><a href="${LANDING}/install/">Download</a><a href="${REPO}" rel="noopener">GitHub</a></nav>
</header>
<div class="frame">
  <nav class="side" aria-label="Docs">${nav}</nav>
  <main>
    <article>
${content}
    </article>
    <nav class="pager" aria-label="Pages">${pager}</nav>
    ${page.file ? `<p class="edit"><a href="${REPO}/edit/main/website-docs/${page.file}" rel="noopener">Edit this page on GitHub</a></p>` : ''}
  </main>
</div>
<footer>Wrangl is free and open source (MIT). <a href="${REPO}" rel="noopener">${REPO.replace('https://', '')}</a></footer>
</body>
</html>
`;
}

function sourcePath(slug: string): string {
  const file = join('content', `${slug || 'index'}.md`);
  return existsSync(file) ? file : join('content', slug, 'index.md');
}

const CSP = [
  "default-src 'none'",
  "style-src 'self'",
  "img-src 'self' https://wrangl-landing.pages.dev",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

export function headersFile(): string {
  return `/*
  Content-Security-Policy: ${CSP}
  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=(), usb=(), payment=()
  Cross-Origin-Opener-Policy: same-origin
`;
}

export function build(out = 'dist') {
  const slugs = NAV.flatMap((g) => g.pages);
  const pages = new Map(
    slugs.map((s) => {
      const file = sourcePath(s);
      return [s, { ...parsePage(s, readFileSync(file, 'utf8')), file: file.split('\\').join('/') }];
    }),
  );
  const slugSet = new Set(slugs);
  rmSync(out, { recursive: true, force: true });
  const problems: string[] = [];
  for (const page of pages.values()) {
    const html = layout(page, renderMarkdown(page.body), pages);
    for (const href of brokenLinks(html, slugSet))
      problems.push(`${page.slug || 'index'}: broken link ${href}`);
    const file = join(out, 'docs', page.slug, 'index.html');
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, html);
  }
  if (problems.length) throw new Error(problems.join('\n'));

  copyFileSync('style.css', join(out, 'docs', 'style.css'));
  copyFileSync('favicon.svg', join(out, 'docs', 'favicon.svg'));
  const notFound = parsePage(
    '404',
    '---\ntitle: Page not found\ndescription: This page does not exist.\n---\n',
  );
  writeFileSync(
    join(out, '404.html'),
    layout(
      notFound,
      `<h1>Page not found</h1>\n<p>That page is not in the docs. Try the <a href="${BASE}">start page</a>.</p>`,
      pages,
    ),
  );
  writeFileSync(join(out, '_redirects'), '/ /docs/ 301\n');
  writeFileSync(join(out, '_headers'), headersFile());
  writeFileSync(join(out, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);
  writeFileSync(
    join(out, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${slugs
      .map((s) => `  <url><loc>${SITE}${pageUrl(s)}</loc></url>`)
      .join('\n')}\n</urlset>\n`,
  );
  return pages.size;
}

if (import.meta.main) {
  console.log(`built ${build()} pages into dist/docs`);
}
