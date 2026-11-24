import { describe, expect, test } from 'bun:test';
import { FALLBACK_RPC_URLS, RPC_URL } from '../../src/lib/chain';
import { chainAnswer, keyedUrls } from './chain';

const KEYED = 'https://robinhood-mainnet.example/v2/SECRET';

const answer = (block: number) =>
  new Response(
    JSON.stringify([
      { jsonrpc: '2.0', id: 1, result: `0x${block.toString(16)}` },
      { jsonrpc: '2.0', id: 2, result: '0x3b9aca00' },
    ]),
  );

const fetcherAnswering = (ok: string[]) => {
  const asked: { url: string; body: string }[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    asked.push({ url, body: String(init.body) });
    if (!ok.includes(url)) throw new TypeError('Failed to fetch');
    return answer(42);
  }) as unknown as typeof fetch;
  return { fetcher, asked };
};

describe('/api/chain', () => {
  test('reads through the keyed RPC first and never returns its URL', async () => {
    const { fetcher, asked } = fetcherAnswering([KEYED]);
    const { status, body } = await chainAnswer({ RPC_URLS: KEYED }, fetcher);
    expect(status).toBe(200);
    expect(body).toEqual({ blockNumber: 42, gwei: 1, source: 'provider' });
    expect(JSON.stringify(body)).not.toContain('SECRET');
    expect(asked.map((a) => a.url)).toEqual([KEYED]);
  });

  test('only ever asks for the block number and gas price', async () => {
    const { fetcher, asked } = fetcherAnswering([KEYED]);
    await chainAnswer({ RPC_URLS: KEYED }, fetcher);
    const methods = JSON.parse(asked[0].body).map((c: { method: string }) => c.method);
    expect(methods).toEqual(['eth_blockNumber', 'eth_gasPrice']);
  });

  test('falls back to the public RPCs when the provider fails or none is set', async () => {
    const official = fetcherAnswering([RPC_URL]);
    expect((await chainAnswer({ RPC_URLS: KEYED }, official.fetcher)).body.source).toBe('public');
    const fallback = fetcherAnswering([FALLBACK_RPC_URLS[1]]);
    expect((await chainAnswer({}, fallback.fetcher)).body.source).toBe('fallback');
  });

  test('when nothing answers, the error names no node', async () => {
    const { fetcher } = fetcherAnswering([]);
    const { status, body } = await chainAnswer({ RPC_URLS: KEYED }, fetcher);
    expect(status).toBe(502);
    expect(JSON.stringify(body)).not.toContain('example');
  });

  test('the secret may list several providers; anything not https is ignored', () => {
    expect(keyedUrls(' https://a/1 , http://b , https://c/2,')).toEqual([
      'https://a/1',
      'https://c/2',
    ]);
    expect(keyedUrls(undefined)).toEqual([]);
  });
});
