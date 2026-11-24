import { useSyncExternalStore } from 'react';
import {
  type AgentEvent,
  answerPermission,
  authenticate,
  type ChatAction,
  type ChatState,
  cancelTurn,
  chatReducer,
  initialChat,
  sendPrompt,
  startChat,
  startLogin,
  stopChat,
} from './chat';
import { type ChatRecord, type HistoryApi, historyApi } from './history';
import type { PtyEvent, SpawnOptions } from './pty';

/** What the sidebar lists for one chat. */
export interface ChatMeta {
  id: string;
  projectId: string;
  agentId: string;
  agentName: string;
  /** The first message, shortened; "New chat" until one is sent. */
  title: string;
  createdAt: number;
  /** The agent's own session id, saved so the chat can continue after a restart. */
  agentSessionId?: string;
}

interface Entry {
  meta: ChatMeta;
  state: ChatState;
  session: Promise<string> | null;
  /** False for a saved chat whose messages are not read from disk yet. */
  loaded: boolean;
  /** Loading an earlier session: the agent replays it, but the saved messages already show it. */
  replaying: boolean;
  saveTimer: ReturnType<typeof setTimeout> | null;
}

/** The chat backend calls, so tests can swap them. */
export interface ChatApi {
  startChat: (
    agentId: string,
    cwd: string,
    onEvent: (e: AgentEvent) => void,
    resume?: string,
  ) => Promise<string>;
  sendPrompt: (sessionId: string, text: string, files: string[], cwd: string) => Promise<void>;
  cancelTurn: (sessionId: string) => Promise<void>;
  answerPermission: (
    sessionId: string,
    requestId: string,
    optionId: string | null,
  ) => Promise<void>;
  authenticate: (sessionId: string, methodId: string) => Promise<void>;
  stopChat: (sessionId: string) => Promise<void>;
  startLogin: typeof startLogin;
  history: HistoryApi;
}

const realApi: ChatApi = {
  startChat,
  sendPrompt,
  cancelTurn,
  answerPermission,
  authenticate,
  stopChat,
  startLogin,
  history: historyApi,
};

const TITLE_LENGTH = 48;
/** Saves wait this long after the last change, so a streaming answer is written once. */
export const SAVE_DELAY_MS = 400;
export const NOT_RESUMED =
  'The agent started a new session, so it does not remember the messages above. Repeat what it needs to know.';
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Every chat in every project. A chat's agent keeps working while another project or chat is on
 * screen. Chats are saved to disk as they change and listed again after a restart; sending to a
 * saved chat continues the agent's earlier session when the agent can load it.
 */
export class ChatStore {
  private entries = new Map<string, Entry>();
  private listeners = new Set<() => void>();
  private version = 0;
  private lastCreated = 0;

  constructor(private api: ChatApi = realApi) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getVersion = () => this.version;

  private changed() {
    this.version++;
    for (const l of this.listeners) l();
  }

  private dispatch(id: string, action: ChatAction) {
    const entry = this.entries.get(id);
    if (!entry) return;
    if (action.kind === 'update' && entry.replaying) return;
    if (action.kind === 'session') {
      const resuming = entry.replaying;
      entry.replaying = false;
      entry.meta = { ...entry.meta, agentSessionId: action.agentSessionId };
      if (resuming && !action.resumed) {
        entry.state = chatReducer(entry.state, { kind: 'note', text: NOT_RESUMED, tone: 'info' });
      }
    } else {
      entry.state = chatReducer(entry.state, action);
    }
    this.scheduleSave(id);
    this.changed();
  }

  /** Read the saved chats (without their messages). Chats created meanwhile are kept. */
  async restore(): Promise<void> {
    let records: ChatRecord[];
    try {
      records = await this.api.history.list();
    } catch {
      return; // No backend or no data folder: chats live only for this run.
    }
    for (const r of records) {
      if (this.entries.has(r.id)) continue;
      this.entries.set(r.id, {
        meta: {
          id: r.id,
          projectId: r.projectId,
          agentId: r.agentId,
          agentName: r.agentName,
          title: r.title,
          createdAt: r.createdAt,
          agentSessionId: r.agentSessionId,
        },
        state: initialChat,
        session: null,
        loaded: false,
        replaying: false,
        saveTimer: null,
      });
      this.lastCreated = Math.max(this.lastCreated, r.createdAt);
    }
    this.changed();
  }

  /** Read a saved chat's messages the first time it is opened. */
  private load(id: string) {
    const entry = this.entries.get(id);
    if (!entry || entry.loaded) return;
    entry.loaded = true;
    this.api.history
      .load(id)
      .then((record) => {
        if (this.entries.get(id) !== entry) return;
        // Messages that arrived meanwhile (a send right after opening) stay after the saved ones.
        entry.state = chatReducer(entry.state, {
          kind: 'restored',
          items: [...(record.items ?? []), ...entry.state.items],
        });
        this.changed();
      })
      .catch((e: unknown) => this.dispatch(id, { kind: 'error', message: message(e) }));
  }

  private scheduleSave(id: string) {
    const entry = this.entries.get(id);
    if (!entry || !entry.loaded || entry.state.items.length === 0) return;
    if (entry.saveTimer) clearTimeout(entry.saveTimer);
    entry.saveTimer = setTimeout(() => {
      entry.saveTimer = null;
      if (this.entries.get(id) !== entry) return;
      const record: ChatRecord = {
        ...entry.meta,
        updatedAt: Date.now(),
        items: entry.state.items,
      };
      this.api.history.save(record).catch(() => {
        // Not saved this time; the next change tries again.
      });
    }, SAVE_DELAY_MS);
  }

  create(projectId: string, agentId: string, agentName: string): string {
    const id = crypto.randomUUID();
    // Strictly increasing, so two chats made in the same millisecond still sort.
    const createdAt = Math.max(Date.now(), this.lastCreated + 1);
    this.lastCreated = createdAt;
    this.entries.set(id, {
      meta: { id, projectId, agentId, agentName, title: 'New chat', createdAt },
      state: initialChat,
      session: null,
      loaded: true,
      replaying: false,
      saveTimer: null,
    });
    this.changed();
    return id;
  }

  get(id: string | null): { meta: ChatMeta; state: ChatState } | null {
    const entry = id ? this.entries.get(id) : undefined;
    if (entry && !entry.loaded && id) this.load(id);
    return entry ? { meta: entry.meta, state: entry.state } : null;
  }

  /** A project's chats, newest first. */
  list(projectId: string): ChatMeta[] {
    return [...this.entries.values()]
      .map((e) => e.meta)
      .filter((m) => m.projectId === projectId)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  busy(id: string): boolean {
    return this.entries.get(id)?.state.busy ?? false;
  }

  private ensureSession(id: string, cwd: string): Promise<string> {
    const entry = this.entries.get(id);
    if (!entry) return Promise.reject(new Error('this chat was closed'));
    if (!entry.session) {
      const resume = entry.meta.agentSessionId;
      entry.replaying = Boolean(resume);
      const started = this.api.startChat(
        entry.meta.agentId,
        cwd,
        (e) => this.dispatch(id, e),
        resume,
      );
      started.catch((e: unknown) => {
        entry.session = null;
        entry.replaying = false;
        this.dispatch(id, { kind: 'exit', message: message(e) });
      });
      entry.session = started;
    }
    return entry.session;
  }

  /** Send a message; the agent starts in `cwd` on the first one. `files` were mentioned with @. */
  async send(id: string, text: string, cwd: string, files: string[] = []): Promise<void> {
    const entry = this.entries.get(id);
    if (!entry) return;
    if (!entry.loaded) this.load(id);
    if (entry.meta.title === 'New chat') {
      const short = text.replace(/\s+/g, ' ').trim();
      entry.meta = {
        ...entry.meta,
        title: short.length > TITLE_LENGTH ? `${short.slice(0, TITLE_LENGTH - 1)}…` : short,
      };
    }
    this.dispatch(id, { kind: 'sent', text, files });
    try {
      const sessionId = await this.ensureSession(id, cwd);
      await this.api.sendPrompt(sessionId, text, files, cwd);
    } catch (e) {
      this.dispatch(id, { kind: 'error', message: message(e) });
    }
  }

  private async withSession(id: string, fn: (sessionId: string) => Promise<void>) {
    const sessionId = await this.entries.get(id)?.session;
    if (!sessionId) return;
    try {
      await fn(sessionId);
    } catch (e) {
      this.dispatch(id, { kind: 'error', message: message(e) });
    }
  }

  cancel(id: string) {
    return this.withSession(id, (s) => this.api.cancelTurn(s));
  }

  answer(id: string, requestId: string, optionId: string | null) {
    return this.withSession(id, (s) => this.api.answerPermission(s, requestId, optionId));
  }

  signIn(id: string, methodId: string) {
    return this.withSession(id, (s) => this.api.authenticate(s, methodId));
  }

  /** Spawner for a terminal running the agent's `methodId` sign-in screen. */
  loginSpawner(id: string, methodId: string) {
    return async (options: SpawnOptions, onEvent: (event: PtyEvent) => void) => {
      const sessionId = await this.entries.get(id)?.session;
      if (!sessionId) throw new Error('the agent is not running');
      return this.api.startLogin(sessionId, methodId, options, onEvent);
    };
  }

  /** Delete a chat: stop its agent and forget its saved messages. */
  remove(id: string) {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.entries.delete(id);
    if (entry.saveTimer) clearTimeout(entry.saveTimer);
    entry.session?.then((s) => this.api.stopChat(s)).catch(() => {});
    this.api.history.remove(id).catch(() => {});
    this.changed();
  }

  /** Close every chat of a project (the project was removed). */
  removeProject(projectId: string) {
    for (const meta of this.list(projectId)) this.remove(meta.id);
  }
}

export const chatStore = new ChatStore();

/** Re-render when any chat changes. */
export function useChatStore(store: ChatStore = chatStore): ChatStore {
  useSyncExternalStore(store.subscribe, store.getVersion);
  return store;
}
