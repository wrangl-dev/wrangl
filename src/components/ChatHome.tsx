import { type FormEvent, type KeyboardEvent, useCallback, useEffect, useState } from 'react';
import { type AgentSummary, listAgents, loadSelectedAgent, saveSelectedAgent } from '../lib/agents';
import type { Project } from '../lib/projects';
import { useChat } from '../lib/use-chat';
import { AgentPicker } from './AgentPicker';
import { ChatThread } from './ChatThread';
import { Icon } from './Icon';
import { Logo } from './Logo';

/** Starting points for a chat; clicking one fills the composer. */
export const SUGGESTIONS = [
  'Check a token on Robinhood Chain',
  'Show my wallet balance',
  'Find new pools from today',
  'Explain this project',
];

const PHASE_TEXT: Record<string, string> = {
  installing: 'Installing the agent…',
  starting: 'Starting the agent…',
  auth: 'Sign in to continue',
};

interface Props {
  project: Project | null;
}

/** The chat: an empty start screen, then the conversation with the chosen agent. */
export function ChatHome({ project }: Props) {
  const [draft, setDraft] = useState('');
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string | null>(() => loadSelectedAgent());

  const load = useCallback((refresh: boolean) => {
    setLoading(true);
    setError(null);
    listAgents(refresh)
      .then(setAgents)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => load(false), [load]);

  const agent = agents.find((a) => a.id === agentId) ?? null;
  const chat = useChat(agent?.id ?? null, project?.path ?? null);
  const { state } = chat;
  const started = state.items.length > 0;

  const choose = (id: string) => {
    setAgentId(id);
    saveSelectedAgent(id);
  };

  const canSend = Boolean(
    agent && project && draft.trim() && !state.busy && state.phase !== 'auth',
  );

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!canSend) return;
    const text = draft.trim();
    setDraft('');
    chat.send(text);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  let hint = '';
  if (!project) hint = 'Add a project first';
  else if (!agent) hint = '';
  else hint = PHASE_TEXT[state.phase] ?? '';

  return (
    <section className="chat-home" aria-label="Chat" data-started={started}>
      {started ? (
        <header className="chat-header">
          <span>{agent?.name ?? 'Chat'}</span>
          <button type="button" className="chat-new" onClick={chat.reset}>
            New chat
          </button>
        </header>
      ) : (
        <>
          <Logo height={30} className="chat-mark" />
          <h1>{project ? `What should we do in ${project.name}?` : 'Add a project to start'}</h1>
        </>
      )}

      {started && (
        <ChatThread
          state={state}
          agentName={agent?.name ?? 'Agent'}
          onAnswer={chat.answer}
          onSignIn={chat.signIn}
          loginSpawner={chat.loginSpawner}
        />
      )}

      <form className="composer" onSubmit={submit}>
        <textarea
          aria-label="Message"
          placeholder="Ask anything about your code or Robinhood Chain…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          rows={started ? 2 : 3}
        />
        <div className="composer-bar">
          <AgentPicker
            agents={agents}
            loading={loading}
            error={error}
            selectedId={agentId}
            onSelect={choose}
            onRetry={() => load(true)}
          />
          <span className="composer-hint">{hint}</span>
          {state.busy ? (
            <button
              type="button"
              className="send-button stop"
              aria-label="Stop"
              onClick={chat.cancel}
            >
              <span className="stop-square" />
            </button>
          ) : (
            <button type="submit" className="send-button" aria-label="Send" disabled={!canSend}>
              <Icon name="send" size={14} />
            </button>
          )}
        </div>
      </form>

      {!started && project && (
        <p className="composer-context">
          <Icon name="folder" size={13} />
          <span>{project.path}</span>
        </p>
      )}

      {!started && (
        <div className="suggestions">
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" onClick={() => setDraft(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
