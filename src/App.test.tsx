import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { App } from './App';
import { type ChatApi, ChatStore } from './lib/chat-store';
import { loadProjects } from './lib/projects';

vi.mock('./components/TerminalView', () => ({
  TerminalView: ({ cwd, active }: { cwd?: string; active: boolean }) => (
    <div data-testid="view" data-cwd={cwd} data-active={String(active)} />
  ),
}));

const quietApi: ChatApi = {
  startChat: async () => 'session',
  sendPrompt: async () => {},
  cancelTurn: async () => {},
  answerPermission: async () => {},
  authenticate: async () => {},
  stopChat: async () => {},
  startLogin: async () => 'pty',
  history: {
    list: async () => [],
    load: async () => {
      throw new Error('nothing saved');
    },
    save: async () => {},
    remove: async () => {},
  },
};

const sidebar = () => screen.getByRole('complementary', { name: 'Projects' });

/** Add projects through a fake OS folder picker. */
function renderWithFolders(paths: string[], store = new ChatStore(quietApi)) {
  const queue = [...paths];
  const pickFolder = vi.fn(async () => queue.shift() ?? null);
  const view = render(<App store={store} pickFolder={pickFolder} />);
  return { ...view, pickFolder, store };
}

async function addAll(count: number) {
  for (let i = 0; i < count; i++) {
    await act(async () => {
      fireEvent.click(within(sidebar()).getByRole('button', { name: 'Add project' }));
    });
  }
}

describe('App', () => {
  beforeEach(() => localStorage.clear());

  it('adds a project with the folder picker and names it in the heading', async () => {
    const { pickFolder } = renderWithFolders(['C:\\work\\storefront']);
    expect(screen.getByRole('heading', { name: 'Add a project to start' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Project folder' })).toBeNull();

    await addAll(1);
    expect(pickFolder).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('heading', { name: 'What should we do in storefront?' }),
    ).toBeInTheDocument();
    expect(within(sidebar()).getByRole('button', { name: 'storefront' })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  it('a cancelled picker adds nothing', async () => {
    renderWithFolders([]);
    await addAll(1);
    expect(loadProjects()).toEqual([]);
  });

  it('without a folder picker (browser mode) a path can be typed', () => {
    render(<App store={new ChatStore(quietApi)} />);
    const input = screen.getByRole('textbox', { name: 'Project folder' });
    fireEvent.change(input, { target: { value: '/srv/a' } });
    fireEvent.submit(input);
    expect(screen.getByRole('heading', { name: 'What should we do in a?' })).toBeInTheDocument();
  });

  it('remembers projects and the selected one across reloads', async () => {
    const first = renderWithFolders(['/srv/a', '/srv/b']);
    await addAll(2);
    fireEvent.click(within(sidebar()).getByRole('button', { name: 'a' }));
    first.unmount();

    render(<App store={new ChatStore(quietApi)} pickFolder={async () => null} />);
    expect(screen.getByRole('heading', { name: 'What should we do in a?' })).toBeInTheDocument();
    expect(within(sidebar()).getByRole('button', { name: 'b' })).toBeInTheDocument();
  });

  it('lists each project’s chats under it and keeps the open chat per project', async () => {
    const { store } = renderWithFolders(['/srv/a', '/srv/b']);
    await addAll(2);
    const [a, b] = loadProjects();
    await act(async () => {
      const chatA = store.create(a.id, 'claude', 'Claude');
      await store.send(chatA, 'Audit the token contract', a.path);
      const chatB = store.create(b.id, 'codex', 'Codex');
      await store.send(chatB, 'Find new pools', b.path);
    });

    const inA = within(sidebar()).getByRole('list', { name: 'Chats in a' });
    const inB = within(sidebar()).getByRole('list', { name: 'Chats in b' });
    expect(within(inA).getByText('Audit the token contract')).toBeInTheDocument();
    expect(within(inB).getByText('Find new pools')).toBeInTheDocument();

    fireEvent.click(within(inA).getByText('Audit the token contract'));
    expect(screen.getByLabelText('Chat title')).toHaveTextContent('Audit the token contract');

    fireEvent.click(within(inB).getByText('Find new pools'));
    expect(screen.getByLabelText('Chat title')).toHaveTextContent('Find new pools');

    // Back to project a by its name: its chat is still open.
    fireEvent.click(within(sidebar()).getByRole('button', { name: 'a' }));
    expect(screen.getByLabelText('Chat title')).toHaveTextContent('Audit the token contract');

    // "New chat" in a project shows the start screen for that project, and the new chat is
    // listed in the folder right away.
    fireEvent.click(within(sidebar()).getByRole('button', { name: 'New chat in b' }));
    expect(screen.getByRole('heading', { name: 'What should we do in b?' })).toBeInTheDocument();
    expect(within(inB).getByText('New chat')).toBeInTheDocument();
    expect(within(inA).queryByText('New chat')).toBeNull();
  });

  it('going to a chat or a project closes Wallet, Settings and Portfolio', async () => {
    const { store } = renderWithFolders(['/srv/a']);
    await addAll(1);
    const [a] = loadProjects();
    await act(async () => {
      const chat = store.create(a.id, 'claude', 'Claude');
      await store.send(chat, 'Audit the token contract', a.path);
    });
    const chats = within(sidebar()).getByRole('list', { name: 'Chats in a' });

    for (const page of ['Wallet', 'Settings', 'Portfolio']) {
      fireEvent.click(within(sidebar()).getByRole('button', { name: new RegExp(`^${page}$`) }));
      expect(screen.getByRole('region', { name: page })).toBeInTheDocument();
      fireEvent.click(within(chats).getByText('Audit the token contract'));
      expect(screen.queryByRole('region', { name: page })).toBeNull();
      expect(screen.getByLabelText('Chat title')).toHaveTextContent('Audit the token contract');
    }

    fireEvent.click(within(sidebar()).getByRole('button', { name: /^Settings$/ }));
    fireEvent.click(within(sidebar()).getByRole('button', { name: 'New chat in a' }));
    expect(screen.queryByRole('region', { name: 'Settings' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'What should we do in a?' })).toBeInTheDocument();

    fireEvent.click(within(sidebar()).getByRole('button', { name: /^Wallet$/ }));
    fireEvent.click(within(sidebar()).getByRole('button', { name: 'a' }));
    expect(screen.queryByRole('region', { name: 'Wallet' })).toBeNull();
  });

  it('closing a chat or removing a project stops its agents', async () => {
    const api = { ...quietApi, stopChat: vi.fn(async () => {}) };
    const { store } = renderWithFolders(['/srv/a'], new ChatStore(api));
    await addAll(1);
    const [a] = loadProjects();
    await act(async () => {
      await store.send(store.create(a.id, 'claude', 'Claude'), 'one', a.path);
      await store.send(store.create(a.id, 'claude', 'Claude'), 'two', a.path);
    });
    fireEvent.click(within(sidebar()).getByRole('button', { name: 'Close chat one' }));
    expect(within(sidebar()).queryByText('one')).toBeNull();
    fireEvent.click(within(sidebar()).getByRole('button', { name: 'Remove a' }));
    await vi.waitFor(() => expect(api.stopChat).toHaveBeenCalledTimes(2));
  });

  it('gives each project its own terminals and keeps them running', async () => {
    renderWithFolders(['/srv/a', '/srv/b']);
    await addAll(2);
    const toggle = screen.getByRole('button', { name: 'Terminal' });

    fireEvent.click(within(sidebar()).getByRole('button', { name: 'a' }));
    fireEvent.click(toggle);
    fireEvent.click(within(sidebar()).getByRole('button', { name: 'b' }));

    const views = screen.getAllByTestId('view');
    expect(views.map((v) => v.dataset.cwd)).toEqual(['/srv/a', '/srv/b']);
    expect(views.find((v) => v.dataset.cwd === '/srv/b')?.dataset.active).toBe('true');
    expect(views.find((v) => v.dataset.cwd === '/srv/a')?.dataset.active).toBe('false');

    fireEvent.keyDown(window, { key: '`', ctrlKey: true });
    expect(screen.queryByRole('region', { name: 'Terminal' })).toBeNull();
    expect(screen.getAllByTestId('view')).toHaveLength(2);
  });

  it('a suggestion fills the composer', () => {
    render(<App store={new ChatStore(quietApi)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show my wallet balance' }));
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('Show my wallet balance');
  });
});
