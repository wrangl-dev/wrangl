import { useEffect, useState } from 'react';

export type GithubState<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error' };

/**
 * Runs `load` once after mount (never during prerender) and tracks its result.
 * `load` must be a stable module-level function.
 */
export function useGithubData<T>(load: (signal: AbortSignal) => Promise<T>): GithubState<T> {
  const [state, setState] = useState<GithubState<T>>({ status: 'loading' });

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal)
      .then((data) => setState({ status: 'ready', data }))
      .catch(() => {
        if (!ctrl.signal.aborted) setState({ status: 'error' });
      });
    return () => ctrl.abort();
  }, [load]);

  return state;
}
