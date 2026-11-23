import { WebChannel, WebClient } from './ipc';

/** A WebSocket stand-in the test drives by hand. */
class FakeSocket {
  static last: FakeSocket;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  constructor(readonly url: string) {
    FakeSocket.last = this;
  }
  send(text: string) {
    this.sent.push(text);
  }
  close() {
    this.onclose?.();
  }
  push(msg: unknown) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
}

async function connected(): Promise<{ client: WebClient; socket: FakeSocket }> {
  const pending = WebClient.connect('ws://localhost:1420/ws');
  const socket = FakeSocket.last;
  socket.onopen?.();
  return { client: await pending, socket };
}

describe('WebClient', () => {
  beforeEach(() => vi.stubGlobal('WebSocket', FakeSocket));
  afterEach(() => vi.unstubAllGlobals());

  it('serialises channels like Tauri does', () => {
    expect(JSON.stringify({ onEvent: new WebChannel(3, () => {}) })).toBe(
      '{"onEvent":"__CHANNEL__:3"}',
    );
  });

  it('matches replies to requests by id', async () => {
    const { client, socket } = await connected();
    const first = client.call('app_info');
    const second = client.call('pty_write', { id: 'a', data: 'x' });
    const [a, b] = socket.sent.map((s) => JSON.parse(s));
    expect(a).toEqual({ id: 1, cmd: 'app_info', args: {} });
    expect(b).toEqual({ id: 2, cmd: 'pty_write', args: { id: 'a', data: 'x' } });

    socket.push({ type: 'result', id: 2, ok: null });
    socket.push({ type: 'result', id: 1, ok: { chainId: 4663 } });
    await expect(first).resolves.toEqual({ chainId: 4663 });
    await expect(second).resolves.toBeNull();
  });

  it('rejects with the server error', async () => {
    const { client, socket } = await connected();
    const p = client.call('nope');
    socket.push({ type: 'result', id: 1, error: 'unknown command nope' });
    await expect(p).rejects.toThrow('unknown command nope');
  });

  it('routes events to their channel only', async () => {
    const { client, socket } = await connected();
    const one = vi.fn();
    const two = vi.fn();
    client.channel(one);
    client.channel(two);
    socket.push({ type: 'event', channel: 2, payload: { kind: 'data', data: 'hi' } });
    expect(one).not.toHaveBeenCalled();
    expect(two).toHaveBeenCalledWith({ kind: 'data', data: 'hi' });
  });

  it('fails pending calls when the socket closes', async () => {
    const { client, socket } = await connected();
    const p = client.call('app_info');
    socket.close();
    await expect(p).rejects.toThrow('closed');
  });

  it('rejects connect when the server is not there', async () => {
    const pending = WebClient.connect('ws://localhost:1420/ws');
    FakeSocket.last.onerror?.();
    await expect(pending).rejects.toThrow('could not reach');
  });
});

describe('tauriBridgeArgs', () => {
  // Tauri channels register a callback with the app; a counter is enough here.
  beforeEach(() => {
    let n = 0;
    vi.stubGlobal('__TAURI_INTERNALS__', { transformCallback: () => ++n });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('moves a Tauri channel out of the arguments and leaves its id behind', async () => {
    const { Channel } = await import('@tauri-apps/api/core');
    const { tauriBridgeArgs } = await import('./ipc');
    const ch = new Channel<unknown>();
    const out = tauriBridgeArgs('pty_spawn', { cols: 80, onEvent: ch });
    expect(out.cmd).toBe('pty_spawn');
    expect(out.events).toBe(ch);
    expect(out.args).toEqual({ cols: 80, onEvent: ch.toJSON() });
    expect(String(out.args.onEvent)).toMatch(/^__CHANNEL__:\d+$/);
  });

  it('always passes some channel, as the Tauri command requires one', async () => {
    const { tauriBridgeArgs } = await import('./ipc');
    const out = tauriBridgeArgs('app_info', {});
    expect(out.events).toBeDefined();
    expect(out.args).toEqual({});
  });
});
