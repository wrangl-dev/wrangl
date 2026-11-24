import { useEffect, useRef, useState } from 'react';
import type { ChatItem, ChatState } from '../lib/chat';
import { diffsIn } from '../lib/diff';
import type { PtyEvent, SpawnOptions } from '../lib/pty';
import { DiffView } from './DiffView';
import { Icon } from './Icon';
import { Markdown } from './Markdown';
import { TerminalView } from './TerminalView';

interface Props {
  state: ChatState;
  agentName: string;
  /** The project folder, so file changes show project-relative paths. */
  root?: string;
  onAnswer: (requestId: string, optionId: string | null) => void;
  onSignIn: (methodId: string) => void;
  loginSpawner: (
    methodId: string,
  ) => (options: SpawnOptions, onEvent: (event: PtyEvent) => void) => Promise<string>;
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'waiting',
  in_progress: 'running',
  completed: 'done',
  failed: 'failed',
};

function Item({ item, agentName, root }: { item: ChatItem; agentName: string; root?: string }) {
  switch (item.type) {
    case 'user':
      return (
        <div className="msg msg-user">
          {item.text}
          {item.files && item.files.length > 0 && (
            <div className="msg-files" aria-label="Attached files">
              {item.files.map((f) => (
                <span key={f} title={f}>
                  <Icon name="file" size={11} />
                  {f.split('/').pop()}
                </span>
              ))}
            </div>
          )}
        </div>
      );
    case 'agent':
      return (
        <div className="msg msg-agent">
          <span className="msg-who">{agentName}</span>
          <Markdown text={item.text} />
        </div>
      );
    case 'thought':
      return (
        <details className="msg-thought">
          <summary>Thinking</summary>
          <div className="msg-text">{item.text}</div>
        </details>
      );
    case 'tool':
      return (
        <>
          <div className="msg-tool" data-status={item.status}>
            <span className="tool-dot" aria-hidden="true" />
            <span className="tool-title">{item.title}</span>
            <span className="tool-status">{STATUS_LABEL[item.status] ?? item.status}</span>
          </div>
          {item.diffs && item.diffs.length > 0 && <DiffView diffs={item.diffs} root={root} />}
        </>
      );
    case 'plan':
      return (
        <ol className="msg-plan" aria-label="Plan">
          {item.entries.map((e) => (
            <li key={e.content} data-status={e.status}>
              {e.content}
            </li>
          ))}
        </ol>
      );
    case 'note':
      return (
        <div className={`msg-note ${item.tone === 'error' ? 'error' : 'muted'}`} role="status">
          {item.text}
        </div>
      );
  }
}

/** The conversation, the agent's open question (permission or sign-in), newest at the bottom. */
export function ChatThread({ state, agentName, root, onAnswer, onSignIn, loginSpawner }: Props) {
  const [login, setLogin] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end' });
  }, [state.items, state.permission, state.auth]);

  return (
    <div className="thread" aria-live="polite">
      {state.items.map((item, i) => (
        <Item key={i} item={item} agentName={agentName} root={root} />
      ))}

      {state.busy && !state.permission && <div className="msg-working">Working…</div>}

      {state.permission && (
        <div className="ask" role="group" aria-label="Permission request">
          <p>
            <strong>{agentName}</strong> wants to: {state.permission.toolCall.title ?? 'use a tool'}
          </p>
          {diffsIn(state.permission.toolCall.content).length > 0 && (
            // Review the edit before allowing it.
            <DiffView diffs={diffsIn(state.permission.toolCall.content)} root={root} open />
          )}
          <div className="ask-actions">
            {state.permission.options.map((o) => (
              <button
                key={o.optionId}
                type="button"
                data-kind={o.kind}
                onClick={() => onAnswer(state.permission?.requestId ?? '', o.optionId)}
              >
                {o.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {state.auth && (
        <div className="ask" role="group" aria-label="Sign in">
          <p>
            {agentName} needs you to sign in. {state.auth.message}
          </p>
          <div className="ask-actions">
            {state.auth.methods.map((m) => (
              <button
                key={m.id}
                type="button"
                title={m.description ?? ''}
                onClick={() => (m.type === 'terminal' ? setLogin(m.id) : onSignIn(m.id))}
              >
                {m.name}
              </button>
            ))}
          </div>
          {login && (
            <div className="login-terminal" aria-label="Sign-in terminal">
              <TerminalView
                active
                spawn={loginSpawner(login)}
                onExit={(code) => {
                  const method = login;
                  setLogin(null);
                  if (code === 0) onSignIn(method);
                }}
              />
            </div>
          )}
          <p className="muted">Finish the sign-in, then send your message again.</p>
        </div>
      )}
      <div ref={end} />
    </div>
  );
}
