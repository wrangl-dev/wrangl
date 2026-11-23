import { useCallback, useEffect, useState } from 'react';
import { ChatHome } from './components/ChatHome';
import { Icon } from './components/Icon';
import { Sidebar } from './components/Sidebar';
import { TerminalTabs } from './components/TerminalTabs';
import { type AppInfo, BROWSER_APP_INFO, loadAppInfo } from './lib/app-info';
import {
  addProject,
  loadProjects,
  type Project,
  removeProject,
  saveProjects,
} from './lib/projects';

const ACTIVE_KEY = 'wrangl.activeProject.v1';

function readActive(projects: Project[]): string | null {
  try {
    const id = localStorage.getItem(ACTIVE_KEY);
    if (id && projects.some((p) => p.id === id)) return id;
  } catch {
    // Storage blocked: fall through to the first project.
  }
  return projects[0]?.id ?? null;
}

export function App() {
  const [info, setInfo] = useState<AppInfo>(BROWSER_APP_INFO);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>(() => loadProjects());
  const [activeId, setActiveId] = useState<string | null>(() => readActive(projects));
  const [terminalOpen, setTerminalOpen] = useState(false);

  useEffect(() => {
    loadAppInfo()
      .then(setInfo)
      .catch((e: unknown) => setError(String(e)));
  }, []);

  useEffect(() => saveProjects(projects), [projects]);
  useEffect(() => {
    try {
      if (activeId) localStorage.setItem(ACTIVE_KEY, activeId);
    } catch {
      // Not remembered across restarts; fine.
    }
  }, [activeId]);

  // Ctrl+` (Cmd+` on macOS) shows or hides the terminal, like most editors.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '`') {
        e.preventDefault();
        setTerminalOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const add = useCallback(
    (path: string) => {
      const next = addProject(projects, path);
      setProjects(next.list);
      setActiveId(next.project.id);
    },
    [projects],
  );

  const remove = useCallback(
    (id: string) => {
      const rest = removeProject(projects, id);
      setProjects(rest);
      if (id === activeId) setActiveId(rest[0]?.id ?? null);
    },
    [projects, activeId],
  );

  const active = projects.find((p) => p.id === activeId) ?? null;

  return (
    <div className="shell">
      <Sidebar
        projects={projects}
        activeId={activeId}
        onSelect={setActiveId}
        onAdd={add}
        onRemove={remove}
      />

      <main className="workspace">
        <ChatHome project={active} />
        <TerminalTabs
          visible={terminalOpen}
          cwd={active?.path}
          onHide={() => setTerminalOpen(false)}
        />
      </main>

      <footer className="statusbar">
        {active && (
          <span className="status-item" title={active.path}>
            <Icon name="folder" size={12} />
            {active.path}
          </span>
        )}
        <span className="status-spacer" />
        {error && <span className="error">{error}</span>}
        <span className="status-item">
          <Icon name="chain" size={12} />
          Robinhood Chain {info.chainId}
        </span>
        <span className="status-item muted">v{info.version}</span>
        <button
          type="button"
          className="status-button"
          aria-pressed={terminalOpen}
          title="Toggle terminal (Ctrl+`)"
          onClick={() => setTerminalOpen((open) => !open)}
        >
          <Icon name="terminal" size={12} />
          Terminal
        </button>
      </footer>
    </div>
  );
}
