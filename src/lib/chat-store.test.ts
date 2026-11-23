import type { AgentEvent } from './chat';
import { type ChatApi, ChatStore } from './chat-store';

function fakeApi() {
  const pushes = new Map<string, (e: AgentEvent) => void>();
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
  };
  return { api, pushes };
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
    expect(api.startChat).toHaveBeenCalledWith('claude', '/work/a', expect.any(Function));
    expect(api.sendPrompt).toHaveBeenNthCalledWith(
      1,
      's1:claude:/work/a',
      'Check   the token\nplease',
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
