import { type FormEvent, useState } from 'react';
import type { ChatMeta } from '../lib/chat-store';
import { type Project, projectColor } from '../lib/projects';
import { Icon } from './Icon';
import { Logo } from './Logo';

interface Props {
  projects: Project[];
  activeId: string | null;
  /** The open chat of the active project, or null for a new chat. */
  activeChatId: string | null;
  chatsOf: (projectId: string) => ChatMeta[];
  isBusy: (chatId: string) => boolean;
  onSelect: (projectId: string) => void;
  onSelectChat: (projectId: string, chatId: string | null) => void;
  onRemoveChat: (chatId: string) => void;
  /** Ask the OS for a folder; resolves to null when cancelled. Missing: type a path. */
  pickFolder?: () => Promise<string | null>;
  onAdd: (path: string) => void;
  onRemove: (id: string) => void;
}

export function Sidebar({
  projects,
  activeId,
  activeChatId,
  chatsOf,
  isBusy,
  onSelect,
  onSelectChat,
  onRemoveChat,
  pickFolder,
  onAdd,
  onRemove,
}: Props) {
  const [typing, setTyping] = useState(!pickFolder && projects.length === 0);
  const [path, setPath] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const tryAdd = (value: string) => {
    try {
      onAdd(value);
      setPath('');
      setError(null);
      setTyping(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    tryAdd(path);
  };

  const addClicked = async () => {
    if (!pickFolder) {
      setTyping((t) => !t);
      return;
    }
    const picked = await pickFolder().catch(() => null);
    if (picked) tryAdd(picked);
  };

  const toggle = (id: string) =>
    setCollapsed((c) => {
      const next = new Set(c);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <aside className="sidebar" aria-label="Projects">
      <header className="sidebar-brand">
        <Logo height={13} />
      </header>

      <div className="sidebar-section">
        <span>Projects</span>
        <button type="button" className="icon-button" aria-label="Add project" onClick={addClicked}>
          <Icon name="plus" size={14} />
        </button>
      </div>

      {typing && (
        <form className="add-project" onSubmit={submit}>
          <input
            autoFocus
            aria-label="Project folder"
            placeholder="Folder path, e.g. C:\work\app"
            value={path}
            onChange={(e) => setPath(e.target.value)}
          />
        </form>
      )}
      {error && <p className="field-error">{error}</p>}

      {projects.length === 0 && !typing && (
        <button type="button" className="sidebar-empty" onClick={addClicked}>
          Open a folder to start
        </button>
      )}

      <ul className="project-list">
        {projects.map((p, i) => {
          const open = !collapsed.has(p.id);
          const chats = chatsOf(p.id);
          const isActive = p.id === activeId;
          return (
            <li key={p.id} className="project" data-active={isActive}>
              <div className="project-row">
                <button
                  type="button"
                  className="project-toggle icon-button"
                  aria-label={open ? `Collapse ${p.name}` : `Expand ${p.name}`}
                  aria-expanded={open}
                  onClick={() => toggle(p.id)}
                >
                  <span className="chevron" data-open={open} aria-hidden="true">
                    ›
                  </span>
                </button>
                <button
                  type="button"
                  className="project-button"
                  aria-label={p.name}
                  aria-current={isActive ? 'true' : undefined}
                  title={p.path}
                  onClick={() => onSelect(p.id)}
                >
                  <span className="project-badge" style={{ background: projectColor(i) }}>
                    {p.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="project-name">{p.name}</span>
                </button>
                <button
                  type="button"
                  className="icon-button row-action"
                  aria-label={`New chat in ${p.name}`}
                  title="New chat"
                  onClick={() => onSelectChat(p.id, null)}
                >
                  <Icon name="plus" size={12} />
                </button>
                <button
                  type="button"
                  className="icon-button row-action"
                  aria-label={`Remove ${p.name}`}
                  title="Remove project"
                  onClick={() => onRemove(p.id)}
                >
                  <Icon name="close" size={12} />
                </button>
              </div>

              {open && chats.length > 0 && (
                <ul className="chat-list" aria-label={`Chats in ${p.name}`}>
                  {chats.map((c) => (
                    <li key={c.id} data-active={isActive && c.id === activeChatId}>
                      <button
                        type="button"
                        className="chat-button"
                        aria-current={isActive && c.id === activeChatId ? 'true' : undefined}
                        title={`${c.title} · ${c.agentName}`}
                        onClick={() => onSelectChat(p.id, c.id)}
                      >
                        {isBusy(c.id) && <span className="chat-busy" aria-label="working" />}
                        <span className="chat-title">{c.title}</span>
                      </button>
                      <button
                        type="button"
                        className="icon-button row-action"
                        aria-label={`Close chat ${c.title}`}
                        onClick={() => onRemoveChat(c.id)}
                      >
                        <Icon name="close" size={11} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
