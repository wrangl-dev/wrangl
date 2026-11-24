import { call } from './ipc';

/** Mirrors `Holding` in `src-tauri/src/chain/portfolio.rs`. `address` is null for ETH. */
export interface Holding {
  address: string | null;
  symbol: string;
  name: string;
  amount: string;
  priceUsd: number | null;
  valueUsd: number | null;
  change24h: number | null;
}

export interface Portfolio {
  address: string;
  holdings: Holding[];
  totalUsd: number;
  change24hUsd: number;
  tokensChecked: number;
  rpc: string;
}

export interface WatchItem {
  address: string;
  symbol: string;
  name: string;
  decimals: number | null;
  addedAt: number;
  alertAbove: number | null;
  alertBelow: number | null;
}

export interface Market {
  address: string;
  symbol: string | null;
  name: string | null;
  priceUsd: number | null;
  change24h: number | null;
  fdvUsd: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
}

export interface Watchlist {
  items: WatchItem[];
  markets: Market[];
  /** Why prices are missing (a rate limit, an outage), when they are. */
  marketError?: string | null;
}

export interface PortfolioApi {
  portfolio: () => Promise<Portfolio>;
  watchlist: () => Promise<Watchlist>;
  watch: (address: string) => Promise<WatchItem[]>;
  unwatch: (address: string) => Promise<WatchItem[]>;
  setAlerts: (address: string, above: number | null, below: number | null) => Promise<WatchItem[]>;
}

export const portfolioApi: PortfolioApi = {
  portfolio: () => call<Portfolio>('portfolio_get'),
  watchlist: () => call<Watchlist>('watchlist_get'),
  watch: (address) => call<WatchItem[]>('watchlist_add', { address }),
  unwatch: (address) => call<WatchItem[]>('watchlist_remove', { address }),
  setAlerts: (address, above, below) =>
    call<WatchItem[]>('watchlist_alerts', { address, above, below }),
};

/** A watched token whose price reached one of its alerts. */
export interface AlertHit {
  item: WatchItem;
  price: number;
  side: 'above' | 'below';
}

/** Alerts the current prices trigger. */
export function alertHits(items: WatchItem[], markets: Market[]): AlertHit[] {
  const price = new Map(markets.map((m) => [m.address, m.priceUsd]));
  return items.flatMap((item): AlertHit[] => {
    const p = price.get(item.address);
    if (p == null) return [];
    if (item.alertAbove != null && p >= item.alertAbove) return [{ item, price: p, side: 'above' }];
    if (item.alertBelow != null && p <= item.alertBelow) return [{ item, price: p, side: 'below' }];
    return [];
  });
}

/** `$1,234.56`, with more digits for small prices (`$0.000123`). */
export function formatUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '–';
  const abs = Math.abs(n);
  // Three significant digits below a dollar: $0.123, $0.000123.
  const digits = abs === 0 || abs >= 1 ? 2 : Math.min(10, 2 - Math.floor(Math.log10(abs)));
  return `${n < 0 ? '−' : ''}$${abs.toLocaleString('en-US', {
    minimumFractionDigits: abs === 0 || abs >= 0.01 ? 2 : 0,
    maximumFractionDigits: digits,
  })}`;
}

/** `$12.3M`, `$4.5K`. */
export function formatCompactUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '–';
  return `$${n.toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 1 })}`;
}

/** `+1.23%`, `−4.00%`. */
export function formatPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '–';
  return `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(2)}%`;
}

/** A token amount trimmed to a readable length: `1,408.33`, `0.00000105`. */
export function formatAmount(amount: string): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return amount;
  if (n !== 0 && Math.abs(n) < 0.0001) return n.toPrecision(3);
  return n.toLocaleString('en-US', { maximumFractionDigits: n >= 1 ? 4 : 8 });
}
