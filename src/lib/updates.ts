import { isTauri } from '@tauri-apps/api/core';

/** A newer signed release than the running app. */
export interface AvailableUpdate {
  version: string;
  notes: string | null;
  /** Download, verify the signature, install, and restart into the new version. */
  install: (onProgress?: (done: number, total: number | null) => void) => Promise<void>;
}

/**
 * Ask the release feed whether a newer version exists. Only the desktop app updates itself;
 * the browser dev mode and failures (offline, no release yet) answer `null`.
 */
export async function checkForUpdate(): Promise<AvailableUpdate | null> {
  if (!isTauri()) return null;
  const { check } = await import('@tauri-apps/plugin-updater');
  const update = await check().catch(() => null);
  if (!update) return null;
  return {
    version: update.version,
    notes: update.body ?? null,
    install: async (onProgress) => {
      let done = 0;
      let total: number | null = null;
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') total = event.data.contentLength ?? null;
        if (event.event === 'Progress') done += event.data.chunkLength;
        onProgress?.(done, total);
      });
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    },
  };
}
