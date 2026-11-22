import { useEffect, useState } from 'react';
import { type AppInfo, BROWSER_APP_INFO, loadAppInfo } from './lib/app-info';

export function App() {
  const [info, setInfo] = useState<AppInfo>(BROWSER_APP_INFO);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAppInfo()
      .then(setInfo)
      .catch((e: unknown) => setError(String(e)));
  }, []);

  return (
    <div className="shell">
      <aside className="sidebar" aria-label="Agents">
        <header className="brand">
          <span className="brand-mark">W_</span>
          <span>{info.name}</span>
        </header>
        <p className="muted">No agents yet.</p>
      </aside>

      <main className="workspace">
        <section className="panel" aria-label="Terminal">
          <p className="muted">Terminal</p>
        </section>
      </main>

      <footer className="statusbar">
        <span>v{info.version}</span>
        <span>Robinhood Chain {info.chainId}</span>
        {error && <span className="error">{error}</span>}
      </footer>
    </div>
  );
}
