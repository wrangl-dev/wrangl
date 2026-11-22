import { Channel, invoke, isTauri } from '@tauri-apps/api/core';

/** What a terminal sends back, mirroring `PtyEvent` in `src-tauri/src/pty/mod.rs`. */
export type PtyEvent = { kind: 'data'; data: string } | { kind: 'exit'; code: number | null };

export interface SpawnOptions {
  cols: number;
  rows: number;
  cwd?: string;
}

/** Terminals run only in the desktop app; a plain browser has no shell to start. */
export const ptyAvailable = (): boolean => isTauri();

/** Start a shell and stream its output to `onEvent`. Resolves to the terminal id. */
export function spawnPty(
  options: SpawnOptions,
  onEvent: (event: PtyEvent) => void,
): Promise<string> {
  const channel = new Channel<PtyEvent>();
  channel.onmessage = onEvent;
  return invoke<string>('pty_spawn', { ...options, cwd: options.cwd ?? null, onEvent: channel });
}

export const writePty = (id: string, data: string): Promise<void> =>
  invoke('pty_write', { id, data });

export const resizePty = (id: string, cols: number, rows: number): Promise<void> =>
  invoke('pty_resize', { id, cols, rows });

export const killPty = (id: string): Promise<void> => invoke('pty_kill', { id });
