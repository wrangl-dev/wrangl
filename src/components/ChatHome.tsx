import { type FormEvent, type KeyboardEvent, useCallback, useEffect, useState } from 'react';
import { type AgentSummary, listAgents, loadSelectedAgent, saveSelectedAgent } from '../lib/agents';
import { initialChat } from '../lib/chat';
import { type ChatStore, chatStore, useChatStore } from '../lib/chat-store';
import type { Project } from '../lib/projects';
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
  /** The open chat, or null for a new one in `project`. */
  chatId: string | null;
  /** A new chat got its first message. */
  onChatCreated: (chatId: string) => void;
  store?: ChatStore;
}

/** The chat area: a start screen for a new chat, or the conversation of an existing one. */
export function ChatHome({ project, chatId, onChatCreated, store = chatStore }: Props) {
  useChatStore(store);
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

  const chat = store.get(chatId);
  const state = chat?.state ?? initialChat;
  // An existing chat keeps the agent it started with; a new chat uses the picker.
  const pickedAgent = agents.find((a) => a.id === (chat?.meta.agentId ?? agentId)) ?? null;
  const agentName = chat?.meta.agentName ?? pickedAgent?.name ?? 'Agent';
  const started = state.items.length > 0;

  const choose = (id: string) => {
    setAgentId(id);
    saveSelectedAgent(id);
  };

  const canSend = Boolean(
    (chat || pickedAgent) && project && draft.trim() && !state.busy && state.phase !== 'auth',
  );

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!canSend || !project) return;
    const text = draft.trim();
    setDraft('');
    let id = chatId;
    if (!id || !chat) {
      if (!pickedAgent) return;
      id = store.create(project.id, pickedAgent.id, pickedAgent.name);
      onChatCreated(id);
    }
    store.send(id, text, project.path);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  let hint = '';
  if (!project) hint = 'Add a project first';
  else if (chat || pickedAgent) hint = PHASE_TEXT[state.phase] ?? '';

  return (
    <section className="chat-home" aria-label="Chat" data-started={started}>
      {started ? (
        <header className="chat-header" aria-label="Chat title">
          <span>{chat?.meta.title ?? agentName}</span>
          <span className="muted">{agentName}</span>
        </header>
      ) : (
        <>
          <Logo height={30} className="chat-mark" />
          <h1>{project ? `What should we do in ${project.name}?` : 'Add a project to start'}</h1>
        </>
      )}

      {started && chat && (
        <ChatThread
          state={state}
          agentName={agentName}
          onAnswer={(requestId, optionId) => store.answer(chat.meta.id, requestId, optionId)}
          onSignIn={(methodId) => store.signIn(chat.meta.id, methodId)}
          loginSpawner={(methodId) => store.loginSpawner(chat.meta.id, methodId)}
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
          {chat ? (
            <span className="agent-fixed">{agentName}</span>
          ) : (
            <AgentPicker
              agents={agents}
              loading={loading}
              error={error}
              selectedId={agentId}
              onSelect={choose}
              onRetry={() => load(true)}
            />
          )}
          <span className="composer-hint">{hint}</span>
          {state.busy && chat ? (
            <button
              type="button"
              className="send-button stop"
              aria-label="Stop"
              onClick={() => store.cancel(chat.meta.id)}
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
