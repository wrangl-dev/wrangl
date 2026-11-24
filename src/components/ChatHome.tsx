import {
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { type AgentSummary, listAgents, loadSelectedAgent, saveSelectedAgent } from '../lib/agents';
import { initialChat } from '../lib/chat';
import { type ChatStore, chatStore, useChatStore } from '../lib/chat-store';
import {
  activeMention,
  insertMention,
  type Mention,
  mentionedFiles,
  searchFiles,
} from '../lib/mentions';
import type { Project } from '../lib/projects';
import { AgentPicker } from './AgentPicker';
import { ChatThread } from './ChatThread';
import { Icon } from './Icon';
import { Logo } from './Logo';

/** Starting points for a chat; clicking one fills the composer. */
export const SUGGESTIONS = [
  'What is trending on Robinhood Chain in the last hour?',
  'Show the newest Pons launches and flag the risky ones',
  'Research a token: ',
  'Show my wallet balance',
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
  /** Text to start the composer with (a research request from the watchlist). */
  initialDraft?: string;
  /** Project file search for `@` mentions; swapped in tests. */
  findFiles?: (cwd: string, query: string) => Promise<string[]>;
}

/** Waits this long after a keystroke before searching files. */
const SEARCH_DELAY_MS = 120;

/** The `@` file menu: what was typed, what matched, which one is highlighted. */
function useFileMention(
  cwd: string | null,
  findFiles: (cwd: string, query: string) => Promise<string[]>,
) {
  const [mention, setMention] = useState<Mention | null>(null);
  const [matches, setMatches] = useState<string[]>([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!mention || !cwd) {
      setMatches([]);
      return;
    }
    let live = true;
    const timer = setTimeout(() => {
      findFiles(cwd, mention.query)
        .then((found) => {
          if (!live) return;
          setMatches(found.slice(0, 8));
          setIndex(0);
        })
        .catch(() => live && setMatches([]));
    }, SEARCH_DELAY_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [mention, cwd, findFiles]);

  return { mention, setMention, matches, index, setIndex };
}

/** The chat area: a start screen for a new chat, or the conversation of an existing one. */
export function ChatHome({
  project,
  chatId,
  onChatCreated,
  store = chatStore,
  findFiles = searchFiles,
  initialDraft = '',
}: Props) {
  useChatStore(store);
  const [draft, setDraft] = useState(initialDraft);
  const [picked, setPicked] = useState<string[]>([]);
  const box = useRef<HTMLTextAreaElement>(null);
  const files = useFileMention(project?.path ?? null, findFiles);
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
    const attached = mentionedFiles(text, picked);
    setDraft('');
    setPicked([]);
    files.setMention(null);
    let id = chatId;
    if (!id || !chat) {
      if (!pickedAgent) return;
      id = store.create(project.id, pickedAgent.id, pickedAgent.name);
      onChatCreated(id);
    }
    store.send(id, text, project.path, attached);
  };

  const edit = (text: string, caret: number) => {
    setDraft(text);
    files.setMention(project ? activeMention(text, caret) : null);
  };

  const pick = (path: string) => {
    if (!files.mention) return;
    const next = insertMention(draft, files.mention, path);
    setDraft(next.text);
    setPicked((list) => [...list, path]);
    files.setMention(null);
    requestAnimationFrame(() => {
      box.current?.focus();
      box.current?.setSelectionRange(next.caret, next.caret);
    });
  };

  const menuOpen = files.mention !== null && files.matches.length > 0;

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (menuOpen) {
      const n = files.matches.length;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        files.setIndex((i) => (i + (e.key === 'ArrowDown' ? 1 : n - 1)) % n);
        return;
      }
      if ((e.key === 'Enter' || e.key === 'Tab') && !e.nativeEvent.isComposing) {
        e.preventDefault();
        pick(files.matches[files.index]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        files.setMention(null);
        return;
      }
    }
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
          root={project?.path}
          onAnswer={(requestId, optionId) => store.answer(chat.meta.id, requestId, optionId)}
          onSignIn={(methodId) => store.signIn(chat.meta.id, methodId)}
          loginSpawner={(methodId) => store.loginSpawner(chat.meta.id, methodId)}
        />
      )}

      <form className="composer" onSubmit={submit}>
        {menuOpen && (
          <ul className="mention-menu" role="listbox" aria-label="Files">
            {files.matches.map((path, i) => (
              <li key={path}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === files.index}
                  // Keep the focus in the message box.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(path)}
                >
                  <Icon name="file" size={13} />
                  <span className="mention-name">{path.split('/').pop()}</span>
                  <span className="mention-path">{path}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <textarea
          ref={box}
          aria-label="Message"
          placeholder="Ask anything about your code or Robinhood Chain… Type @ to add a file."
          value={draft}
          onChange={(e) => edit(e.target.value, e.target.selectionStart)}
          onKeyDown={onKeyDown}
          onBlur={() => files.setMention(null)}
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
