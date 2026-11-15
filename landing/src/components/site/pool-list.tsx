import type { PoolsState } from '../../lib/use-new-pools';

type PoolListProps = {
  state: PoolsState;
  /** Label of the first column in the header row. */
  heading: string;
  ariaLive?: boolean;
};

export function PoolList({ state, heading, ariaLive }: PoolListProps) {
  return (
    <div className="pools" id="pools" aria-live={ariaLive ? 'polite' : undefined}>
      {state.status === 'loading' && (
        <div className="pool">
          <span className="n">Loading the newest pools…</span>
          <span className="l"></span>
          <span className="a"></span>
        </div>
      )}
      {state.status === 'ready' && (
        <>
          <div className="pool" style={{ color: 'var(--dim)' }}>
            <span>{heading}</span>
            <span className="l">liquidity</span>
            <span className="a">age</span>
          </div>
          {state.rows.map((row, i) => (
            <div className="pool" key={`${row.name}-${i}`}>
              <span className="n">{row.name}</span>
              <span className="l">{row.liquidity}</span>
              <span className="a">{row.age}</span>
            </div>
          ))}
        </>
      )}
      {state.status === 'fallback' && (
        <div className="pool">
          <span className="n" style={{ color: 'var(--dim)' }}>Live pools load in the app.</span>
          <span className="l"></span>
          <span className="a"></span>
        </div>
      )}
    </div>
  );
}
