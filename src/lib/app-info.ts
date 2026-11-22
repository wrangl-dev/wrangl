import { invoke, isTauri } from '@tauri-apps/api/core';

export interface AppInfo {
  name: string;
  version: string;
  chainId: number;
}

/** Shown when the UI runs in a plain browser (vite dev, tests). */
export const BROWSER_APP_INFO: AppInfo = { name: 'Wrangl', version: 'dev', chainId: 4663 };

/** Read the app name, version and chain from the Rust side. */
export async function loadAppInfo(): Promise<AppInfo> {
  if (!isTauri()) return BROWSER_APP_INFO;
  return invoke<AppInfo>('app_info');
}
