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
}

interface Entry {
  meta: ChatMeta;
  state: ChatState;
  session: Promise<string> | null;
}

/** The chat backend calls, so tests can swap them. */
export interface ChatApi {
  startChat: (agentId: string, cwd: string, onEvent: (e: AgentEvent) => void) => Promise<string>;
  sendPrompt: (sessionId: string, text: string) => Promise<void>;
  cancelTurn: (sessionId: string) => Promise<void>;
  answerPermission: (
    sessionId: string,
    requestId: string,
    optionId: string | null,
  ) => Promise<void>;
  authenticate: (sessionId: string, methodId: string) => Promise<void>;
  stopChat: (sessionId: string) => Promise<void>;
  startLogin: typeof startLogin;
}

const realApi: ChatApi = {
  startChat,
  sendPrompt,
  cancelTurn,
  answerPermission,
  authenticate,
  stopChat,
  startLogin,
};

const TITLE_LENGTH = 48;
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Every chat in every project, alive for as long as the app runs. A chat's agent keeps working
 * while another project or chat is on screen.
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
    entry.state = chatReducer(entry.state, action);
    this.changed();
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
    });
    this.changed();
    return id;
  }

  get(id: string | null): { meta: ChatMeta; state: ChatState } | null {
    const entry = id ? this.entries.get(id) : undefined;
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
      const started = this.api.startChat(entry.meta.agentId, cwd, (e) => this.dispatch(id, e));
      started.catch((e: unknown) => {
        entry.session = null;
        this.dispatch(id, { kind: 'exit', message: message(e) });
      });
      entry.session = started;
    }
    return entry.session;
  }

  /** Send a message; the agent starts in `cwd` on the first one. */
  async send(id: string, text: string, cwd: string): Promise<void> {
    const entry = this.entries.get(id);
    if (!entry) return;
    if (entry.meta.title === 'New chat') {
      const short = text.replace(/\s+/g, ' ').trim();
      entry.meta = {
        ...entry.meta,
        title: short.length > TITLE_LENGTH ? `${short.slice(0, TITLE_LENGTH - 1)}…` : short,
      };
    }
    this.dispatch(id, { kind: 'sent', text });
    try {
      const sessionId = await this.ensureSession(id, cwd);
      await this.api.sendPrompt(sessionId, text);
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

  /** Close a chat and stop its agent. */
  remove(id: string) {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.entries.delete(id);
    entry.session?.then((s) => this.api.stopChat(s)).catch(() => {});
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
