import { type FormEvent, useEffect, useState } from 'react';
import {
  getSettings,
  type RpcStatus,
  type SettingsView,
  saveSettings,
  testRpc,
} from '../lib/settings';

interface Api {
  getSettings: typeof getSettings;
  saveSettings: typeof saveSettings;
  testRpc: typeof testRpc;
}

const realApi: Api = { getSettings, saveSettings, testRpc };

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

type TestState =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'ok'; status: RpcStatus }
  | { kind: 'failed'; message: string };

/** Settings: the user's own Robinhood Chain RPC and CoinGecko key for the agents' chain tools. */
export function SettingsPage({ onClose, api = realApi }: { onClose: () => void; api?: Api }) {
  const [view, setView] = useState<SettingsView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rpc, setRpc] = useState('');
  const [key, setKey] = useState('');
  const [test, setTest] = useState<TestState>({ kind: 'idle' });
  const [notice, setNotice] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getSettings()
      .then(setView)
      .catch((e: unknown) => setLoadError(errorText(e)));
  }, [api]);

  const save = async (
    patch: { robinhoodRpcUrl?: string; coingeckoApiKey?: string },
    done: string,
  ) => {
    setSaveError(null);
    setNotice(null);
    try {
      setView(await api.saveSettings(patch));
      setNotice(done);
      if (patch.robinhoodRpcUrl !== undefined) {
        setRpc('');
        // An old result was about the previous RPC.
        setTest({ kind: 'idle' });
      }
      if (patch.coingeckoApiKey !== undefined) setKey('');
    } catch (e) {
      setSaveError(errorText(e));
    }
  };

  const runTest = async () => {
    setTest({ kind: 'running' });
    try {
      setTest({ kind: 'ok', status: await api.testRpc(rpc.trim() || undefined) });
    } catch (e) {
      let message = errorText(e);
      if (message.includes('(public) unreachable')) {
        message +=
          '. Some internet providers block the public Robinhood Chain RPC; add your own RPC above.';
      }
      setTest({ kind: 'failed', message });
    }
  };

  const submitRpc = (e: FormEvent) => {
    e.preventDefault();
    if (rpc.trim()) save({ robinhoodRpcUrl: rpc.trim() }, 'RPC saved. New chats use it.');
  };

  const submitKey = (e: FormEvent) => {
    e.preventDefault();
    if (key.trim()) save({ coingeckoApiKey: key.trim() }, 'CoinGecko key saved. New chats use it.');
  };

  return (
    <section className="settings" aria-label="Settings">
      <header className="settings-header">
        <h1>Settings</h1>
        <button type="button" className="chat-new" onClick={onClose}>
          Back to chat
        </button>
      </header>

      {loadError && <p className="error">{loadError}</p>}

      <div className="settings-card">
        <h2>Robinhood Chain RPC</h2>
        <p className="muted">
          The chain tools read through this RPC. Without one they use the public RPC, which is
          rate-limited and blocked by some internet providers. Alchemy, Chainstack and QuickNode
          offer Robinhood Chain endpoints.
        </p>
        <p className="settings-current">
          {view?.rpcUrlSet ? (
            <>
              Using your RPC at <strong>{view.rpcHost ?? 'a custom host'}</strong>
            </>
          ) : (
            'Using the public RPC'
          )}
        </p>
        <form className="settings-row" onSubmit={submitRpc}>
          <input
            type="password"
            aria-label="RPC URL"
            placeholder="https://robinhood-mainnet.g.alchemy.com/v2/…"
            value={rpc}
            onChange={(e) => setRpc(e.target.value)}
            autoComplete="off"
          />
          <button type="button" onClick={runTest} disabled={test.kind === 'running'}>
            {test.kind === 'running' ? 'Testing…' : 'Test'}
          </button>
          <button type="submit" className="primary" disabled={!rpc.trim()}>
            Save
          </button>
        </form>
        {view?.rpcUrlSet && (
          <button
            type="button"
            className="link-button"
            onClick={() =>
              save({ robinhoodRpcUrl: '' }, 'RPC removed. New chats use the public RPC.')
            }
          >
            Remove my RPC
          </button>
        )}
        {test.kind === 'ok' && (
          <p className={test.status.warning ? 'error' : 'ok'} role="status">
            {test.status.warning ??
              `Connected (${test.status.rpc}): chain ${test.status.chain_id}, block ${test.status.latest_block?.toLocaleString()}`}
          </p>
        )}
        {test.kind === 'failed' && (
          <p className="error" role="status">
            {test.message}
          </p>
        )}
      </div>

      <div className="settings-card">
        <h2>CoinGecko API key</h2>
        <p className="muted">
          Optional. Prices and pools come from GeckoTerminal for free; a CoinGecko key gives higher
          limits.
        </p>
        <p className="settings-current">{view?.coingeckoKeySet ? 'Key saved' : 'No key'}</p>
        <form className="settings-row" onSubmit={submitKey}>
          <input
            type="password"
            aria-label="CoinGecko API key"
            placeholder="CG-…"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            autoComplete="off"
          />
          <button type="submit" className="primary" disabled={!key.trim()}>
            Save
          </button>
        </form>
        {view?.coingeckoKeySet && (
          <button
            type="button"
            className="link-button"
            onClick={() => save({ coingeckoApiKey: '' }, 'CoinGecko key removed.')}
          >
            Remove key
          </button>
        )}
      </div>

      {notice && (
        <p className="ok" role="status">
          {notice}
        </p>
      )}
      {saveError && (
        <p className="error" role="alert">
          {saveError}
        </p>
      )}
      <p className="muted settings-foot">
        Saved on this computer only, in Wrangl's data folder. The values are never shown again.
      </p>
    </section>
  );
}
