import { useEffect, useState } from 'react';

import { fetchNewPools, type PoolRow } from './chain';

export type PoolsState =
  | { status: 'loading' }
  | { status: 'ready'; rows: PoolRow[] }
  | { status: 'fallback' };

/** Fetches the newest GeckoTerminal pools once, when `enabled` first turns true. */
export function useNewPools(enabled: boolean): PoolsState {
  const [state, setState] = useState<PoolsState>({ status: 'loading' });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const ctrl = new AbortController();
    fetchNewPools(ctrl.signal)
      .then((rows) => {
        if (!cancelled) setState({ status: 'ready', rows });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'fallback' });
      });
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [enabled]);

  return state;
}
