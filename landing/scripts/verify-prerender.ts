#!/usr/bin/env bun

/**
 * Post-build check: every route must ship real prerendered HTML (copy, title, canonical),
 * the 404 must be dist/404.html, and nothing may load a script from a CDN.
 */

import fs from 'node:fs';

const lastUpdated = /Last updated:(?:<!-- -->| )*[A-Z][a-z]+ \d{1,2}, \d{4}/;

const checksByFile: Record<string, (string | RegExp)[]> = {
  'dist/index.html': [
    '<title>Wrangl — the agent terminal for Robinhood Chain</title>',
    'Wrangle every agent.',
    'Trade Robinhood Chain.',
    'One line. Or the installer.',
    'Check a token before you buy',
    'href="/features/"',
    'href="/install/"',
    'rel="canonical" href="https://wrangl.dev/"',
  ],
  'dist/features/index.html': [
    '<title>Features — Wrangl</title>',
    'Everything Wrangl does.',
    '44 agents. One window.',
    'Eight tools. Six read, two ask you.',
    'Claude Agent',
    'rel="canonical" href="https://wrangl.dev/features/"',
  ],
  'dist/install/index.html': [
    '<title>Install — Wrangl</title>',
    'Install Wrangl.',
    'Sign in to an agent',
    'Robinhood Chain RPC',
    'rel="canonical" href="https://wrangl.dev/install/"',
  ],
  'dist/changelog/index.html': [
    '<title>Changelog — Wrangl</title>',
    'What changed, day by day.',
    'Loading changes from GitHub',
    'rel="canonical" href="https://wrangl.dev/changelog/"',
  ],
  'dist/privacy/index.html': [
    '<title>Privacy — Wrangl</title>',
    '>Privacy</h1>',
    lastUpdated,
    'no analytics',
    'https://wrangl.dev/privacy/',
  ],
  'dist/terms/index.html': [
    '<title>Terms — Wrangl</title>',
    '>Terms</h1>',
    lastUpdated,
    'MIT License',
    'https://wrangl.dev/terms/',
  ],
  'dist/404.html': ['Page not found'],
};

const missing: string[] = [];

for (const [file, checks] of Object.entries(checksByFile)) {
  const html = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  for (const s of checks) {
    if (s instanceof RegExp ? !s.test(html) : !html.includes(s)) missing.push(`${file}: ${s}`);
  }
  if (html.includes('cdn.jsdelivr.net')) missing.push(`${file}: must not load anything from a CDN`);
}

if (fs.existsSync('dist/404/index.html')) {
  missing.push('dist/404/index.html must not exist (would serve /404 as 200)');
}
if (fs.existsSync('dist/_redirects')) {
  missing.push('dist/_redirects must not exist (SPA catch-all would turn 404s into soft 404s)');
}

if (missing.length) {
  console.error('Prerender check failed:', missing.join(', '));
  process.exit(1);
}
console.log('Prerender check passed.');
