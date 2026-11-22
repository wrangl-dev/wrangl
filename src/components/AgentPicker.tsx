import { useEffect, useMemo, useRef, useState } from 'react';
import { type AgentSummary, filterAgents } from '../lib/agents';

interface Props {
  agents: AgentSummary[];
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRetry: () => void;
}

function AgentIcon({ agent }: { agent: AgentSummary }) {
  const [broken, setBroken] = useState(false);
  if (!agent.icon || broken) {
    return <span className="agent-icon agent-icon-letter">{agent.name.charAt(0)}</span>;
  }
  return <img className="agent-icon" src={agent.icon} alt="" onError={() => setBroken(true)} />;
}

/** Choose which agent the composer talks to, from the ACP Registry. */
export function AgentPicker({ agents, loading, error, selectedId, onSelect, onRetry }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const selected = agents.find((a) => a.id === selectedId) ?? null;
  const shown = useMemo(() => filterAgents(agents, query), [agents, query]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  let label = 'Choose an agent';
  if (selected) label = selected.name;
  else if (loading) label = 'Loading agents…';
  else if (error) label = 'Agents unavailable';

  return (
    <div className="agent-picker" ref={root}>
      <button
        type="button"
        className="agent-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {selected && <AgentIcon agent={selected} />}
        <span>{label}</span>
        <span className="agent-caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <div className="agent-menu">
          <input
            autoFocus
            aria-label="Search agents"
            placeholder={`Search ${agents.length} agents`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {error && (
            <div className="agent-error">
              <span>{error}</span>
              <button type="button" onClick={onRetry}>
                Retry
              </button>
            </div>
          )}
          <ul role="listbox" aria-label="Agents">
            {shown.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={a.id === selectedId}
                  disabled={a.launch === null}
                  title={a.launch === null ? 'No build for this computer' : a.description}
                  onClick={() => {
                    onSelect(a.id);
                    setOpen(false);
                  }}
                >
                  <AgentIcon agent={a} />
                  <span className="agent-name">{a.name}</span>
                  <span className="agent-meta">
                    {a.launch === null ? 'not for this OS' : a.version}
                  </span>
                </button>
              </li>
            ))}
            {!loading && shown.length === 0 && !error && (
              <li className="agent-empty">No agent matches “{query}”</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
