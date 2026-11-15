import { useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from 'react';

import { DOCS_URL, INSTALL_PS1_URL, INSTALL_SH_URL, LATEST_RELEASE_URL } from '../lib/links';
import { usePageMeta } from '../lib/page-meta';
import { RPC_URL } from '../lib/chain';
import { useCopyFeedback } from '../lib/use-copy-feedback';

type OsKey = 'mac' | 'win' | 'linux' | 'npm';

type OsGuide = {
  label: string;
  prompt: string;
  cmd: string;
  does: ReactNode[];
  files: ReactNode[];
  note: ReactNode;
};

const osOrder: OsKey[] = ['mac', 'win', 'linux', 'npm'];

const osGuides: Record<OsKey, OsGuide> = {
  mac: {
    label: 'macOS',
    prompt: '$',
    cmd: `curl -fsSL ${INSTALL_SH_URL} | bash`,
    does: [
      'Picks the build for your Mac: Apple silicon or Intel.',
      'Asks you to confirm, then downloads the disk image.',
      'Checks it against the release checksums.',
      <>Copies <code>Wrangl.app</code> to <code>/Applications</code>.</>,
    ],
    files: [
      <><code>Wrangl_&lt;version&gt;_aarch64.dmg</code> for Apple silicon</>,
      <><code>Wrangl_&lt;version&gt;_x64.dmg</code> for Intel</>,
      'Open the .dmg and drag Wrangl into Applications.',
    ],
    note: <>Wrangl is not notarized yet. If you install from a .dmg downloaded in a browser and macOS will not open it, run <code>xattr -dr com.apple.quarantine "/Applications/Wrangl.app"</code> once. The command above does this for you.</>,
  },
  win: {
    label: 'Windows',
    prompt: '>',
    cmd: `irm ${INSTALL_PS1_URL} | iex`,
    does: [
      'Run it in PowerShell.',
      'Downloads the 64-bit setup for the newest release.',
      'Checks it against the release checksums.',
      'Runs the installer.',
    ],
    files: [
      <code>Wrangl_&lt;version&gt;_x64-setup.exe</code>,
      <code>Wrangl_&lt;version&gt;_x64_en-US.msi</code>,
      'Both install the same app. Windows on ARM runs the x64 build.',
    ],
    note: <>The installer is not code-signed yet. If you download it in a browser, SmartScreen may warn you: click <b>More info</b>, then <b>Run anyway</b>. The command above avoids the warning.</>,
  },
  linux: {
    label: 'Linux',
    prompt: '$',
    cmd: `curl -fsSL ${INSTALL_SH_URL} | bash`,
    does: [
      'Downloads the AppImage and checks it against the release checksums.',
      <>Saves it as <code>~/.local/bin/wrangl.AppImage</code>.</>,
      <>Adds the <code>wrangl</code> command and an app menu entry.</>,
      <>Warns you if <code>~/.local/bin</code> is not on your PATH.</>,
    ],
    files: [
      <><code>Wrangl_&lt;version&gt;_amd64.deb</code>: <code>sudo apt install ./Wrangl_&lt;version&gt;_amd64.deb</code></>,
      <><code>Wrangl-&lt;version&gt;-1.x86_64.rpm</code> for Fedora and similar</>,
      <code>Wrangl_&lt;version&gt;_amd64.AppImage</code>,
    ],
    note: 'Linux builds are for x86_64 only and need WebKitGTK 2.40 or later (Debian 12, Ubuntu 24.04, or an updated Ubuntu 22.04).',
  },
  npm: {
    label: 'npm',
    prompt: '$',
    cmd: 'npx @wrangl-dev/wrangl',
    does: [
      'Works on macOS, Windows and Linux.',
      'Runs the same install script as the other tabs for your system.',
      'Checks the download against the release checksums.',
      'Run it again to update.',
    ],
    files: ['Needs Node.js 18 or later.', 'Prefer files? Use the tab for your system.'],
    note: 'The npm package only installs the desktop app. It does not add anything to your project.',
  },
};

const subscribeNothing = () => () => {};
const detectOs = (): OsKey => {
  const ua = navigator.userAgent;
  return /Win/i.test(ua) ? 'win' : /Linux|X11/i.test(ua) && !/Android/i.test(ua) ? 'linux' : 'mac';
};
const serverOs = (): OsKey => 'mac';

function CopyButton({ text }: { text: string }) {
  const { label, copy } = useCopyFeedback();
  return (
    <button className="copy" type="button" onClick={() => void copy(text)}>
      {label}
    </button>
  );
}

const docs = (path: string) => `${DOCS_URL}${path}`;
const EXPLORER_URL = 'https://robinhoodchain.blockscout.com';
const CHAIN_ID = '4663';

function OsInstall() {
  const detected = useSyncExternalStore(subscribeNothing, detectOs, serverOs);
  const [chosen, setChosen] = useState<OsKey | null>(null);
  const tabRefs = useRef<Partial<Record<OsKey, HTMLButtonElement | null>>>({});
  const os = chosen ?? detected;
  const guide = osGuides[os];

  const select = (key: OsKey, focus = false) => {
    setChosen(key);
    if (focus) tabRefs.current[key]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const next = osOrder[(i + (e.key === 'ArrowRight' ? 1 : osOrder.length - 1)) % osOrder.length];
    select(next, true);
  };

  return (
    <div>
      <div className="os" role="tablist" aria-label="Your system" id="os">
        {osOrder.map((key, i) => (
          <button
            key={key}
            role="tab"
            id={`t-${key}`}
            aria-controls="os-panel"
            aria-selected={key === os}
            tabIndex={key === os ? 0 : -1}
            data-os={key}
            ref={(el) => {
              tabRefs.current[key] = el;
            }}
            onClick={() => select(key)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {osGuides[key].label}
          </button>
        ))}
      </div>
      <div id="os-panel" role="tabpanel" aria-labelledby={`t-${os}`}>
        <div className="cmdbox"><div className="line"><span className="p" id="os-p">{guide.prompt}</span><code id="os-cmd">{guide.cmd}</code><CopyButton key={os} text={guide.cmd} /></div></div>
        <div className="detail">
          <div><h3>What it does</h3><ol id="os-does">{guide.does.map((d, i) => <li key={i}>{d}</li>)}</ol></div>
          <div>
            <h3>Or download a file</h3>
            <ul id="os-files">
              {guide.files.map((f, i) => <li key={i}>{f}</li>)}
              <li><a href={LATEST_RELEASE_URL}>Latest release on GitHub →</a></li>
            </ul>
          </div>
        </div>
        <p className="note" id="os-note">{guide.note}</p>
      </div>
    </div>
  );
}

export function InstallPage() {
  usePageMeta({
    title: 'Install — Wrangl',
    description:
      'Install Wrangl on macOS, Windows or Linux, sign in to an agent, set your Robinhood Chain RPC and connect your wallet.',
    path: '/install/',
    robots: 'index,follow',
  });

  return (
    <div className="page-install">
      <main>
        <section className="page-head" aria-labelledby="page-title">
          <div className="wrap">
            <p className="eyebrow">Install</p>
            <h1 id="page-title">Install Wrangl.</h1>
            <p className="sub">Free and open source (MIT). Run one command for your system, sign in to an agent, then point Wrangl at Robinhood Chain. Bring your own agent logins, RPC and wallet.</p>
            <nav className="jump" aria-label="On this page">
              <a href="#app"><b>01</b>Install the app</a>
              <a href="#agent"><b>02</b>Sign in to an agent</a>
              <a href="#rpc"><b>03</b>Robinhood Chain RPC</a>
              <a href="#wallet"><b>04</b>Connect a wallet</a>
              <a href="#update"><b>05</b>Update and uninstall</a>
            </nav>
          </div>
        </section>

        <div className="wrap">
          <section className="step" id="app" aria-labelledby="app-title">
            <div>
              <p className="num">01</p>
              <h2 id="app-title">Install the app</h2>
              <p className="lead">Each command downloads the newest release from GitHub, checks it against the published SHA-256 sums, and installs nothing if the check fails. Run the same command again to update.</p>
            </div>
            <OsInstall />
          </section>

          <section className="step" id="agent" aria-labelledby="agent-title">
            <div>
              <p className="num">02</p>
              <h2 id="agent-title">Sign in to an agent</h2>
              <p className="lead">Wrangl runs the agents you already use, with your own account. Nothing is billed through Wrangl.</p>
            </div>
            <div>
              <ol className="steps-list">
                <li>Open Wrangl and add a project folder. Each project gets its own terminals, files and chats.</li>
                <li>Click <b>New chat</b> and pick an agent: Claude, Codex, Gemini CLI, Copilot, Cursor or any of the 40+ others.</li>
                <li>If the agent asks you to sign in, sign in with your own account in the window it opens.</li>
                <li>To see which agents are ready, open Settings (<code>Cmd+,</code> or <code>Ctrl+,</code>) and click <b>Agent chats</b>. Some agents need Node.js or uv first; the list says which.</li>
              </ol>
              <p className="note">Full guide: <a href={docs('agent-setup/install-agents')}>Install an agent</a>.</p>
            </div>
          </section>

          <section className="step" id="rpc" aria-labelledby="rpc-title">
            <div>
              <p className="num">03</p>
              <h2 id="rpc-title">Robinhood Chain RPC</h2>
              <p className="lead">Every agent gets Robinhood Chain tools out of the box, through the free public RPC. It is rate-limited, and some networks block it. For steady use, set your own RPC URL from a provider.</p>
            </div>
            <div>
              <table className="net" aria-label="Robinhood Chain network">
                <tbody>
                  <tr><th scope="row">Network</th><td>Robinhood Chain</td></tr>
                  <tr><th scope="row">Public RPC</th><td><div className="v"><span id="rpc-url">{RPC_URL}</span><CopyButton text={RPC_URL} /></div></td></tr>
                  <tr><th scope="row">Chain ID</th><td><div className="v"><span id="chain-id">{CHAIN_ID}</span><CopyButton text={CHAIN_ID} /></div></td></tr>
                  <tr><th scope="row">Gas token</th><td>ETH</td></tr>
                  <tr><th scope="row">Explorer</th><td><div className="v"><span id="explorer">{EXPLORER_URL}</span><CopyButton text={EXPLORER_URL} /></div></td></tr>
                </tbody>
              </table>

              <h3 className="sub-h">Use your own RPC</h3>
              <ol className="steps-list">
                <li>Get an RPC URL for Robinhood Chain from your provider.</li>
                <li>In Wrangl, open the project and click <b>Automations</b> in the rail.</li>
                <li>Click <b>Project secrets</b>. Next to <code>ROBINHOOD_RPC_URL</code>, click <b>Set</b> and paste the URL.</li>
                <li>Check it: ask any agent <code>run chain_status</code>. The answer says which RPC replied.</li>
              </ol>
              <p className="note">The URL is stored in your system keychain, per project. Agents never see it. Have a CoinGecko API key? Set it as <code>COINGECKO_API_KEY</code> the same way and market data comes from CoinGecko instead of GeckoTerminal.</p>
            </div>
          </section>

          <section className="step" id="wallet" aria-labelledby="wallet-title">
            <div>
              <p className="num">04</p>
              <h2 id="wallet-title">Connect a wallet <span className="opt">optional</span></h2>
              <p className="lead">Only needed when you want agents to prepare trades. Wrangl keeps your address, never a key. Every transaction is confirmed by you, in your wallet.</p>
            </div>
            <div>
              <ol className="steps-list">
                <li>Click <b>Wallet</b> in the rail, then <b>Connect wallet</b>.</li>
                <li>Your browser opens a local Wrangl page on <code>127.0.0.1</code>. Use the browser where MetaMask, Rabby or your wallet extension is installed.</li>
                <li>Connect the wallet. The page adds Robinhood Chain (chain id 4663) if your wallet does not have it yet.</li>
                <li>Ask an agent for a trade. It proposes the transaction, Wrangl simulates it and flags risky approvals, and you confirm or reject it in your wallet.</li>
              </ol>
              <p className="note warn"><b>Never type a seed phrase or private key into Wrangl or a chat.</b> Wrangl never asks for one. Use a separate wallet with a small balance for agent trading.</p>
            </div>
          </section>

          <section className="step" id="update" aria-labelledby="update-title">
            <div>
              <p className="num">05</p>
              <h2 id="update-title">Update and uninstall</h2>
              <p className="lead">The app checks for new versions and installs them for you. Running the install command again also updates to the newest release.</p>
            </div>
            <div className="detail" style={{ marginTop: 0 }}>
              <div>
                <h3>Uninstall</h3>
                <ul>
                  <li><b style={{ color: 'var(--text)', fontWeight: 600 }}>macOS:</b> move <code>/Applications/Wrangl.app</code> to the Trash.</li>
                  <li><b style={{ color: 'var(--text)', fontWeight: 600 }}>Windows:</b> Settings → Apps → Installed apps → Wrangl → Uninstall.</li>
                  <li><b style={{ color: 'var(--text)', fontWeight: 600 }}>Linux (script):</b> delete <code>~/.local/bin/wrangl</code>, <code>~/.local/bin/wrangl.AppImage</code> and <code>~/.local/share/applications/wrangl.desktop</code>. Packages: remove with your package manager.</li>
                </ul>
              </div>
              <div>
                <h3>Read more</h3>
                <div className="docs-grid" style={{ gridTemplateColumns: '1fr' }}>
                  <a className="doc" href={docs('getting-started/install')}><span className="arrow">→</span><h3>Install guide</h3><p>Every platform, package and option.</p></a>
                  <a className="doc" href={docs('robinhood-chain')}><span className="arrow">→</span><h3>Robinhood Chain</h3><p>Tools, RPC, wallet and security.</p></a>
                  <a className="doc" href={docs('troubleshooting')}><span className="arrow">→</span><h3>Troubleshooting</h3><p>App won't open, agent won't start, RPC errors.</p></a>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
