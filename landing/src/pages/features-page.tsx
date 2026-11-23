import { Fragment, type KeyboardEvent, useRef, useState } from 'react';
import { PoolList } from '../components/site/pool-list';
import agentData from '../data/acp-agents.json';
import { formatBlock, formatGas } from '../lib/chain';
import { type FeaturesTab, setFeaturesTab, useFeaturesTab } from '../lib/features-tab';
import { DOCS_URL } from '../lib/links';
import { usePageMeta } from '../lib/page-meta';
import { useChainStatus } from '../lib/use-chain-status';
import { useNewPools } from '../lib/use-new-pools';

const coreRows = [
  {
    num: '01 · Agents',
    title: 'Every ACP agent, one picker',
    text: 'Claude, Codex, Gemini CLI and the rest of the public ACP Registry. Wrangl installs the one you pick (npx, uvx or a native build, checked against its checksum) and starts it in your project.',
  },
  {
    num: '02 · Chat',
    title: 'A chat that shows its work',
    text: 'Answers stream in as Markdown. Thoughts, tool calls with their status and the plan appear as the agent works. Stop a turn at any time.',
  },
  {
    num: '03 · Approvals',
    title: 'You say yes first',
    text: 'When an agent wants to run a command or change a file, a card asks you to allow or deny it. Sign-ins that need a terminal open right in the chat.',
  },
  {
    num: '04 · Projects',
    title: 'Projects keep their own chats and terminals',
    text: 'Open a folder as a project. Its chats are listed under it, its terminals start in it, and switching projects never stops an agent or a shell.',
  },
  {
    num: '05 · Terminals',
    title: 'A real terminal, a shortcut away',
    text: 'PowerShell, zsh or bash in tabs under the chat, toggled with Ctrl+`. Hidden terminals keep running.',
  },
];

const moreItems = [
  {
    tag: 'registry',
    title: 'New agents appear by themselves',
    text: 'The agent list comes from the ACP Registry, cached for offline use, so new agents show up without an update.',
  },
  {
    tag: 'settings',
    title: 'Your own RPC',
    text: 'Paste an Alchemy, Chainstack or QuickNode URL in Settings and test it. Only its host is ever shown again.',
  },
  {
    tag: 'fallback',
    title: 'Works where the RPC is blocked',
    text: 'If the official public RPC does not answer, the chain tools switch to keyless public fallbacks by themselves.',
  },
  {
    tag: 'updates',
    title: 'Signed updates',
    text: 'The app checks for a newer signed release and installs it from the status bar.',
  },
  {
    tag: 'local',
    title: 'Runs on your machine',
    text: 'Agents, terminals and the tool server run locally. Nothing goes through a Wrangl server.',
  },
  {
    tag: 'platforms',
    title: 'macOS, Windows, Linux',
    text: 'Native builds from one Tauri 2 codebase.',
  },
];

const tools = [
  {
    name: 'chain_status',
    mode: 'read',
    text: 'Chain id, latest block, gas price, and which RPC answered.',
  },
  {
    name: 'chain_token',
    mode: 'read',
    text: 'Name, supply, owner and whether it is renounced, proxy, and mint, pause, upgrade or ownership functions found in the bytecode. Plus price, FDV and top pools.',
  },
  {
    name: 'chain_balance',
    mode: 'read',
    text: 'ETH and token balances of any address. Watch-only.',
  },
  {
    name: 'chain_tx',
    mode: 'read',
    text: 'A transaction and its receipt: status, from, to, value, gas, method.',
  },
  {
    name: 'chain_new_pools',
    mode: 'read',
    text: 'The newest DEX pools with liquidity, 24h volume and buys and sells.',
  },
  {
    name: 'chain_call',
    mode: 'read',
    text: 'A raw read-only contract call for anything the others miss.',
  },
  { name: 'wallet_address', mode: 'read', text: 'The address you connected, or that none is.' },
  {
    name: 'wallet_send_transaction',
    mode: 'asks you',
    text: 'Proposes a transaction and waits until you sign or reject it in your wallet.',
  },
  {
    name: 'swap_quote',
    mode: 'read',
    text: 'Prices a swap across the chain’s DEXes through KyberSwap: amount out, USD value, price impact, route.',
  },
  {
    name: 'swap_tokens',
    mode: 'asks you',
    text: 'Asks you to approve exactly the amount, then to sign the swap. Slippage 0.5% by default, at most 5%.',
  },
];

const guards = [
  {
    lead: 'No keys in Wrangl.',
    text: 'No private key or seed phrase is ever asked for or stored. Only your address.',
  },
  {
    lead: 'Loopback only.',
    text: 'The signing page answers on 127.0.0.1, on a random port, behind a one-time secret.',
  },
  {
    lead: 'Other sites are refused.',
    text: 'Requests from another origin or host name never reach your queue.',
  },
  {
    lead: 'Nothing lingers.',
    text: "When the agent's turn ends or you disconnect, its waiting proposals are rejected.",
  },
];

function AgentList() {
  return (
    <p className="agent-list" id="agent-list" aria-label="Agents available over ACP">
      {agentData.agents.map((a, i) => (
        <Fragment key={a.name}>
          {i > 0 && (
            <>
              {' '}
              <span className="s" aria-hidden="true">
                /
              </span>
            </>
          )}
          <span className="ag">{'featured' in a && a.featured ? <b>{a.name}</b> : a.name}</span>
        </Fragment>
      ))}
    </p>
  );
}

export function FeaturesPage() {
  usePageMeta({
    title: 'Features — Wrangl',
    description:
      'Everything Wrangl does: every ACP agent in one app with projects and terminals, plus Robinhood Chain tools, swaps and a wallet gate where you sign every trade.',
    path: '/features/',
    robots: 'index,follow',
  });

  const tab = useFeaturesTab();
  // The chain status and pools only start once the Crypto tab has been opened, and keep running.
  const [cryptoStarted, setCryptoStarted] = useState(false);
  if (tab === 'crypto' && !cryptoStarted) setCryptoStarted(true);

  const chain = useChainStatus(cryptoStarted);
  const pools = useNewPools(cryptoStarted);
  const tabRefs = useRef<Record<FeaturesTab, HTMLButtonElement | null>>({
    wrangl: null,
    crypto: null,
  });

  const blockText =
    chain.block !== null ? formatBlock(chain.block) : chain.unreachable ? 'offline' : '…';
  const gasText =
    chain.gas !== null ? `${formatGas(chain.gas)} gwei` : chain.unreachable ? '–' : '…';

  const onSwitchKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const next: FeaturesTab = tab === 'wrangl' ? 'crypto' : 'wrangl';
    setFeaturesTab(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <div className="page-features">
      <main>
        <section className="page-head" aria-labelledby="page-title">
          <div className="wrap">
            <p className="eyebrow">Features</p>
            <h1 id="page-title">Everything Wrangl does.</h1>
            <p className="sub">
              Two halves of one app: a workspace for every AI coding agent, and the tools that let
              those agents work on Robinhood Chain while you keep the keys.
            </p>
            <div
              className="switch"
              role="tablist"
              aria-label="Feature group"
              id="switch"
              data-tab={tab}
              onKeyDown={onSwitchKeyDown}
            >
              <span className="thumb" aria-hidden="true"></span>
              <button
                role="tab"
                id="tab-wrangl"
                aria-controls="panel-wrangl"
                aria-selected={tab === 'wrangl'}
                data-tab="wrangl"
                tabIndex={tab === 'wrangl' ? 0 : -1}
                ref={(el) => {
                  tabRefs.current.wrangl = el;
                }}
                onClick={() => setFeaturesTab('wrangl')}
              >
                Wrangl<small>agents · chat · terminals</small>
              </button>
              <button
                role="tab"
                id="tab-crypto"
                aria-controls="panel-crypto"
                aria-selected={tab === 'crypto'}
                data-tab="crypto"
                tabIndex={tab === 'crypto' ? 0 : -1}
                ref={(el) => {
                  tabRefs.current.crypto = el;
                }}
                onClick={() => setFeaturesTab('crypto')}
              >
                Crypto<small>Robinhood Chain · wallet</small>
              </button>
            </div>
          </div>
        </section>

        {/* ================= WRANGL ================= */}
        <div
          className="panel"
          id="panel-wrangl"
          role="tabpanel"
          aria-labelledby="tab-wrangl"
          hidden={tab !== 'wrangl'}
        >
          <div className="wrap">
            <section className="agents-band" aria-labelledby="agents-title">
              <div>
                <p className="kicker">ACP · Agent Client Protocol</p>
                <h2 id="agents-title">Every ACP agent. One window.</h2>
                <p className="sub">
                  Pick any agent from the ACP Registry and sign in with the account you already
                  have. Each one gets the same approvals, chain, wallet and swap tools.
                </p>
              </div>
              <AgentList />
            </section>

            <section className="core" aria-label="Core features">
              {coreRows.map((row) => (
                <div className="row" key={row.num}>
                  <div>
                    <p className="num">{row.num}</p>
                    <h3>{row.title}</h3>
                    <p>{row.text}</p>
                  </div>
                </div>
              ))}
            </section>

            <section className="more" aria-labelledby="more-title">
              <p className="kicker">And more</p>
              <h2 id="more-title">The rest of the toolbox.</h2>
              <div className="more-grid">
                {moreItems.map((item) => (
                  <div className="more-item" key={item.tag}>
                    <span className="i">{item.tag}</span>
                    <h4>{item.title}</h4>
                    <p>{item.text}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>

        {/* ================= CRYPTO ================= */}
        <div
          className="panel"
          id="panel-crypto"
          role="tabpanel"
          aria-labelledby="tab-crypto"
          hidden={tab !== 'crypto'}
        >
          <div className="wrap">
            <section className="c-intro" aria-labelledby="c-title">
              <div>
                <p className="kicker">Robinhood Chain · chain id 4663</p>
                <h2 id="c-title">Agents read the chain. Your wallet signs.</h2>
                <p className="sub">
                  Every agent in Wrangl gets read-only Robinhood Chain tools and a wallet gate. It
                  can check a token, watch new pools and prepare a trade. It cannot send one. That
                  takes your click in your own wallet.
                </p>
                <div className="hero-cta" style={{ marginTop: 28 }}>
                  <a className="btn btn-primary" href="/install/">
                    Install Wrangl
                  </a>
                  <a className="btn" href={`${DOCS_URL}robinhood-chain`}>
                    Read the chain docs
                  </a>
                </div>
              </div>
              <div className="status-card" aria-live="polite">
                <div className="head">
                  <span className={chain.live ? 'live-dot on' : 'live-dot'} id="dot"></span>
                  <b>Robinhood Chain</b>
                  <span style={{ marginLeft: 'auto' }} id="src">
                    {chain.unreachable ? 'RPC unreachable here' : 'public RPC'}
                  </span>
                </div>
                <div className="kv">
                  <span>latest block</span>
                  <span
                    key={chain.block ?? 'none'}
                    className={chain.block !== null ? 'flash' : undefined}
                    id="blk"
                  >
                    {blockText}
                  </span>
                  <span>gas price</span>
                  <span id="gas">{gasText}</span>
                  <span>chain id</span>
                  <span>4663</span>
                </div>
                <PoolList state={pools} heading="newest pools" />
              </div>
            </section>

            <section className="tools" aria-labelledby="tools-title">
              <p className="kicker">Tools every agent gets</p>
              <h2 id="tools-title">Ten tools. Eight read, two ask you.</h2>
              <table className="tool-table">
                <thead>
                  <tr>
                    <th scope="col">tool</th>
                    <th scope="col">mode</th>
                    <th scope="col">what it returns</th>
                  </tr>
                </thead>
                <tbody>
                  {tools.map((t) => (
                    <tr key={t.name}>
                      <td>{t.name}</td>
                      <td className={t.mode === 'read' ? 'ro' : 'gate'}>{t.mode}</td>
                      <td>{t.text}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="note">Bytecode flags are hints, not an audit. Agents can be wrong.</p>
            </section>

            <section className="gate-flow" aria-labelledby="gate-title">
              <p className="kicker">The wallet gate</p>
              <h2 id="gate-title">How a trade happens.</h2>
              <div className="steps">
                <div className="step">
                  <h4>Connect</h4>
                  <p>
                    Wrangl opens a local page in your browser. MetaMask, Rabby or any browser wallet
                    connects there. Wrangl keeps the address.
                  </p>
                </div>
                <div className="step">
                  <h4>Agent proposes</h4>
                  <p>
                    "Buy 0.01 ETH of this token if it is clean." The agent checks it, then calls
                    wallet_send_transaction.
                  </p>
                </div>
                <div className="step">
                  <h4>Wrangl checks</h4>
                  <p>
                    It simulates the transaction and refuses one that would fail. Unlimited token
                    approvals get a red warning.
                  </p>
                </div>
                <div className="step last">
                  <h4>You confirm</h4>
                  <p>
                    Review it on the page, then confirm or reject in your wallet. The agent gets the
                    hash, or "rejected".
                  </p>
                </div>
              </div>
              <div className="guards">
                {guards.map((g) => (
                  <div className="guard" key={g.lead}>
                    <span className="mark">✓</span>
                    <p>
                      <strong>{g.lead}</strong> {g.text}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section className="split2" aria-label="RPC and market data">
              <div className="panel-card">
                <span className="tag mono" style={{ color: 'var(--dim)', fontSize: 12 }}>
                  project secrets
                </span>
                <h3 style={{ marginTop: 10 }}>Your own RPC</h3>
                <p>
                  The public RPC is free and rate-limited. Set{' '}
                  <span className="mono">ROBINHOOD_RPC_URL</span> to your provider's endpoint, and
                  every agent in the project reads through it. The URL stays in your system
                  keychain; agents never see it.
                </p>
                <div className="snippet">
                  <span className="c"># Settings → Robinhood Chain RPC</span>
                  <br />
                  ROBINHOOD_RPC_URL = https://…
                  <br />
                  COINGECKO_API_KEY = <span className="c">(optional)</span>
                </div>
              </div>
              <div className="panel-card">
                <span className="tag mono" style={{ color: 'var(--dim)', fontSize: 12 }}>
                  market data
                </span>
                <h3 style={{ marginTop: 10 }}>Prices and pools, no key needed</h3>
                <p>
                  Price, FDV, top pools and the newest pools come from GeckoTerminal without a key.
                  Add a CoinGecko API key as a project secret and the tools use CoinGecko instead.
                </p>
                <div className="snippet">
                  chain_new_pools → pool, liquidity, 24h volume, buys and sells
                </div>
              </div>
            </section>
          </div>
        </div>

        <section className="end-cta" aria-labelledby="end-title">
          <div className="wrap">
            <div className="box">
              <div>
                <h2 id="end-title">Free, open source, on your machine.</h2>
                <p>MIT licensed. Bring your own agent logins, RPC and wallet.</p>
              </div>
              <a className="btn btn-primary" href="/install/">
                Install Wrangl
              </a>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
