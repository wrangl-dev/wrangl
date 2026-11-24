import { type FormEvent, useCallback, useEffect, useState } from 'react';
import {
  formatAmount,
  formatCompactUsd,
  formatPct,
  formatUsd,
  type Market,
  type Portfolio,
  type PortfolioApi,
  portfolioApi,
  type WatchItem,
  type Watchlist,
} from '../lib/portfolio';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

function Change({ value }: { value: number | null }) {
  if (value == null) return <span className="muted">–</span>;
  return <span className={value >= 0 ? 'up' : 'down'}>{formatPct(value)}</span>;
}

/** One watched token's alert prices, edited in place. */
function AlertEditor({
  item,
  onSave,
}: {
  item: WatchItem;
  onSave: (above: number | null, below: number | null) => Promise<void>;
}) {
  const [above, setAbove] = useState(item.alertAbove?.toString() ?? '');
  const [below, setBelow] = useState(item.alertBelow?.toString() ?? '');
  const parse = (s: string) => (s.trim() ? Number(s) : null);
  const dirty =
    parse(above) !== (item.alertAbove ?? null) || parse(below) !== (item.alertBelow ?? null);
  return (
    <form
      className="alert-editor"
      onSubmit={(e) => {
        e.preventDefault();
        void onSave(parse(above), parse(below));
      }}
    >
      <input
        aria-label={`Alert ${item.symbol} above`}
        placeholder="above $"
        inputMode="decimal"
        value={above}
        onChange={(e) => setAbove(e.target.value)}
      />
      <input
        aria-label={`Alert ${item.symbol} below`}
        placeholder="below $"
        inputMode="decimal"
        value={below}
        onChange={(e) => setBelow(e.target.value)}
      />
      {dirty && <button type="submit">Save</button>}
    </form>
  );
}

/**
 * The connected wallet's holdings on Robinhood Chain, and the tokens the user watches with their
 * price alerts.
 */
export function PortfolioPage({
  onClose,
  onOpenWallet,
  onResearch,
  api = portfolioApi,
}: {
  onClose: () => void;
  onOpenWallet: () => void;
  /** Start a chat that researches this token. */
  onResearch?: (symbol: string, address: string) => void;
  api?: PortfolioApi;
}) {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [portfolioError, setPortfolioError] = useState<string | null>(null);
  const [watchlist, setWatchlist] = useState<Watchlist | null>(null);
  const [watchError, setWatchError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [address, setAddress] = useState('');
  const [adding, setAdding] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [p, w] = await Promise.allSettled([api.portfolio(), api.watchlist()]);
    if (p.status === 'fulfilled') {
      setPortfolio(p.value);
      setPortfolioError(null);
    } else setPortfolioError(errorText(p.reason));
    if (w.status === 'fulfilled') {
      setWatchlist(w.value);
      setWatchError(null);
    } else setWatchError(errorText(w.reason));
    setLoading(false);
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const market = (a: string): Market | undefined => watchlist?.markets.find((m) => m.address === a);

  const watch = async (e: FormEvent) => {
    e.preventDefault();
    const a = address.trim();
    if (!ADDRESS.test(a)) {
      setWatchError('Paste a token contract address: 0x and 40 hex characters.');
      return;
    }
    setAdding(true);
    try {
      await api.watch(a);
      setAddress('');
      await refresh();
    } catch (err) {
      setWatchError(errorText(err));
    } finally {
      setAdding(false);
    }
  };

  const update = async (action: () => Promise<WatchItem[]>) => {
    try {
      const items = await action();
      setWatchlist((w) => (w ? { ...w, items } : { items, markets: [] }));
      setWatchError(null);
    } catch (err) {
      setWatchError(errorText(err));
    }
  };

  const noWallet = portfolioError?.startsWith('connect a wallet');

  return (
    <section className="settings portfolio" aria-label="Portfolio">
      <header className="settings-header">
        <h1>Portfolio</h1>
        <div className="settings-row">
          <button type="button" disabled={loading} onClick={() => void refresh()}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button type="button" className="chat-new" onClick={onClose}>
            Back to chat
          </button>
        </div>
      </header>

      <div className="settings-card">
        {noWallet ? (
          <>
            <h2>No wallet connected</h2>
            <p className="muted">Connect a wallet to see what it holds on Robinhood Chain.</p>
            <button type="button" className="primary" onClick={onOpenWallet}>
              Open Wallet
            </button>
          </>
        ) : portfolioError ? (
          <p className="error">{portfolioError}</p>
        ) : !portfolio ? (
          <p className="muted">Reading balances…</p>
        ) : (
          <>
            <div className="portfolio-total">
              <span className="portfolio-value">{formatUsd(portfolio.totalUsd)}</span>
              <span className={portfolio.change24hUsd >= 0 ? 'up' : 'down'}>
                {portfolio.change24hUsd >= 0 ? '+' : '−'}
                {formatUsd(Math.abs(portfolio.change24hUsd))} today
              </span>
            </div>
            {portfolio.holdings.length === 0 ? (
              <p className="muted">Nothing found in this wallet.</p>
            ) : (
              <table className="data-table" aria-label="Holdings">
                <thead>
                  <tr>
                    <th>Token</th>
                    <th>Amount</th>
                    <th>Price</th>
                    <th>Value</th>
                    <th>24h</th>
                  </tr>
                </thead>
                <tbody>
                  {portfolio.holdings.map((h) => (
                    <tr key={h.address ?? 'eth'}>
                      <td title={h.address ?? 'Native ETH'}>
                        <strong>{h.symbol}</strong>
                        <span className="muted"> {h.name}</span>
                      </td>
                      <td>{formatAmount(h.amount)}</td>
                      <td>{formatUsd(h.priceUsd)}</td>
                      <td>{formatUsd(h.valueUsd)}</td>
                      <td>
                        <Change value={h.change24h} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="muted portfolio-note">
              Checked ETH and {portfolio.tokensChecked} tokens: the chain's most traded plus your
              watchlist. Watch a token below to include it. Prices from GeckoTerminal, balances via
              the {portfolio.rpc}.
            </p>
          </>
        )}
      </div>

      <div className="settings-card">
        <h2>Watchlist</h2>
        <p className="muted">
          Prices refresh every minute while Wrangl is open. An alert fires once when the price
          reaches it.
        </p>
        <form className="settings-row" onSubmit={watch}>
          <input
            aria-label="Token address"
            placeholder="Token address, 0x…"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            autoComplete="off"
            disabled={adding}
          />
          <button type="submit" className="primary" disabled={adding || !address.trim()}>
            {adding ? 'Adding…' : 'Watch'}
          </button>
        </form>
        {watchError && <p className="error">{watchError}</p>}
        {watchlist?.marketError && (
          <p className="muted" role="status">
            Prices are unavailable right now ({watchlist.marketError}). They come back on the next
            refresh.
          </p>
        )}
        {watchlist && watchlist.items.length > 0 && (
          <table className="data-table" aria-label="Watched tokens">
            <thead>
              <tr>
                <th>Token</th>
                <th>Price</th>
                <th>24h</th>
                <th>Liquidity</th>
                <th>Alert</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {watchlist.items.map((item) => {
                const m = market(item.address);
                return (
                  <tr key={item.address}>
                    <td title={item.address}>
                      <strong>{item.symbol}</strong>
                      <span className="muted"> {item.name}</span>
                    </td>
                    <td>{formatUsd(m?.priceUsd)}</td>
                    <td>
                      <Change value={m?.change24h ?? null} />
                    </td>
                    <td>{formatCompactUsd(m?.liquidityUsd)}</td>
                    <td>
                      <AlertEditor
                        key={`${item.alertAbove}:${item.alertBelow}`}
                        item={item}
                        onSave={(above, below) =>
                          update(() => api.setAlerts(item.address, above, below))
                        }
                      />
                    </td>
                    <td className="row-buttons">
                      {onResearch && (
                        <button
                          type="button"
                          className="link-button"
                          aria-label={`Research ${item.symbol}`}
                          onClick={() => onResearch(item.symbol, item.address)}
                        >
                          Research
                        </button>
                      )}
                      <button
                        type="button"
                        className="link-button"
                        aria-label={`Stop watching ${item.symbol}`}
                        onClick={() => update(() => api.unwatch(item.address))}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
