import { useCallback, useEffect, useState } from 'react';
import { type AgentSummary, listAgents, loadSelectedAgent, saveSelectedAgent } from '../lib/agents';
import type { Project } from '../lib/projects';
import { AgentPicker } from './AgentPicker';
import { Icon } from './Icon';
import { Logo } from './Logo';

/** Starting points for a chat; clicking one fills the composer. */
export const SUGGESTIONS = [
  'Check a token on Robinhood Chain',
  'Show my wallet balance',
  'Find new pools from today',
  'Explain this project',
];

interface Props {
  project: Project | null;
}

/** The empty chat: what an agent should do, in which project. Sending arrives with ACP chat. */
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

  const choose = (id: string) => {
    setAgentId(id);
    saveSelectedAgent(id);
  };
  const agent = agents.find((a) => a.id === agentId) ?? null;

  return (
    <section className="chat-home" aria-label="Chat">
      <Logo height={30} className="chat-mark" />
      <h1>{project ? `What should we do in ${project.name}?` : 'Add a project to start'}</h1>

      <form className="composer" onSubmit={(e) => e.preventDefault()}>
        <textarea
          aria-label="Message"
          placeholder="Ask anything about your code or Robinhood Chain…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
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
          <span className="composer-hint">
            {agent ? `Chat with ${agent.name} arrives in the next update` : ''}
          </span>
          <button
            type="submit"
            className="send-button"
            aria-label="Send"
            disabled
            title="Agents arrive in the next update"
          >
            <Icon name="send" size={14} />
          </button>
        </div>
      </form>

      {project && (
        <p className="composer-context">
          <Icon name="folder" size={13} />
          <span>{project.path}</span>
        </p>
      )}

      <div className="suggestions">
        {SUGGESTIONS.map((s) => (
          <button key={s} type="button" onClick={() => setDraft(s)}>
            {s}
          </button>
        ))}
      </div>
    </section>
  );
}
