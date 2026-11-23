import { useState } from 'react';
import {
  shortAddress,
  useWalletStatus,
  type WalletApi,
  type WalletTxRequest,
  walletApi,
} from '../lib/wallet';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * The user's wallet: connect or disconnect it, and the transactions agents proposed. Signing
 * happens on a local page in the user's browser, where their wallet extension is; Wrangl keeps
 * only the address.
 */
export function WalletPage({ onClose, api = walletApi }: { onClose: () => void; api?: WalletApi }) {
  const { snapshot, error, setSnapshot } = useWalletStatus(1500, api);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setActionError(null);
    try {
      await action();
    } catch (e) {
      setActionError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const openSigner = () =>
    run(async () => {
      await api.openSigner();
      setNotice('Opened the signing page in your browser.');
    });

  const disconnect = () => run(async () => setSnapshot(await api.disconnect()));
  const reject = (r: WalletTxRequest) => run(async () => setSnapshot(await api.reject(r.id)));

  return (
    <section className="settings" aria-label="Wallet">
      <header className="settings-header">
        <h1>Wallet</h1>
        <button type="button" className="chat-new" onClick={onClose}>
          Back to chat
        </button>
      </header>

      <p className="muted wallet-intro">
        Connect MetaMask, Rabby or another browser wallet. Wrangl keeps only your address. Agents
        can propose transactions; nothing is sent until you confirm it in your wallet.
      </p>

      {error && <p className="error">{error}</p>}
      {!snapshot && !error && <p className="muted">Loading…</p>}

      {snapshot && (
        <>
          <div className="settings-card">
            {snapshot.address ? (
              <>
                <h2>Connected</h2>
                <p className="wallet-address" title={snapshot.address}>
                  {snapshot.address}
                </p>
                <p className="muted">Robinhood Chain (chain id {snapshot.chainId}). Watch-only.</p>
                <div className="settings-row">
                  <button type="button" disabled={busy} onClick={openSigner}>
                    Open signing page
                  </button>
                  <button type="button" disabled={busy} onClick={disconnect}>
                    Disconnect
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2>No wallet connected</h2>
                <p className="muted">
                  Your browser opens a local Wrangl page. Connect your wallet there.
                </p>
                <div className="settings-row">
                  <button type="button" className="primary" disabled={busy} onClick={openSigner}>
                    Connect wallet
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="settings-card">
            <h2>Waiting for your signature</h2>
            {snapshot.requests.length === 0 ? (
              <p className="muted">Nothing to sign.</p>
            ) : (
              <ul className="wallet-requests">
                {snapshot.requests.map((r) => (
                  <li key={r.id}>
                    <p className="wallet-desc">{r.description}</p>
                    <p className="muted">
                      {r.valueEth} ETH to <span title={r.to}>{shortAddress(r.to)}</span>
                      {r.data !== '0x' && ' · contract call'}
                      {r.gasEstimate && ` · gas ${Number(r.gasEstimate).toLocaleString()}`}
                    </p>
                    {r.warnings.map((w) => (
                      <p key={w} className="error">
                        {w}
                      </p>
                    ))}
                    <div className="settings-row">
                      <button type="button" className="primary" onClick={openSigner}>
                        Review and sign
                      </button>
                      <button type="button" onClick={() => reject(r)}>
                        Reject
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {notice && (
        <p className="ok" role="status">
          {notice}
        </p>
      )}
      {actionError && (
        <p className="error" role="alert">
          {actionError}
        </p>
      )}
    </section>
  );
}
