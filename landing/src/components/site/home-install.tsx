import { useState, useSyncExternalStore } from 'react';

import { INSTALL_PS1_URL, INSTALL_SH_URL } from '../../lib/links';
import { useCopyFeedback } from '../../lib/use-copy-feedback';

const TABS = [
  { label: 'macOS / Linux', cmd: `curl -fsSL ${INSTALL_SH_URL} | bash`, prompt: '$' },
  { label: 'Windows', cmd: `irm ${INSTALL_PS1_URL} | iex`, prompt: '>' },
  { label: 'npm', cmd: 'npx @wrangl-dev/wrangl', prompt: '$' },
] as const;

const subscribeNothing = () => () => {};
const detectTab = () => (/Win/i.test(navigator.userAgent) ? 1 : 0);
const serverTab = () => 0;

export function HomeInstall() {
  const detected = useSyncExternalStore(subscribeNothing, detectTab, serverTab);
  const [chosen, setChosen] = useState<number | null>(null);
  const active = chosen ?? detected;
  const { label, copy, reset } = useCopyFeedback();
  const tab = TABS[active];

  return (
    <div className="term">
      <div className="term-tabs" role="tablist" aria-label="Install from the terminal">
        {TABS.map((t, i) => (
          <button
            key={t.label}
            role="tab"
            aria-selected={i === active}
            data-cmd={t.cmd}
            data-p={t.prompt}
            onClick={() => {
              setChosen(i);
              reset();
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="term-line">
        <span className="p" id="prompt">
          {tab.prompt}
        </span>
        <code id="cmd">{tab.cmd}</code>
        <button className="copy" id="copy" type="button" onClick={() => void copy(tab.cmd)}>
          {label}
        </button>
      </div>
      <p className="term-note">Free and open source (MIT). Bring your own agent logins and RPC.</p>
    </div>
  );
}
