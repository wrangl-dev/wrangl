import { Channel, invoke, isTauri } from '@tauri-apps/api/core';

/**
 * One way to call the Rust side, whatever runs the UI:
 * - the desktop app: Tauri `invoke` and `Channel`;
 * - a browser in dev mode: the `wrangl-web` server over a WebSocket at `/ws`
 *   (see `src-tauri/src/web/mod.rs` for the wire format).
 */
export type BackendKind = 'tauri' | 'web' | 'none';

/** A channel argument: Rust pushes messages to it while a command's work runs. */
export interface EventChannel<T> {
  onmessage: (message: T) => void;
}

type Reply = { type: 'result'; id: number; ok?: unknown; error?: string };
type Push = { type: 'event'; channel: number; payload: unknown };

/** Channel for the WebSocket client. Serialises the same way Tauri's `Channel` does. */
export class WebChannel<T> implements EventChannel<T> {
  constructor(
    readonly id: number,
    public onmessage: (message: T) => void,
  ) {}
  toJSON(): string {
    return `__CHANNEL__:${this.id}`;
  }
}

export class WebClient {
  private nextId = 1;
  private nextChannel = 1;
  private pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();
  private channels = new Map<number, WebChannel<unknown>>();

  private constructor(private socket: WebSocket) {
    socket.onmessage = (e) => this.receive(String(e.data));
    socket.onclose = () => {
      for (const p of this.pending.values()) p.reject(new Error('connection to wrangl-web closed'));
      this.pending.clear();
    };
  }

  /** Open a connection, or reject when nothing answers within `timeoutMs`. */
  static connect(url: string, timeoutMs = 1500): Promise<WebClient> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      const timer = setTimeout(() => {
        socket.close();
        reject(new Error('wrangl-web did not answer'));
      }, timeoutMs);
      socket.onopen = () => {
        clearTimeout(timer);
        resolve(new WebClient(socket));
      };
      socket.onerror = () => {
        clearTimeout(timer);
        reject(new Error('could not reach wrangl-web'));
      };
    });
  }

  channel<T>(onmessage: (message: T) => void): WebChannel<T> {
    const ch = new WebChannel<T>(this.nextChannel++, onmessage);
    this.channels.set(ch.id, ch as WebChannel<unknown>);
    return ch;
  }

  call<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.socket.send(JSON.stringify({ id, cmd, args }));
    });
  }

  private receive(text: string) {
    let msg: Reply | Push;
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }
    if (msg.type === 'event') {
      this.channels.get(msg.channel)?.onmessage(msg.payload);
      return;
    }
    const waiting = this.pending.get(msg.id);
    if (!waiting) return;
    this.pending.delete(msg.id);
    if (msg.error !== undefined) waiting.reject(new Error(msg.error));
    else waiting.resolve(msg.ok);
  }
}

let web: Promise<WebClient | null> | null = null;

function webClient(): Promise<WebClient | null> {
  if (!web) {
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    web = WebClient.connect(`${scheme}://${location.host}/ws`).catch(() => null);
  }
  return web;
}

/** Which backend this UI talks to. Resolves once; `none` means a plain browser without wrangl-web. */
export async function backendKind(): Promise<BackendKind> {
  if (isTauri()) return 'tauri';
  return (await webClient()) ? 'web' : 'none';
}

/** A channel for `call`'s arguments. */
export async function createChannel<T>(onmessage: (message: T) => void): Promise<unknown> {
  if (isTauri()) {
    const ch = new Channel<T>();
    ch.onmessage = onmessage;
    return ch;
  }
  const client = await webClient();
  if (!client) throw new Error('no backend');
  return client.channel(onmessage);
}

/** Run a Rust command. */
export async function call<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  if (isTauri()) return invoke<T>(cmd, args);
  const client = await webClient();
  if (!client) throw new Error('no backend: open Wrangl in the desktop app or run wrangl-web');
  return client.call<T>(cmd, args);
}
