import { useEffect, useState } from 'react';

import { CHAIN_POLL_MS, fetchChainReading } from './chain';

export type ChainStatus = {
  block: number | null;
  gas: number | null;
  /** Last request succeeded (green dot). */
  live: boolean;
  /** Last request failed and no block was ever seen. */
  unreachable: boolean;
};

const INITIAL: ChainStatus = { block: null, gas: null, live: false, unreachable: false };

/**
 * Polls the public Robinhood Chain RPC every 3s while `enabled`.
 * `onNewBlock` gets how many blocks the chain advanced (capped at 4).
 */
export function useChainStatus(
  enabled: boolean,
  onNewBlock?: (grew: number) => void,
): ChainStatus {
  const [status, setStatus] = useState<ChainStatus>(INITIAL);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let last = 0;
    const ctrl = new AbortController();

    const tick = async () => {
      try {
        const { blockNumber: n, gwei: g } = await fetchChainReading(ctrl.signal);
        if (cancelled) return;
        const changed = Boolean(n) && n !== last;
        if (changed) {
          const grew = last ? n - last : 1;
          last = n;
          onNewBlock?.(Math.min(grew, 4));
        }
        setStatus((s) => ({
          block: changed ? n : s.block,
          gas: Number.isFinite(g) ? g : s.gas,
          live: true,
          unreachable: false,
        }));
      } catch {
        if (cancelled) return;
        setStatus((s) => ({ ...s, live: false, unreachable: !last }));
      }
    };

    void tick();
    const id = window.setInterval(tick, CHAIN_POLL_MS);
    return () => {
      cancelled = true;
      ctrl.abort();
      window.clearInterval(id);
    };
  }, [enabled, onNewBlock]);

  return status;
}
