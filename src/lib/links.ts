import { isTauri } from '@tauri-apps/api/core';

/** Only web links leave the app; anything else (javascript:, file:, data:) is ignored. */
export function isWebLink(href: string | undefined): href is string {
  if (!href) return false;
  try {
    const url = new URL(href);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

/** Open a link in the user's default browser, never inside the app window. */
export async function openExternal(href: string): Promise<void> {
  if (!isWebLink(href)) return;
  if (isTauri()) {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(href);
  } else {
    window.open(href, '_blank', 'noopener,noreferrer');
  }
}
