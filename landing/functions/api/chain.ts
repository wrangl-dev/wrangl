// GET /api/chain: the latest Robinhood Chain block and gas price for the site's ticker.
//
// Reads through the keyed RPCs in the RPC_URLS secret (comma-separated, e.g. Alchemy and
// Chainstack), then the public RPCs. The keys never reach the browser, and this endpoint only
// ever asks for the block number and gas price, so it cannot be used as an open RPC proxy.
// Answers are cached for a couple of seconds, so the provider sees about one call per
// CACHE_SECONDS whatever the traffic.
//
// The owner sets the secret, Claude never handles it:
//   bunx wrangler pages secret put RPC_URLS --project-name=wrangl-landing

import { type ChainSource, PUBLIC_RPC_URLS, readFirst } from '../../src/lib/chain';

export const CACHE_SECONDS = 2;

type Env = { RPC_URLS?: string };
type Ctx = { request: Request; env: Env; waitUntil: (p: Promise<unknown>) => void };

export function keyedUrls(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.startsWith('https://'));
}

export async function chainAnswer(
  env: Env,
  fetcher: typeof fetch,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const keyed = keyedUrls(env.RPC_URLS);
  try {
    const { reading, index } = await readFirst([...keyed, ...PUBLIC_RPC_URLS], fetcher);
    const source: ChainSource =
      index < keyed.length ? 'provider' : index === keyed.length ? 'public' : 'fallback';
    return { status: 200, body: { ...reading, source } };
  } catch {
    // The error could name a keyed node; say nothing about which one failed.
    return { status: 502, body: { error: 'no RPC answered' } };
  }
}

export const onRequestGet = async ({ request, env, waitUntil }: Ctx): Promise<Response> => {
  const cache = (globalThis.caches as unknown as { default: Cache }).default;
  const key = new Request(new URL('/api/chain', request.url).toString());
  const hit = await cache.match(key);
  if (hit) return hit;

  const { status, body } = await chainAnswer(env, (u, i) => fetch(u, i));
  const res = new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': status === 200 ? `public, max-age=${CACHE_SECONDS}` : 'no-store',
    },
  });
  if (status === 200) waitUntil(cache.put(key, res.clone()));
  return res;
};
