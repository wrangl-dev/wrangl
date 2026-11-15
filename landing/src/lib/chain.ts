export const RPC_URL = 'https://rpc.mainnet.chain.robinhood.com';
export const NEW_POOLS_URL =
  'https://api.geckoterminal.com/api/v2/networks/robinhood/new_pools?page=1';
export const CHAIN_POLL_MS = 3000;

export type ChainReading = { blockNumber: number; gwei: number };

/** One batched JSON-RPC call: latest block and gas price. Values can be NaN. */
export async function fetchChainReading(signal?: AbortSignal): Promise<ChainReading> {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify([
      { jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] },
      { jsonrpc: '2.0', id: 2, method: 'eth_gasPrice', params: [] },
    ]),
    signal,
  });
  const out = (await res.json()) as { id: number; result?: string }[];
  const byId = Object.fromEntries(out.map((r) => [r.id, r.result]));
  return {
    blockNumber: parseInt(byId[1] ?? '', 16),
    gwei: parseInt(byId[2] ?? '', 16) / 1e9,
  };
}

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
