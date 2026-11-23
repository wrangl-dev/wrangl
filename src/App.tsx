import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChatHome } from './components/ChatHome';
import { Icon } from './components/Icon';
import { Sidebar } from './components/Sidebar';
import { TerminalTabs } from './components/TerminalTabs';
import { type AppInfo, BROWSER_APP_INFO, loadAppInfo } from './lib/app-info';
import { type ChatStore, chatStore, useChatStore } from './lib/chat-store';
import { folderPicker } from './lib/folders';
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

interface Props {
  store?: ChatStore;
  pickFolder?: () => Promise<string | null>;
}

export function App({ store = chatStore, pickFolder }: Props) {
  useChatStore(store);
  const picker = useMemo(() => pickFolder ?? folderPicker(), [pickFolder]);
  const [info, setInfo] = useState<AppInfo>(BROWSER_APP_INFO);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>(() => loadProjects());
  const [activeId, setActiveId] = useState<string | null>(() => readActive(projects));
  // The open chat per project; missing or null means "new chat".
  const [openChat, setOpenChat] = useState<Record<string, string | null>>({});
  // Projects whose terminal panel exists; their shells keep running when another is shown.
  const [terminalProjects, setTerminalProjects] = useState<string[]>([]);
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

  // A project gets its terminals the first time the panel is shown for it.
  useEffect(() => {
    if (terminalOpen && activeId && !terminalProjects.includes(activeId)) {
      setTerminalProjects((list) => [...list, activeId]);
    }
  }, [terminalOpen, activeId, terminalProjects]);

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
      store.removeProject(id);
      setTerminalProjects((list) => list.filter((p) => p !== id));
      if (id === activeId) setActiveId(rest[0]?.id ?? null);
    },
    [projects, activeId, store],
  );

  const selectChat = (projectId: string, chatId: string | null) => {
    setActiveId(projectId);
    setOpenChat((m) => ({ ...m, [projectId]: chatId }));
  };

  const removeChat = (chatId: string) => {
    store.remove(chatId);
    setOpenChat((m) =>
      Object.fromEntries(Object.entries(m).map(([p, c]) => [p, c === chatId ? null : c])),
    );
  };

  const active = projects.find((p) => p.id === activeId) ?? null;
  const activeChatId = active ? (openChat[active.id] ?? null) : null;

  return (
    <div className="shell">
      <Sidebar
        projects={projects}
        activeId={activeId}
        activeChatId={activeChatId}
        chatsOf={(id) => store.list(id)}
        isBusy={(id) => store.busy(id)}
        onSelect={setActiveId}
        onSelectChat={selectChat}
        onRemoveChat={removeChat}
        pickFolder={picker}
        onAdd={add}
        onRemove={remove}
      />

      <main className="workspace">
        <ChatHome
          // A fresh composer per project and chat.
          key={`${active?.id ?? 'none'}:${activeChatId ?? 'new'}`}
          project={active}
          chatId={activeChatId}
          onChatCreated={(id) => active && selectChat(active.id, id)}
          store={store}
        />
        {projects
          .filter((p) => terminalProjects.includes(p.id))
          .map((p) => (
            <TerminalTabs
              key={p.id}
              visible={terminalOpen && p.id === activeId}
              cwd={p.path}
              onHide={() => setTerminalOpen(false)}
            />
          ))}
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
