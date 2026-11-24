import { formatBlock, formatGas } from '../../lib/chain';
import { emitNewBlocks } from '../../lib/chain-feed';
import { useChainStatus } from '../../lib/use-chain-status';

const SOURCE_LABEL = {
  provider: 'live',
  public: 'public RPC',
  fallback: 'public fallback RPC',
} as const;

export function ChainTicker() {
  const { block, gas, live, unreachable, source } = useChainStatus(true, emitNewBlocks);

  const blockText = block !== null ? formatBlock(block) : unreachable ? 'offline' : '…';
  const gasText = gas !== null ? formatGas(gas) : unreachable ? '–' : '…';

  return (
    <div className="ticker" aria-label="Robinhood Chain, live">
      <div className="wrap">
        <span>
          <span className={live ? 'live-dot on' : 'live-dot'} id="dot"></span>Robinhood Chain
        </span>
        <span className="sep">/</span>
        <span>
          block{' '}
          <b key={block ?? 'none'} className={block !== null ? 'flash' : undefined} id="blk">
            {blockText}
          </b>
        </span>
        <span className="sep">/</span>
        <span>
          gas <b id="gas">{gasText}</b> gwei
        </span>
        <span className="sep">/</span>
        <span>
          chain id <b>4663</b>
        </span>
        <span className="sep">/</span>
        <span id="src">
          {unreachable ? 'RPC unreachable from this network' : SOURCE_LABEL[source ?? 'public']}
        </span>
      </div>
    </div>
  );
}
