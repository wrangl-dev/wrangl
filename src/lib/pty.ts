import { backendKind, call, createChannel } from './ipc';

/** What a terminal sends back, mirroring `PtyEvent` in `src-tauri/src/pty/mod.rs`. */
export type PtyEvent = { kind: 'data'; data: string } | { kind: 'exit'; code: number | null };

export interface SpawnOptions {
  cols: number;
  rows: number;
  cwd?: string;
}

/** Terminals need a backend: the desktop app or the wrangl-web dev server. */
export const ptyAvailable = async (): Promise<boolean> => (await backendKind()) !== 'none';

/** Start a shell and stream its output to `onEvent`. Resolves to the terminal id. */
export async function spawnPty(
  options: SpawnOptions,
  onEvent: (event: PtyEvent) => void,
): Promise<string> {
  const onEventChannel = await createChannel<PtyEvent>(onEvent);
  return call<string>('pty_spawn', {
    ...options,
    cwd: options.cwd ?? null,
    onEvent: onEventChannel,
  });
}

export const writePty = (id: string, data: string): Promise<void> =>
  call('pty_write', { id, data });

export const resizePty = (id: string, cols: number, rows: number): Promise<void> =>
  call('pty_resize', { id, cols, rows });

export const killPty = (id: string): Promise<void> => call('pty_kill', { id });
