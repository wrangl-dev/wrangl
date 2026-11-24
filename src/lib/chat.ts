import { diffsIn, type FileDiff } from './diff';
import { call, createChannel } from './ipc';
import type { PtyEvent } from './pty';

/** What a chat session sends, mirroring `AgentEvent` in `src-tauri/src/agents/session.rs`. */
export type AgentEvent =
  | { kind: 'status'; state: 'installing' | 'starting' | 'ready' }
  | { kind: 'authRequired'; methods: AuthMethod[]; message: string }
  | { kind: 'update'; update: SessionUpdate }
  | { kind: 'permission'; requestId: string; toolCall: ToolCallInfo; options: PermissionOption[] }
  | { kind: 'session'; agentSessionId: string; resumed: boolean }
  | { kind: 'turnEnd'; stopReason: string }
  | { kind: 'error'; message: string }
  | { kind: 'exit'; message: string | null };

export interface AuthMethod {
  id: string;
  name: string;
  description?: string | null;
  /** `terminal`: the agent's own sign-in screen, run in a terminal. Missing: the agent signs in. */
  type?: 'terminal' | 'env_var' | string;
}

export interface PermissionOption {
  optionId: string;
  name: string;
  kind: 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always' | string;
}

export interface ToolCallInfo {
  toolCallId?: string;
  title?: string | null;
  kind?: string | null;
  status?: string | null;
  /** ACP tool call content: text, diffs, terminals. Only diffs are shown. */
  content?: unknown;
}

interface ContentBlock {
  type: string;
  text?: string;
}

/** The ACP `session/update` shapes the chat shows; others are ignored. */
export type SessionUpdate =
  | { sessionUpdate: 'agent_message_chunk'; content: ContentBlock }
  | { sessionUpdate: 'agent_thought_chunk'; content: ContentBlock }
  | { sessionUpdate: 'user_message_chunk'; content: ContentBlock }
  | ({ sessionUpdate: 'tool_call' } & ToolCallInfo)
  | ({ sessionUpdate: 'tool_call_update' } & ToolCallInfo)
  | { sessionUpdate: 'plan'; entries: { content: string; status: string }[] }
  | { sessionUpdate: string };

export type ChatItem =
  | { type: 'user'; text: string; files?: string[] }
  | { type: 'agent'; text: string }
  | { type: 'thought'; text: string }
  | { type: 'tool'; id: string; title: string; kind: string; status: string; diffs?: FileDiff[] }
  | { type: 'plan'; entries: { content: string; status: string }[] }
  | { type: 'note'; text: string; tone: 'info' | 'error' };

export type ChatPhase = 'idle' | 'installing' | 'starting' | 'auth' | 'ready' | 'exited';

export interface ChatState {
  phase: ChatPhase;
  items: ChatItem[];
  /** An answer is being written. */
  busy: boolean;
  permission: { requestId: string; toolCall: ToolCallInfo; options: PermissionOption[] } | null;
  auth: { methods: AuthMethod[]; message: string } | null;
}

export const initialChat: ChatState = {
  phase: 'idle',
  items: [],
  busy: false,
  permission: null,
  auth: null,
};

export type ChatAction =
  | AgentEvent
  | { kind: 'sent'; text: string; files?: string[] }
  | { kind: 'reset' }
  | { kind: 'restored'; items: ChatItem[] }
  | { kind: 'note'; text: string; tone: 'info' | 'error' };

const textOf = (c: ContentBlock | undefined) => (c?.type === 'text' ? (c.text ?? '') : '');

/** Append streamed text to the last item of the same type, or start a new one. */
function appendText(items: ChatItem[], type: 'agent' | 'thought', text: string): ChatItem[] {
  if (!text) return items;
  const last = items.at(-1);
  if (last?.type === type) return [...items.slice(0, -1), { type, text: last.text + text }];
  return [...items, { type, text }];
}

function applyUpdate(items: ChatItem[], u: SessionUpdate): ChatItem[] {
  switch (u.sessionUpdate) {
    case 'agent_message_chunk':
      return appendText(items, 'agent', textOf((u as { content: ContentBlock }).content));
    case 'agent_thought_chunk':
      return appendText(items, 'thought', textOf((u as { content: ContentBlock }).content));
    case 'tool_call': {
      const t = u as ToolCallInfo;
      const diffs = diffsIn(t.content);
      return [
        ...items,
        {
          type: 'tool',
          id: t.toolCallId ?? String(items.length),
          title: t.title ?? 'Tool',
          kind: t.kind ?? 'other',
          status: t.status ?? 'pending',
          ...(diffs.length ? { diffs } : {}),
        },
      ];
    }
    case 'tool_call_update': {
      const t = u as ToolCallInfo;
      return items.map((item) =>
        item.type === 'tool' && item.id === t.toolCallId
          ? {
              ...item,
              title: t.title ?? item.title,
              kind: t.kind ?? item.kind,
              status: t.status ?? item.status,
              // An update that carries content replaces it.
              ...(t.content !== undefined ? { diffs: diffsIn(t.content) } : {}),
            }
          : item,
      );
    }
    case 'plan': {
      const entries = (u as { entries: { content: string; status: string }[] }).entries ?? [];
      const rest = items.filter((i) => i.type !== 'plan');
      return [...rest, { type: 'plan', entries }];
    }
    default:
      return items;
  }
}

/** Fold one event into the chat. Pure, so the chat can be tested without an agent. */
export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.kind) {
    case 'reset':
      return initialChat;
    case 'restored':
      return { ...initialChat, items: action.items };
    case 'note':
      return {
        ...state,
        items: [...state.items, { type: 'note', text: action.text, tone: action.tone }],
      };
    case 'sent': {
      const files = action.files?.length ? { files: action.files } : {};
      return {
        ...state,
        busy: true,
        items: [...state.items, { type: 'user', text: action.text, ...files }],
      };
    }
    case 'status':
      return { ...state, phase: action.state, auth: action.state === 'ready' ? null : state.auth };
    case 'authRequired':
      return {
        ...state,
        phase: 'auth',
        // A prompt that hit the sign-in wall is over; the user resends after signing in.
        busy: false,
        permission: null,
        auth: { methods: action.methods, message: action.message },
      };
    case 'update':
      return { ...state, items: applyUpdate(state.items, action.update) };
    case 'permission':
      return {
        ...state,
        permission: {
          requestId: action.requestId,
          toolCall: action.toolCall,
          options: action.options,
        },
      };
    case 'turnEnd':
      return {
        ...state,
        busy: false,
        permission: null,
        items:
          action.stopReason === 'cancelled'
            ? [...state.items, { type: 'note', text: 'Stopped', tone: 'info' }]
            : state.items,
      };
    case 'error':
      return {
        ...state,
        busy: false,
        items: [...state.items, { type: 'note', text: action.message, tone: 'error' }],
      };
    case 'exit':
      return {
        ...state,
        phase: 'exited',
        busy: false,
        permission: null,
        items: action.message
          ? [...state.items, { type: 'note', text: action.message, tone: 'error' }]
          : state.items,
      };
    default:
      return state;
  }
}

/** Start an agent in `cwd`. `resume` is the agent's session id from an earlier run. */
export async function startChat(
  agentId: string,
  cwd: string,
  onEvent: (event: AgentEvent) => void,
  resume?: string,
): Promise<string> {
  const channel = await createChannel<AgentEvent>(onEvent);
  return call<string>('agent_start', { agentId, cwd, onEvent: channel, resume: resume ?? null });
}

/** Send a message; `files` (project-relative, mentioned with @) go to the agent as links. */
export const sendPrompt = (sessionId: string, text: string, files: string[] = [], cwd?: string) =>
  call<void>('agent_prompt', { sessionId, text, files, cwd: cwd ?? null });
export const cancelTurn = (sessionId: string) => call<void>('agent_cancel', { sessionId });
export const answerPermission = (sessionId: string, requestId: string, optionId: string | null) =>
  call<void>('agent_permission', { sessionId, requestId, optionId });
export const authenticate = (sessionId: string, methodId: string) =>
  call<void>('agent_authenticate', { sessionId, methodId });
export const stopChat = (sessionId: string) => call<void>('agent_stop', { sessionId });

/** Run a `terminal` sign-in method in a terminal. Resolves to the terminal id. */
export async function startLogin(
  sessionId: string,
  methodId: string,
  options: { cols: number; rows: number },
  onEvent: (event: PtyEvent) => void,
): Promise<string> {
  const channel = await createChannel<PtyEvent>(onEvent);
  return call<string>('agent_login', { sessionId, methodId, ...options, onEvent: channel });
}
