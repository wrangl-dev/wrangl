import { useCallback, useEffect, useState } from 'react';
import { type AlertHit, alertHits, formatUsd, type PortfolioApi, portfolioApi } from './portfolio';

/** How often the watchlist's prices are checked against its alerts. */
export const ALERT_POLL_MS = 60_000;

export interface AlertNotice {
  id: string;
  text: string;
}

export function alertText(hit: AlertHit): string {
  const limit = hit.side === 'above' ? hit.item.alertAbove : hit.item.alertBelow;
  return `${hit.item.symbol} is at ${formatUsd(hit.price)}, ${hit.side} your alert of ${formatUsd(limit)}.`;
}

function notifySystem(text: string) {
  try {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'granted')
      new Notification('Wrangl price alert', { body: text });
  } catch {
    // No system notifications here; the in-app notice is enough.
  }
}

/**
 * Checks the watchlist's alerts every minute while the app runs. A hit becomes a notice (and a
 * system notification when allowed), and that alert is cleared so it fires once.
 */
export function useWatchAlerts(api: PortfolioApi = portfolioApi, pollMs = ALERT_POLL_MS) {
  const [notices, setNotices] = useState<AlertNotice[]>([]);

  useEffect(() => {
    let live = true;
    const check = async () => {
      try {
        const { items, markets } = await api.watchlist();
        if (!items.some((i) => i.alertAbove != null || i.alertBelow != null)) return;
        for (const hit of alertHits(items, markets)) {
          if (!live) return;
          const text = alertText(hit);
          setNotices((n) => [...n, { id: `${hit.item.address}:${Date.now()}`, text }]);
          notifySystem(text);
          await api.setAlerts(
            hit.item.address,
            hit.side === 'above' ? null : hit.item.alertAbove,
            hit.side === 'below' ? null : hit.item.alertBelow,
          );
        }
      } catch {
        // No backend or no network this minute; try again next time.
      }
    };
    void check();
    const timer = setInterval(check, pollMs);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [api, pollMs]);

  const dismiss = useCallback((id: string) => setNotices((n) => n.filter((x) => x.id !== id)), []);
  return { notices, dismiss };
}
