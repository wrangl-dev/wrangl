import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import type { AgentEvent } from '../lib/chat';
import { ChatStore } from '../lib/chat-store';
import type { Project } from '../lib/projects';
import { ChatHome } from './ChatHome';

let push: (e: AgentEvent) => void = () => {};
const calls: { cmd: string; args: unknown[] }[] = [];

vi.mock('../lib/agents', async (orig) => ({
  ...(await orig<typeof import('../lib/agents')>()),
  listAgents: () =>
    Promise.resolve([
      {
        id: 'fake',
        name: 'Fake Agent',
        version: '1',
        description: '',
        icon: null,
        website: null,
        launch: 'npx',
      },
    ]),
  loadSelectedAgent: () => 'fake',
  saveSelectedAgent: () => {},
}));

vi.mock('../lib/chat', async (orig) => ({
  ...(await orig<typeof import('../lib/chat')>()),
  startChat: (agentId: string, cwd: string, onEvent: (e: AgentEvent) => void) => {
    calls.push({ cmd: 'start', args: [agentId, cwd] });
    push = onEvent;
    return Promise.resolve('session-1');
  },
  sendPrompt: (...args: unknown[]) => {
    calls.push({ cmd: 'prompt', args });
    return Promise.resolve();
  },
  answerPermission: (...args: unknown[]) => {
    calls.push({ cmd: 'permission', args });
    return Promise.resolve();
  },
  cancelTurn: (...args: unknown[]) => {
    calls.push({ cmd: 'cancel', args });
    return Promise.resolve();
  },
  stopChat: (...args: unknown[]) => {
    calls.push({ cmd: 'stop', args });
    return Promise.resolve();
  },
}));

const project = { id: 'p', name: 'storefront', path: '/work/storefront' };

/** ChatHome plus the parent's job: remember which chat was created. */
function Harness({ project: p }: { project: Project | null }) {
  const [store] = useState(() => new ChatStore());
  const [chatId, setChatId] = useState<string | null>(null);
  return <ChatHome project={p} chatId={chatId} onChatCreated={setChatId} store={store} />;
}

describe('ChatHome', () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it('starts the agent in the project on the first message and streams the answer', async () => {
    render(<Harness project={project} />);
    await screen.findByRole('button', { name: /Fake Agent/ });

    const box = screen.getByRole('textbox', { name: 'Message' });
    fireEvent.change(box, { target: { value: 'Check a token' } });
    fireEvent.keyDown(box, { key: 'Enter' });

    expect(await screen.findByText('Check a token', { selector: '.msg-user' })).toBeInTheDocument();
    await vi.waitFor(() => expect(calls.map((c) => c.cmd)).toEqual(['start', 'prompt']));
    expect(calls[0].args).toEqual(['fake', '/work/storefront']);
    expect(calls[1].args).toEqual(['session-1', 'Check a token']);
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();

    act(() => {
      push({ kind: 'status', state: 'ready' });
      push({
        kind: 'update',
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'Looks safe.' },
        },
      });
      push({ kind: 'turnEnd', stopReason: 'end_turn' });
    });
    expect(screen.getByText('Looks safe.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(screen.getByLabelText('Chat title')).toHaveTextContent('Check a token');
  });

  it('shows a permission request and sends the choice', async () => {
    render(<Harness project={project} />);
    await screen.findByRole('button', { name: /Fake Agent/ });
    const box = screen.getByRole('textbox', { name: 'Message' });
    fireEvent.change(box, { target: { value: 'list files' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await vi.waitFor(() => expect(calls.some((c) => c.cmd === 'prompt')).toBe(true));

    act(() =>
      push({
        kind: 'permission',
        requestId: 'r1',
        toolCall: { title: 'Run ls' },
        options: [
          { optionId: 'allow', name: 'Allow', kind: 'allow_once' },
          { optionId: 'deny', name: 'Deny', kind: 'reject_once' },
        ],
      }),
    );
    expect(screen.getByText(/wants to: Run ls/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }));
    await vi.waitFor(() =>
      expect(calls.find((c) => c.cmd === 'permission')?.args).toEqual(['session-1', 'r1', 'allow']),
    );
  });

  it('stop cancels the turn', async () => {
    render(<Harness project={project} />);
    await screen.findByRole('button', { name: /Fake Agent/ });
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: 'go' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Stop' }));
    await vi.waitFor(() => expect(calls.some((c) => c.cmd === 'cancel')).toBe(true));
  });

  it('cannot send without a project', async () => {
    render(<Harness project={null} />);
    await screen.findByRole('button', { name: /Fake Agent/ });
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: 'hi' } });
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });
});
