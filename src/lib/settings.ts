import { call } from './ipc';

/** What the app shows about the saved settings; values never come back from Rust. */
export interface SettingsView {
  rpcUrlSet: boolean;
  rpcHost: string | null;
  coingeckoKeySet: boolean;
}

/** `chain_status` output. */
export interface RpcStatus {
  rpc: string;
  chain_id: number | null;
  latest_block: number | null;
  gas_price_gwei: string | null;
  warning?: string;
}

export const getSettings = () => call<SettingsView>('settings_get');

/** Leave a field out to keep it; an empty string removes it. */
export const saveSettings = (patch: { robinhoodRpcUrl?: string; coingeckoApiKey?: string }) =>
  call<SettingsView>('settings_set', patch);

/** Ask an RPC for chain id and latest block: the typed URL, else the saved one, else public. */
export const testRpc = (rpcUrl?: string) =>
  call<RpcStatus>('chain_test_rpc', rpcUrl ? { rpcUrl } : {});
