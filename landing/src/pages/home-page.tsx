import { ChainTicker } from '../components/site/chain-ticker';
import { HeroChainCanvas } from '../components/site/hero-chain-canvas';
import { HeroStage } from '../components/site/hero-stage';
import { HomeInstall } from '../components/site/home-install';
import { PoolList } from '../components/site/pool-list';
import { TokenCa } from '../components/site/token-ca';
import { LATEST_RELEASE_URL } from '../lib/links';
import { usePageMeta } from '../lib/page-meta';
import { useNewPools } from '../lib/use-new-pools';

export function HomePage() {
  usePageMeta({
    title: 'Wrangl — the agent terminal for Robinhood Chain',
    description:
      'Claude, Codex and 40+ agents in one workspace with terminals, git, SSH and a browser. They research and prepare trades on Robinhood Chain; you approve every one in your own wallet.',
    path: '/',
    robots: 'index,follow',
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
              <h1 id="hero-title">Wrangle every agent.<br /><span className="soft">Trade Robinhood Chain.</span></h1>
              <p className="lede">Claude, Codex and 40+ agents plug in over ACP, the open Agent Client Protocol, into one workspace with terminals, git, SSH and a browser built in. They research tokens, watch new pools and prepare trades on Robinhood Chain. <strong>You approve every one in your own wallet.</strong> Wrangl keeps growing to make trading Robinhood Chain easier with every release.</p>
              <div className="hero-cta">
                <a className="btn btn-primary" href="/install/">Install Wrangl</a>
                <a className="btn" href="/features/">See every feature</a>
              </div>
              <TokenCa />
              <div className="proof"><span>44 agents</span><span>Built for Robinhood Chain</span><span>Your keys stay in your wallet</span></div>
            </div>

            <HeroStage />
          </div>
        </section>

        <section className="block" id="install" aria-labelledby="install-title">
          <div className="wrap install">
            <div>
              <p className="kicker">Install</p>
              <h2 id="install-title">One line. Or the installer.</h2>
              <p className="sub">The script downloads the latest release from GitHub, checks it against the published SHA-256 sums, and installs it. Run it again to update.</p>
              <div className="dl-row">
                <a className="btn" href={LATEST_RELEASE_URL}>macOS .dmg</a>
                <a className="btn" href={LATEST_RELEASE_URL}>Windows .exe</a>
                <a className="btn" href={LATEST_RELEASE_URL}>Linux</a>
              </div>
            </div>
            <HomeInstall />
            <div className="howto">
              <a className="btn btn-primary" href="/install/">How to install →</a>
              <span>Step by step for macOS, Windows and Linux, plus Robinhood Chain RPC and wallet setup.</span>
            </div>
          </div>
        </section>

        <section className="block" id="flagship" aria-labelledby="flag-title">
          <div className="wrap">
            <p className="kicker">What it does</p>
            <h2 id="flag-title">A full agent workspace, built for Robinhood Chain.</h2>
            <p className="sub">Everything you need to work with AI agents, plus the tools that let them research and trade on Robinhood Chain.</p>

            <div className="group">
              <div className="group-head"><span className="gk">01</span><h3>Wrangl</h3><span className="gd">the workspace</span></div>
              <div className="wgrid">
                <div className="w"><span className="i">agents</span><h4>44 agents over ACP</h4><p>Claude, Codex, Gemini CLI, Cursor and 40 more connect through ACP, the open Agent Client Protocol. Side by side in tabs, with the logins you already have.</p></div>
                <div className="w"><span className="i">terminals</span><h4>Terminals and split panes</h4><p>Every shell you have installed, in resizable panes. Sessions come back after a restart.</p></div>
                <div className="w"><span className="i">git</span><h4>Git and worktrees</h4><p>Stage, commit, branch and review changes. Give each agent its own worktree.</p></div>
                <div className="w"><span className="i">browser</span><h4>Browser and canvas</h4><p>A built-in browser you can annotate for the agent, and a canvas for notes and diagrams.</p></div>
                <div className="w"><span className="i">files</span><h4>Files, search and markdown</h4><p>Explorer, full-text search, an editor and live markdown preview per project.</p></div>
                <div className="w"><span className="i">remote</span><h4>SSH, phone and automations</h4><p>Work on remote hosts, open the workspace from your phone, and run prompts on a schedule.</p></div>
              </div>
            </div>

            <div className="group">
              <div className="group-head"><span className="gk">02</span><h3>Crypto</h3><span className="gd">Robinhood Chain</span></div>
              <div className="flag">
                <article className="f f-a">
                  <span className="tag">chain_new_pools · live</span>
                  <h4>Agents read Robinhood Chain</h4>
                  <p>Token owner, mint and pause functions, proxies, balances, transactions and the newest pools. Through your RPC, read-only.</p>
                  <PoolList state={pools} heading="pool" ariaLive />
                </article>

                <article className="f f-b">
                  <span className="tag">wallet_send_transaction</span>
                  <h4>You sign every trade</h4>
                  <p>Agents propose. Wrangl simulates and flags risky approvals. Your wallet confirms.</p>
                  <div className="flow">
                    <div><i>1</i>Agent proposes swap</div>
                    <div><i>2</i>Simulated · approvals checked</div>
                    <div><i>3</i>Confirmed in your wallet</div>
                  </div>
                </article>

                <article className="f f-c">
                  <span className="tag">chain_token</span>
                  <h4>Check a token before you buy</h4>
                  <p>Owner, renounced or not, mint and pause functions in the bytecode, proxy, price, FDV and top pools.</p>
                  <div className="checks"><span className="ok">✓ owner renounced</span><span className="ok">✓ no mint</span><span className="ok">✓ no pause</span><span className="warn">! proxy found</span></div>
                </article>

                <article className="f f-d">
                  <span className="tag">project secrets</span>
                  <h4>Your own RPC</h4>
                  <p>Works on the free public RPC out of the box. Set your provider's URL once and every agent in the project reads through it. Agents never see the URL.</p>
                  <div className="cron"><span className="c"># Automations → Project secrets</span><br />ROBINHOOD_RPC_URL = https://…<br />COINGECKO_API_KEY = <span className="c">(optional)</span></div>
                </article>
              </div>
            </div>

            <div className="see-all">
              <p><strong>Every feature, in detail.</strong> Canvas, SSH, snapshots, approvals, the full chain tool list and the wallet gate.</p>
              <a className="btn" href="/features/">All features →</a>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
