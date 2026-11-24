#!/usr/bin/env bun
// Writes dist/_headers for Cloudflare Pages: security headers, and a Content-Security-Policy
// that allows exactly the inline scripts the prerender put into the built pages.

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';

/** Hosts the page talks to: the chain ticker (RPC and its fallbacks) and the newest pools. */
const CONNECT = [
  'https://rpc.mainnet.chain.robinhood.com',
  'https://robinhood-rpc.publicnode.com',
  'https://robinhood.drpc.org',
  'https://api.geckoterminal.com',
];

/** `'sha256-…'` for every inline `<script>` (no `src`) in `html`. */
export function inlineScriptHashes(html: string): string[] {
  const hashes = new Set<string>();
  for (const match of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    const body = match[1];
    if (!body.trim()) continue;
    hashes.add(`'sha256-${createHash('sha256').update(body).digest('base64')}'`);
  }
  return [...hashes].sort();
}

export function contentSecurityPolicy(scriptHashes: string[]): string {
  return [
    "default-src 'self'",
    ["script-src 'self'", ...scriptHashes].join(' '),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    ["connect-src 'self'", ...CONNECT].join(' '),
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
}

export function headersFile(scriptHashes: string[]): string {
  const lines = [
    '/*',
    `  Content-Security-Policy: ${contentSecurityPolicy(scriptHashes)}`,
    '  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload',
    '  X-Frame-Options: DENY',
    '  X-Content-Type-Options: nosniff',
    '  Referrer-Policy: no-referrer',
    '  Permissions-Policy: camera=(), microphone=(), geolocation=(), usb=(), payment=(), display-capture=()',
    '  Cross-Origin-Opener-Policy: same-origin',
    '  Cross-Origin-Resource-Policy: same-origin',
  ];
  return `${lines.join('\n')}\n`;
}

function htmlFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return htmlFiles(path);
    return name.endsWith('.html') ? [path] : [];
  });
}

if (import.meta.main) {
  const hashes = [
    ...new Set(htmlFiles(DIST).flatMap((f) => inlineScriptHashes(readFileSync(f, 'utf8')))),
  ].sort();
  writeFileSync(join(DIST, '_headers'), headersFile(hashes));
  console.log(`_headers written (${hashes.length} inline script hashes)`);
}
