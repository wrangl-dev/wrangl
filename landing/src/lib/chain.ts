export const RPC_URL = 'https://rpc.mainnet.chain.robinhood.com';
/** Keyless public RPCs tried after the official one, the same as the app's chain tools. */
export const FALLBACK_RPC_URLS = [
  'https://robinhood-rpc.publicnode.com',
  'https://robinhood.drpc.org',
];
export const PUBLIC_RPC_URLS = [RPC_URL, ...FALLBACK_RPC_URLS];
export const NEW_POOLS_URL =
  'https://api.geckoterminal.com/api/v2/networks/robinhood/new_pools?page=1';
export const CHAIN_POLL_MS = 3000;
/** The site's own backend (functions/api/chain.ts): reads through a keyed RPC when one is set. */
export const CHAIN_API = '/api/chain';

export type ChainReading = { blockNumber: number; gwei: number };
/** Who answered: the site's keyed provider, the official public RPC, or a public fallback. */
export type ChainSource = 'provider' | 'public' | 'fallback';

/** Index in PUBLIC_RPC_URLS of the RPC that answered last; tried first next time. */
let preferred = 0;
/** Off once the backend is missing (local preview) or failing; the page then reads directly. */
let useApi = true;

/**
 * Latest block and gas price. Asks the site's backend first, which keeps any RPC key on the
 * server; without it, reads the public RPCs directly, official one first.
 */
export async function fetchChainReading(
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<ChainReading & { source: ChainSource }> {
  if (useApi) {
    try {
      const res = await fetcher(CHAIN_API, { signal: withTimeout(signal) });
      const body = (await res.json()) as Partial<ChainReading> & { source?: ChainSource };
      if (res.ok && Number.isFinite(body.blockNumber) && body.source) {
        return {
          blockNumber: body.blockNumber as number,
          gwei: Number(body.gwei),
          source: body.source,
        };
      }
      useApi = false;
    } catch (e) {
      if (signal?.aborted) throw e;
      useApi = false;
    }
  }
  const { reading, index } = await readFirst(PUBLIC_RPC_URLS, fetcher, signal, preferred);
  preferred = index;
  return { ...reading, source: index === 0 ? 'public' : 'fallback' };
}

/** Tries `urls` in turn, starting at `start`, and returns the first reading and its index. */
export async function readFirst(
  urls: string[],
  fetcher: typeof fetch,
  signal?: AbortSignal,
  start = 0,
): Promise<{ reading: ChainReading; index: number }> {
  let lastError: unknown = new Error('no RPC given');
  for (let i = 0; i < urls.length; i++) {
    const index = (start + i) % urls.length;
    try {
      return { reading: await readChainFrom(urls[index], fetcher, signal), index };
    } catch (e) {
      if (signal?.aborted) throw e;
      lastError = e;
    }
  }
  throw lastError;
}

/**
 * One batched JSON-RPC call for the latest block and gas price. Errors never contain the URL,
 * which may carry an API key.
 */
export async function readChainFrom(
  url: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<ChainReading> {
  const res = await fetcher(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify([
      { jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] },
      { jsonrpc: '2.0', id: 2, method: 'eth_gasPrice', params: [] },
    ]),
    signal: withTimeout(signal),
  });
  if (!res.ok) throw new Error(`RPC answered HTTP ${res.status}`);
  const out = (await res.json()) as { id: number; result?: string }[];
  if (!Array.isArray(out)) throw new Error('RPC refused the batch');
  const byId = Object.fromEntries(out.map((r) => [r.id, r.result]));
  const blockNumber = parseInt(byId[1] ?? '', 16);
  if (!Number.isFinite(blockNumber)) throw new Error('RPC gave no block number');
  return { blockNumber, gwei: parseInt(byId[2] ?? '', 16) / 1e9 };
}

const withTimeout = (signal?: AbortSignal) =>
  signal ? AbortSignal.any([signal, AbortSignal.timeout(6000)]) : AbortSignal.timeout(6000);

export function formatBlock(n: number): string {
  return '#' + n.toLocaleString('en-US');
}

export function formatGas(g: number): string {
  return g < 0.01 ? g.toFixed(4) : g.toFixed(3);
}

// ---------- newest pools (GeckoTerminal, keyless) ----------

export type PoolAttributes = {
  name?: string;
  reserve_in_usd?: string | number;
  pool_created_at?: string;
};

export type PoolRow = { name: string; liquidity: string; age: string };

export function formatUsd(v: string | number | undefined): string {
  const n = Number(v) || 0;
  return n >= 1e6
    ? `$${(n / 1e6).toFixed(1)}M`
    : n >= 1e3
      ? `$${(n / 1e3).toFixed(1)}k`
      : `$${n.toFixed(0)}`;
}

export function formatAge(iso: string | undefined, now: number = Date.now()): string {
  const s = (now - Date.parse(iso ?? '')) / 1000;
  return s < 3600
    ? `${Math.max(1, Math.round(s / 60))}m`
    : s < 86400
      ? `${Math.round(s / 3600)}h`
      : `${Math.round(s / 86400)}d`;
}

/**
 * Prefer pools with at least $500 liquidity, but only when three or more
 * qualify. Otherwise show the newest pools as they come. Max five rows.
 */
export function pickPools(all: PoolAttributes[], now: number = Date.now()): PoolRow[] {
  const funded = all.filter((a) => Number(a.reserve_in_usd) >= 500);
  const rows = (funded.length >= 3 ? funded : all).slice(0, 5);
  return rows.map((a) => ({
    name: String(a.name),
    liquidity: formatUsd(a.reserve_in_usd),
    age: formatAge(a.pool_created_at, now),
  }));
}

export async function fetchNewPools(signal?: AbortSignal): Promise<PoolRow[]> {
  const res = await fetch(NEW_POOLS_URL, {
    headers: { accept: 'application/json' },
    signal,
  });
  const body = (await res.json()) as { data?: { attributes: PoolAttributes }[] };
  const all = (body.data || []).map((p) => p.attributes);
  const rows = pickPools(all);
  if (!rows.length) throw new Error('empty');
  return rows;
}
