import { isTauri } from '@tauri-apps/api/core';

/**
 * The OS folder picker, in the desktop app. A plain browser cannot hand out real folder paths,
 * so there the sidebar falls back to typing one.
 */
export function folderPicker(): (() => Promise<string | null>) | undefined {
  if (!isTauri()) return undefined;
  return async () => {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const picked = await open({ directory: true, multiple: false, title: 'Open a project folder' });
    return typeof picked === 'string' ? picked : null;
  };
}
