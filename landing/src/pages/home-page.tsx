import { useHead } from '@unhead/react';
import { ChainTicker } from '../components/site/chain-ticker';
import { HeroChainCanvas } from '../components/site/hero-chain-canvas';
import { HeroStage } from '../components/site/hero-stage';
import { HomeInstall } from '../components/site/home-install';
import { PoolList } from '../components/site/pool-list';
import { TokenCa } from '../components/site/token-ca';
import { GITHUB_REPO_URL, LATEST_RELEASE_URL, LICENSE_URL, SITE_URL, X_URL } from '../lib/links';
import { usePageMeta } from '../lib/page-meta';
import { useNewPools } from '../lib/use-new-pools';

const HOME_DESCRIPTION =
  'Claude, Codex and every ACP agent in one app with projects and terminals. They check tokens, find pools and prepare swaps on Robinhood Chain; you approve every one in your own wallet.';

// Lets search engines show Wrangl as a free app and tie the site to its X and GitHub.
// No softwareVersion: a hand-typed version goes stale with every release.
const SOFTWARE_JSON_LD = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Wrangl',
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'Windows, macOS, Linux',
  description: HOME_DESCRIPTION,
  url: `${SITE_URL}/`,
  downloadUrl: LATEST_RELEASE_URL,
  license: LICENSE_URL,
  isAccessibleForFree: true,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  author: {
    '@type': 'Organization',
    name: 'Wrangl',
    url: `${SITE_URL}/`,
    sameAs: [X_URL, GITHUB_REPO_URL],
  },
});

export function HomePage() {
  usePageMeta({
    title: 'Wrangl — the agent terminal for Robinhood Chain',
    description: HOME_DESCRIPTION,
    path: '/',
    robots: 'index,follow',
  });
  useHead({
    script: [{ type: 'application/ld+json', textContent: SOFTWARE_JSON_LD }],
  });
  const pools = useNewPools(true);

  return (
    <div className="page-home">
      <ChainTicker />

      <main>
        <section className="hero" aria-labelledby="hero-title">
          <HeroChainCanvas />
          <div className="wrap hero-grid">
            <div>
              <p className="eyebrow">The agent terminal for Robinhood Chain</p>
              <h1 id="hero-title">
                Wrangle every agent.
                <br />
                <span className="soft">Trade Robinhood Chain.</span>
              </h1>
              <p className="lede">
                Claude, Codex and every agent on the ACP Registry plug in over ACP, the open Agent
                Client Protocol, with a terminal for each project. They check tokens, watch new
                pools and prepare swaps on Robinhood Chain.{' '}
                <strong>You approve every one in your own wallet.</strong>
              </p>
              <div className="hero-cta">
                <a className="btn btn-primary" href="/install/">
                  Install Wrangl
                </a>
                <a className="btn" href="/features/">
                  See every feature
                </a>
              </div>
              <TokenCa />
              <div className="proof">
                <span>Every ACP agent</span>
                <span>Built for Robinhood Chain</span>
                <span>Your keys stay in your wallet</span>
              </div>
            </div>

            <HeroStage />
          </div>
        </section>

        <section className="block" id="install" aria-labelledby="install-title">
          <div className="wrap install">
            <div>
              <p className="kicker">Install</p>
              <h2 id="install-title">One line. Or the installer.</h2>
              <p className="sub">
                The script downloads the latest release from GitHub and installs it for your user,
                no admin rights needed. The app then updates itself.
              </p>
              <div className="dl-row">
                <a className="btn" href={LATEST_RELEASE_URL}>
                  macOS .dmg
                </a>
                <a className="btn" href={LATEST_RELEASE_URL}>
                  Windows .exe
                </a>
                <a className="btn" href={LATEST_RELEASE_URL}>
                  Linux
                </a>
              </div>
            </div>
            <HomeInstall />
            <div className="howto">
              <a className="btn btn-primary" href="/install/">
                How to install →
              </a>
              <span>
                Step by step for macOS, Windows and Linux, plus Robinhood Chain RPC and wallet
                setup.
              </span>
            </div>
          </div>
        </section>

        <section className="block" id="flagship" aria-labelledby="flag-title">
          <div className="wrap">
            <p className="kicker">What it does</p>
            <h2 id="flag-title">A full agent workspace, built for Robinhood Chain.</h2>
            <p className="sub">
              Everything you need to work with AI agents, plus the tools that let them research and
              trade on Robinhood Chain.
            </p>

            <div className="group">
              <div className="group-head">
                <span className="gk">01</span>
                <h3>Wrangl</h3>
                <span className="gd">the workspace</span>
              </div>
              <div className="wgrid">
                <div className="w">
                  <span className="i">agents</span>
                  <h4>Every ACP agent</h4>
                  <p>
                    Claude, Codex, Gemini CLI, Cursor and the rest of the ACP Registry. Pick one;
                    Wrangl installs and starts it in your project.
                  </p>
                </div>
                <div className="w">
                  <span className="i">chat</span>
                  <h4>A chat that shows its work</h4>
                  <p>
                    Streaming Markdown answers, tool calls with their status, the plan, and a card
                    whenever an agent wants to act.
                  </p>
                </div>
                <div className="w">
                  <span className="i">projects</span>
                  <h4>Projects</h4>
                  <p>
                    Open a folder. Its chats live under it and keep running while you work
                    elsewhere.
                  </p>
                </div>
                <div className="w">
                  <span className="i">terminals</span>
                  <h4>Terminals</h4>
                  <p>Real shells in tabs under the chat, one set per project, a shortcut away.</p>
                </div>
                <div className="w">
                  <span className="i">swaps</span>
                  <h4>Swaps</h4>
                  <p>
                    Quotes across the chain's DEXes through KyberSwap. Exact-amount approvals, never
                    unlimited.
                  </p>
                </div>
                <div className="w">
                  <span className="i">wallet</span>
                  <h4>Your wallet signs</h4>
                  <p>MetaMask or Rabby on a local signing page. Wrangl keeps only your address.</p>
                </div>
              </div>
            </div>

            <div className="group">
              <div className="group-head">
                <span className="gk">02</span>
                <h3>Crypto</h3>
                <span className="gd">Robinhood Chain</span>
              </div>
              <div className="flag">
                <article className="f f-a">
                  <span className="tag">chain_new_pools · live</span>
                  <h4>Agents read Robinhood Chain</h4>
                  <p>
                    Token owner, mint and pause functions, proxies, balances, transactions and the
                    newest pools. Through your RPC, read-only.
                  </p>
                  <PoolList state={pools} heading="pool" ariaLive />
                </article>

                <article className="f f-b">
                  <span className="tag">wallet_send_transaction</span>
                  <h4>You sign every trade</h4>
                  <p>
                    Agents propose. Wrangl simulates and flags risky approvals. Your wallet
                    confirms.
                  </p>
                  <div className="flow">
                    <div>
                      <i>1</i>Agent proposes swap
                    </div>
                    <div>
                      <i>2</i>Simulated · approvals checked
                    </div>
                    <div>
                      <i>3</i>Confirmed in your wallet
                    </div>
                  </div>
                </article>

                <article className="f f-c">
                  <span className="tag">chain_token</span>
                  <h4>Check a token before you buy</h4>
                  <p>
                    Owner, renounced or not, mint and pause functions in the bytecode, proxy, price,
                    FDV and top pools.
                  </p>
                  <div className="checks">
                    <span className="ok">✓ owner renounced</span>
                    <span className="ok">✓ no mint</span>
                    <span className="ok">✓ no pause</span>
                    <span className="warn">! proxy found</span>
                  </div>
                </article>

                <article className="f f-d">
                  <span className="tag">settings</span>
                  <h4>Your own RPC</h4>
                  <p>
                    Works on the free public RPC out of the box, with keyless fallbacks when it is
                    blocked. Set your provider's URL once in Settings and every agent reads through
                    it. Agents never see the URL.
                  </p>
                  <div className="cron">
                    <span className="c"># Settings</span>
                    <br />
                    Robinhood Chain RPC = https://… <span className="c">[Test] [Save]</span>
                    <br />
                    CoinGecko API key = <span className="c">(optional)</span>
                  </div>
                </article>
              </div>
            </div>

            <div className="see-all">
              <p>
                <strong>Every feature, in detail.</strong> Agents, approvals, the full chain and
                swap tool list and the wallet gate.
              </p>
              <a className="btn" href="/features/">
                All features →
              </a>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
