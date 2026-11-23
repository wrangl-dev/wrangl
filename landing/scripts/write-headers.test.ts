import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { contentSecurityPolicy, headersFile, inlineScriptHashes } from './write-headers';

const sha = (s: string) => `'sha256-${createHash('sha256').update(s).digest('base64')}'`;

describe('write-headers', () => {
  test('hashes inline scripts only, once each', () => {
    const html = `
      <script src="/app.js"></script>
      <script type="module">console.log(1)</script>
      <script>console.log(1)</script>
      <script>  </script>`;
    expect(inlineScriptHashes(html)).toEqual([sha('console.log(1)')]);
  });

  test('the policy allows the hashes and the chain hosts, nothing inline otherwise', () => {
    const csp = contentSecurityPolicy([sha('x')]);
    expect(csp).toContain(`script-src 'self' ${sha('x')}`);
    expect(csp).toContain('https://api.geckoterminal.com');
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  test('the file applies to every path', () => {
    expect(headersFile([]).startsWith('/*\n  Content-Security-Policy: ')).toBe(true);
  });
});
