import { backendKind, call } from './ipc';

export interface AppInfo {
  name: string;
  version: string;
  chainId: number;
}

/** Shown when no backend answers (plain browser, tests). */
export const BROWSER_APP_INFO: AppInfo = { name: 'Wrangl', version: 'dev', chainId: 4663 };

/** Read the app name, version and chain from the Rust side. */
export async function loadAppInfo(): Promise<AppInfo> {
  if ((await backendKind()) === 'none') return BROWSER_APP_INFO;
  return call<AppInfo>('app_info');
}
