import type { ChatItem } from './chat';
import { call } from './ipc';

/** A saved chat, as `src-tauri/src/history.rs` keeps it (one JSON file per chat). */
export interface ChatRecord {
  id: string;
  projectId: string;
  agentId: string;
  agentName: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  /** The agent's own session id, to continue the conversation after a restart. */
  agentSessionId?: string;
  /** Missing in a listing; present when one chat is loaded. */
  items?: ChatItem[];
}

export interface HistoryApi {
  list: () => Promise<ChatRecord[]>;
  load: (id: string) => Promise<ChatRecord>;
  save: (record: ChatRecord) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const historyApi: HistoryApi = {
  list: () => call<ChatRecord[]>('history_list'),
  load: (id) => call<ChatRecord>('history_load', { id }),
  save: (record) => call<void>('history_save', { record }),
  remove: (id) => call<void>('history_delete', { id }),
};
