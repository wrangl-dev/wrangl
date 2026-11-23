import { type ChatAction, type ChatState, chatReducer, initialChat } from './chat';

const run = (...actions: ChatAction[]): ChatState => actions.reduce(chatReducer, initialChat);
const chunk = (text: string): ChatAction => ({
  kind: 'update',
  update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } },
});

describe('chatReducer', () => {
  it('goes through start-up phases', () => {
    expect(run({ kind: 'status', state: 'installing' }).phase).toBe('installing');
    expect(
      run({ kind: 'status', state: 'starting' }, { kind: 'status', state: 'ready' }).phase,
    ).toBe('ready');
  });

  it('joins streamed text into one answer after the question', () => {
    const s = run({ kind: 'sent', text: 'hi' }, chunk('Hel'), chunk('lo'));
    expect(s.busy).toBe(true);
    expect(s.items).toEqual([
      { type: 'user', text: 'hi' },
      { type: 'agent', text: 'Hello' },
    ]);
  });

  it('keeps thoughts apart from the answer', () => {
    const s = run(
      {
        kind: 'update',
        update: { sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'hmm' } },
      },
      chunk('Done'),
    );
    expect(s.items.map((i) => i.type)).toEqual(['thought', 'agent']);
  });

  it('tracks a tool call through its updates', () => {
    const s = run(
      {
        kind: 'update',
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: 't1',
          title: 'Run ls',
          status: 'pending',
        },
      },
      {
        kind: 'update',
        update: { sessionUpdate: 'tool_call_update', toolCallId: 't1', status: 'completed' },
      },
    );
    expect(s.items).toEqual([
      { type: 'tool', id: 't1', title: 'Run ls', kind: 'other', status: 'completed' },
    ]);
  });

  it('keeps one plan, the latest', () => {
    const plan = (status: string): ChatAction => ({
      kind: 'update',
      update: { sessionUpdate: 'plan', entries: [{ content: 'Read files', status }] },
    });
    const s = run(plan('pending'), chunk('x'), plan('completed'));
    expect(s.items.filter((i) => i.type === 'plan')).toEqual([
      { type: 'plan', entries: [{ content: 'Read files', status: 'completed' }] },
    ]);
  });

  it('holds a permission request until the turn ends', () => {
    const asked = run(
      { kind: 'sent', text: 'go' },
      {
        kind: 'permission',
        requestId: 'r1',
        toolCall: { title: 'Run ls' },
        options: [{ optionId: 'allow', name: 'Allow', kind: 'allow_once' }],
      },
    );
    expect(asked.permission?.requestId).toBe('r1');
    const done = chatReducer(asked, { kind: 'turnEnd', stopReason: 'end_turn' });
    expect(done.permission).toBeNull();
    expect(done.busy).toBe(false);
  });

  it('notes a stopped turn, errors and the agent going away', () => {
    expect(
      run({ kind: 'sent', text: 'x' }, { kind: 'turnEnd', stopReason: 'cancelled' }).items.at(-1),
    ).toEqual({ type: 'note', text: 'Stopped', tone: 'info' });
    expect(run({ kind: 'error', message: 'boom' }).items).toEqual([
      { type: 'note', text: 'boom', tone: 'error' },
    ]);
    const gone = run({ kind: 'sent', text: 'x' }, { kind: 'exit', message: 'npx was not found' });
    expect(gone.phase).toBe('exited');
    expect(gone.busy).toBe(false);
  });

  it('asks for sign-in and clears it once ready', () => {
    const auth = run({
      kind: 'authRequired',
      methods: [{ id: 'login', name: 'Log in' }],
      message: 'Authentication required',
    });
    expect(auth.phase).toBe('auth');
    expect(chatReducer(auth, { kind: 'status', state: 'ready' }).auth).toBeNull();
  });

  it('ignores updates it does not show', () => {
    expect(run({ kind: 'update', update: { sessionUpdate: 'available_commands_update' } })).toEqual(
      initialChat,
    );
  });
});
