import { describe, expect, test } from 'bun:test';
import { CHAIN_API, FALLBACK_RPC_URLS, RPC_URL, readFirst } from './chain';

const answer = (block: number) =>
  new Response(
    JSON.stringify([
      { jsonrpc: '2.0', id: 1, result: `0x${block.toString(16)}` },
      { jsonrpc: '2.0', id: 2, result: '0x3b9aca00' },
    ]),
  );

const failing = () => {
  throw new TypeError('Failed to fetch');
};

describe('readFirst', () => {
  test('skips an RPC that is blocked and reports which one answered', async () => {
    const asked: string[] = [];
    const fetcher = (async (url: string) => {
      asked.push(url);
      return url === RPC_URL ? failing() : answer(100);
    }) as unknown as typeof fetch;
    const { reading, index } = await readFirst([RPC_URL, ...FALLBACK_RPC_URLS], fetcher);
    expect(reading).toEqual({ blockNumber: 100, gwei: 1 });
    expect(index).toBe(1);
    expect(asked).toEqual([RPC_URL, FALLBACK_RPC_URLS[0]]);
  });

  test('a reply without a block number counts as a failure', async () => {
    const fetcher = (async (url: string) =>
      url === FALLBACK_RPC_URLS[1]
        ? answer(7)
        : new Response(JSON.stringify([{ id: 1, error: {} }]))) as unknown as typeof fetch;
    expect((await readFirst([RPC_URL, ...FALLBACK_RPC_URLS], fetcher)).index).toBe(2);
  });

  test('fails when no RPC answers', async () => {
    const fetcher = (async () => failing()) as unknown as typeof fetch;
    expect(readFirst([RPC_URL], fetcher)).rejects.toThrow('Failed to fetch');
  });
});

describe('fetchChainReading', () => {
  test('uses the backend, then reads directly once the backend is missing', async () => {
    // Fresh module state for this test.
    const { fetchChainReading } = await import(`./chain?backend=${Date.now()}`);
    let backendUp = true;
    const asked: string[] = [];
    const fetcher = (async (url: string) => {
      asked.push(url);
      if (url === CHAIN_API) {
        return backendUp
          ? new Response(JSON.stringify({ blockNumber: 9, gwei: 1, source: 'provider' }))
          : new Response('not found', { status: 404 });
      }
      return answer(10);
    }) as unknown as typeof fetch;

    expect(await fetchChainReading(undefined, fetcher)).toEqual({
      blockNumber: 9,
      gwei: 1,
      source: 'provider',
    });
    backendUp = false;
    expect((await fetchChainReading(undefined, fetcher)).source).toBe('public');
    asked.length = 0;
    await fetchChainReading(undefined, fetcher);
    expect(asked).toEqual([RPC_URL]);
  });
});
