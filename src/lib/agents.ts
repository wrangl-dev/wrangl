import { call } from './ipc';

/** One agent from the ACP Registry, mirroring `AgentSummary` in `src-tauri/src/agents/registry.rs`. */
export interface AgentSummary {
  id: string;
  name: string;
  version: string;
  description: string;
  icon: string | null;
  website: string | null;
  /** How it starts here; null when the agent has no build for this machine. */
  launch: 'npx' | 'uvx' | 'binary' | null;
}

export const listAgents = (refresh = false): Promise<AgentSummary[]> =>
  call<AgentSummary[]>('agent_list', { refresh });

const KEY = 'wrangl.agent.v1';

export function loadSelectedAgent(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function saveSelectedAgent(id: string): void {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // Not remembered; the picker still works.
  }
}

/** Agents whose name, id or description contain every word of `query`. Runnable ones first. */
export function filterAgents(agents: AgentSummary[], query: string): AgentSummary[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const hit = (a: AgentSummary) => {
    const text = `${a.name} ${a.id} ${a.description}`.toLowerCase();
    return words.every((w) => text.includes(w));
  };
  return agents.filter(hit).sort((a, b) => Number(b.launch !== null) - Number(a.launch !== null));
}
