import { type FormEvent, useState } from 'react';
import { type Project, projectColor } from '../lib/projects';
import { Icon } from './Icon';
import { Logo } from './Logo';

interface Props {
  projects: Project[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onAdd: (path: string) => void;
  onRemove: (id: string) => void;
  settingsOpen?: boolean;
  onOpenSettings?: () => void;
}

export function Sidebar({
  projects,
  activeId,
  onSelect,
  onAdd,
  onRemove,
  settingsOpen = false,
  onOpenSettings,
}: Props) {
  const [adding, setAdding] = useState(projects.length === 0);
  const [path, setPath] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    try {
      onAdd(path);
      setPath('');
      setError(null);
      setAdding(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <aside className="sidebar" aria-label="Projects">
      <header className="sidebar-brand">
        <Logo height={13} />
      </header>

      <div className="sidebar-section">
        <span>Projects</span>
        <button
          type="button"
          className="icon-button"
          aria-label="Add project"
          onClick={() => setAdding((a) => !a)}
        >
          <Icon name="plus" size={14} />
        </button>
      </div>

      {adding && (
        <form className="add-project" onSubmit={submit}>
          <input
            autoFocus
            aria-label="Project folder"
            placeholder="Folder path, e.g. C:\work\app"
            value={path}
            onChange={(e) => setPath(e.target.value)}
          />
          {error && <p className="field-error">{error}</p>}
        </form>
      )}

      <ul className="project-list">
        {projects.map((p, i) => (
          <li key={p.id} data-active={p.id === activeId}>
            <button
              type="button"
              className="project-button"
              aria-label={p.name}
              aria-current={p.id === activeId ? 'true' : undefined}
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
              className="icon-button project-remove"
              aria-label={`Remove ${p.name}`}
              onClick={() => onRemove(p.id)}
            >
              <Icon name="close" size={12} />
            </button>
          </li>
        ))}
      </ul>

      {onOpenSettings && (
        <footer className="sidebar-foot">
          <button
            type="button"
            className="sidebar-link"
            aria-pressed={settingsOpen}
            onClick={onOpenSettings}
          >
            <Icon name="settings" size={14} />
            Settings
          </button>
        </footer>
      )}
    </aside>
  );
}
