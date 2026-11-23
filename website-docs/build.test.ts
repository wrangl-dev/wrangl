import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { brokenLinks, headersFile, NAV, parsePage, renderMarkdown, slugify } from './build';

const navSlugs = NAV.flatMap((g) => g.pages);

function contentSlugs(dir = 'content', prefix = ''): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return contentSlugs(path, `${prefix}${name}/`);
    if (!name.endsWith('.md')) return [];
    const base = name.slice(0, -3);
    return [base === 'index' ? prefix.replace(/\/$/, '') : `${prefix}${base}`];
  });
}

describe('pages', () => {
  test('every page in content/ is in the sidebar, once', () => {
    expect([...navSlugs].sort()).toEqual(contentSlugs().sort());
    expect(new Set(navSlugs).size).toBe(navSlugs.length);
  });

  test('every docs page the landing links to exists', () => {
    const files = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) ? [path] : [];
      });
    const source = files('../landing/src')
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n');
    const linked = [
      ...[...source.matchAll(/\$\{DOCS_URL\}([a-z0-9/-]*)/g)].map((m) => m[1]),
      ...[...source.matchAll(/docs\('([a-z0-9/-]*)'\)/g)].map((m) => m[1]),
    ].map((s) => s.replace(/\/$/, ''));
    expect(linked.length).toBeGreaterThan(4);
    for (const slug of linked) expect(navSlugs).toContain(slug);
  });

  test('front matter needs a title and a description', () => {
    expect(parsePage('x', '---\ntitle: T\ndescription: D\n---\nbody')).toMatchObject({
      title: 'T',
      body: 'body',
    });
    expect(() => parsePage('x', '---\ntitle: T\n---\nbody')).toThrow('needs title and description');
    expect(() => parsePage('x', 'no front matter')).toThrow('missing front matter');
  });
});

describe('rendering', () => {
  test('headings below h1 get linkable ids', () => {
    expect(renderMarkdown('## Get a quote')).toContain(
      '<h2 id="get-a-quote"><a class="anchor" href="#get-a-quote">',
    );
    expect(slugify('Wallet <code>x</code> & swaps')).toBe('wallet-x-swaps');
  });

  test('broken internal links are found, files and anchors are not', () => {
    const html =
      '<a href="/docs/wallet#x"></a><a href="/docs/nope"></a><a href="/docs/style.css"></a><a href="/docs/"></a>';
    expect(brokenLinks(html, new Set(['', 'wallet']))).toEqual(['/docs/nope']);
  });

  test('pages ship no script', () => {
    expect(headersFile()).toContain("default-src 'none'");
    expect(headersFile()).not.toContain('script-src');
  });
});
