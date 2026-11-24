import type { AgentEvent } from './chat';
import { type ChatApi, ChatStore, NOT_RESUMED, SAVE_DELAY_MS } from './chat-store';
import type { ChatRecord } from './history';

function fakeApi(saved: ChatRecord[] = []) {
  const pushes = new Map<string, (e: AgentEvent) => void>();
  const disk = new Map(saved.map((r) => [r.id, r]));
  let n = 0;
  const api: ChatApi = {
    startChat: vi.fn(async (agentId, cwd, onEvent) => {
      const id = `s${++n}:${agentId}:${cwd}`;
      pushes.set(id, onEvent);
      return id;
    }),
    sendPrompt: vi.fn(async () => {}),
    cancelTurn: vi.fn(async () => {}),
    answerPermission: vi.fn(async () => {}),
    authenticate: vi.fn(async () => {}),
    stopChat: vi.fn(async () => {}),
    startLogin: vi.fn(async () => 'pty'),
    history: {
      list: vi.fn(async () => [...disk.values()].map(({ items: _, ...meta }) => meta)),
      load: vi.fn(async (id: string) => {
        const record = disk.get(id);
        if (!record) throw new Error(`no chat ${id}`);
        return record;
      }),
      save: vi.fn(async (record: ChatRecord) => {
        disk.set(record.id, record);
      }),
      remove: vi.fn(async (id: string) => {
        disk.delete(id);
      }),
    },
  };
  return { api, pushes, disk };
}

const chunk = (text: string): AgentEvent => ({
  kind: 'update',
  update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } },
});

describe('ChatStore', () => {
  it('keeps chats per project, newest first', () => {
    const store = new ChatStore(fakeApi().api);
    const a1 = store.create('A', 'claude', 'Claude');
    const b1 = store.create('B', 'codex', 'Codex');
    const a2 = store.create('A', 'codex', 'Codex');
    expect(store.list('A').map((c) => c.id)).toEqual([a2, a1]);
    expect(store.list('B').map((c) => c.id)).toEqual([b1]);
  });

  it('starts the agent once, in the project folder, and names the chat after the first message', async () => {
    const { api } = fakeApi();
    const store = new ChatStore(api);
    const id = store.create('A', 'claude', 'Claude');
    await store.send(id, 'Check   the token\nplease', '/work/a');
    await store.send(id, 'and again', '/work/a');
    expect(api.startChat).toHaveBeenCalledTimes(1);
    expect(api.startChat).toHaveBeenCalledWith(
      'claude',
      '/work/a',
      expect.any(Function),
      undefined,
    );
    expect(api.sendPrompt).toHaveBeenNthCalledWith(
      1,
      's1:claude:/work/a',
      'Check   the token\nplease',
      [],
      '/work/a',
    );
    expect(store.get(id)?.meta.title).toBe('Check the token please');
  });

  it('routes each agent’s events to its own chat', async () => {
    const { api, pushes } = fakeApi();
    const store = new ChatStore(api);
    const one = store.create('A', 'claude', 'Claude');
    const two = store.create('B', 'codex', 'Codex');
    await store.send(one, 'hi', '/a');
    await store.send(two, 'yo', '/b');
    pushes.get('s1:claude:/a')?.(chunk('from one'));
    pushes.get('s2:codex:/b')?.(chunk('from two'));
    expect(store.get(one)?.state.items.at(-1)).toEqual({ type: 'agent', text: 'from one' });
    expect(store.get(two)?.state.items.at(-1)).toEqual({ type: 'agent', text: 'from two' });
    expect(store.busy(one)).toBe(true);
  });

  it('notifies subscribers and stops agents when chats or projects close', async () => {
    const { api } = fakeApi();
    const store = new ChatStore(api);
    const seen = vi.fn();
    store.subscribe(seen);
    const id = store.create('A', 'claude', 'Claude');
    await store.send(id, 'hi', '/a');
    store.create('A', 'codex', 'Codex');
    expect(seen).toHaveBeenCalled();

    store.removeProject('A');
    expect(store.list('A')).toEqual([]);
    await vi.waitFor(() => expect(api.stopChat).toHaveBeenCalledWith('s1:claude:/a'));
  });

  it('a failed start shows in the chat and the next message retries', async () => {
    const { api } = fakeApi();
    vi.mocked(api.startChat).mockRejectedValueOnce(new Error('npx was not found'));
    const store = new ChatStore(api);
    const id = store.create('A', 'claude', 'Claude');
    await store.send(id, 'hi', '/a');
    expect(store.get(id)?.state.items.some((i) => i.type === 'note')).toBe(true);
    await store.send(id, 'again', '/a');
    expect(api.startChat).toHaveBeenCalledTimes(2);
  });
});

const SAVED: ChatRecord = {
  id: 'c1',
  projectId: 'A',
  agentId: 'claude',
  agentName: 'Claude',
  title: 'Check the token',
  createdAt: 10,
  updatedAt: 20,
  agentSessionId: 'agent-7',
  items: [
    { type: 'user', text: 'Check the token' },
    { type: 'agent', text: 'Owner renounced.' },
  ],
};

describe('ChatStore files', () => {
  it('sends mentioned files with the message and keeps them on it', async () => {
    const { api } = fakeApi();
    const store = new ChatStore(api);
    const id = store.create('A', 'claude', 'Claude');
    await store.send(id, 'read @src/App.tsx', '/work/a', ['src/App.tsx']);
    expect(api.sendPrompt).toHaveBeenCalledWith(
      's1:claude:/work/a',
      'read @src/App.tsx',
      ['src/App.tsx'],
      '/work/a',
    );
    expect(store.get(id)?.state.items[0]).toEqual({
      type: 'user',
      text: 'read @src/App.tsx',
      files: ['src/App.tsx'],
    });
  });
});

describe('ChatStore history', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('saves a chat once its answer has settled, with the agent session', async () => {
    const { api, pushes, disk } = fakeApi();
    const store = new ChatStore(api);
    const id = store.create('A', 'claude', 'Claude');
    expect(api.history.save).not.toHaveBeenCalled();

    await store.send(id, 'hi', '/a');
    const push = pushes.get('s1:claude:/a');
    push?.({ kind: 'session', agentSessionId: 'agent-1', resumed: false });
    push?.(chunk('hel'));
    push?.(chunk('lo'));
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS + 10);

    expect(api.history.save).toHaveBeenCalledTimes(1);
    expect(disk.get(id)).toMatchObject({
      title: 'hi',
      agentSessionId: 'agent-1',
      items: [
        { type: 'user', text: 'hi' },
        { type: 'agent', text: 'hello' },
      ],
    });
  });

  it('lists saved chats after a restart and reads their messages when opened', async () => {
    const { api } = fakeApi([SAVED]);
    const store = new ChatStore(api);
    await store.restore();
    expect(store.list('A').map((c) => c.title)).toEqual(['Check the token']);
    expect(api.history.load).not.toHaveBeenCalled();

    expect(store.get('c1')?.state.items).toEqual([]);
    await vi.waitFor(() => expect(store.get('c1')?.state.items).toHaveLength(2));
    expect(api.history.load).toHaveBeenCalledTimes(1);
  });

  it('continues the agent session and skips the replay of what is already shown', async () => {
    const { api, pushes } = fakeApi([SAVED]);
    const store = new ChatStore(api);
    await store.restore();
    await store.send('c1', 'and the pools?', '/a');
    expect(api.startChat).toHaveBeenCalledWith('claude', '/a', expect.any(Function), 'agent-7');

    const push = pushes.get('s1:claude:/a');
    push?.(chunk('Owner renounced.'));
    push?.({ kind: 'session', agentSessionId: 'agent-7', resumed: true });
    push?.(chunk('Two pools.'));
    const items = store.get('c1')?.state.items ?? [];
    expect(items.map((i) => ('text' in i ? i.text : i.type))).toEqual([
      'Check the token',
      'Owner renounced.',
      'and the pools?',
      'Two pools.',
    ]);
  });

  it('says so when the agent could not continue the session', async () => {
    const { api, pushes } = fakeApi([SAVED]);
    const store = new ChatStore(api);
    await store.restore();
    await store.send('c1', 'and the pools?', '/a');
    pushes.get('s1:claude:/a')?.({ kind: 'session', agentSessionId: 'new-1', resumed: false });
    expect(store.get('c1')?.state.items).toContainEqual({
      type: 'note',
      text: NOT_RESUMED,
      tone: 'info',
    });
    expect(store.get('c1')?.meta.agentSessionId).toBe('new-1');
  });

  it('deleting a chat forgets its saved messages', async () => {
    const { api, disk } = fakeApi([SAVED]);
    const store = new ChatStore(api);
    await store.restore();
    store.remove('c1');
    await vi.waitFor(() => expect(disk.has('c1')).toBe(false));
  });

  it('works without a backend: chats just are not kept', async () => {
    const { api } = fakeApi();
    vi.mocked(api.history.list).mockRejectedValueOnce(new Error('no backend'));
    const store = new ChatStore(api);
    await store.restore();
    expect(store.list('A')).toEqual([]);
  });
});
