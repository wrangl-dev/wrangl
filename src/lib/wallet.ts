import { useCallback, useEffect, useState } from 'react';
import { backendKind, call } from './ipc';

/** A transaction an agent proposed, waiting for the user (mirrors `TxRequest` in Rust). */
export interface WalletTxRequest {
  id: string;
  from: string;
  to: string;
  valueEth: string;
  valueWeiHex: string;
  data: string;
  description: string;
  warnings: string[];
  gasEstimate: string | null;
  createdAtMs: number;
}

export interface WalletSnapshot {
  address: string | null;
  chainId: number;
  requests: WalletTxRequest[];
}

export const walletApi = {
  status: () => call<WalletSnapshot>('wallet_status'),
  /** Opens the local signing page in the default browser (connect, sign). */
  openSigner: () => call<void>('wallet_open_signer'),
  disconnect: () => call<WalletSnapshot>('wallet_disconnect'),
  reject: (id: string) => call<WalletSnapshot>('wallet_reject', { id }),
};

export type WalletApi = typeof walletApi;

/**
 * The wallet, read again every `pollMs`: agents propose at any time, so the sidebar polls slowly
 * and the open Wallet page quickly.
 */
export function useWalletStatus(pollMs: number, api: WalletApi = walletApi) {
  const [snapshot, setSnapshot] = useState<WalletSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if ((await backendKind()) === 'none') return;
    try {
      setSnapshot(await api.status());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [api]);

  useEffect(() => {
    reload();
    const timer = setInterval(reload, pollMs);
    return () => clearInterval(timer);
  }, [pollMs, reload]);

  return { snapshot, error, setSnapshot, reload };
}

/** `0x1234…abcd` */
export const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
