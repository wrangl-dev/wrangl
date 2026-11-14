export type AgentStatus = 'running' | 'waiting' | 'done';

export type LogLine =
  | { kind: 'text'; text: string; tone?: 'dim' | 'bright' }
  | { kind: 'row'; project: string; agent: string; task: string; status: AgentStatus };

const row = (project: string, agent: string, task: string, status: AgentStatus): LogLine => ({
  kind: 'row',
  project,
  agent,
  task,
  status,
});

/** The illustrative session log shown in the hero terminal. */
export const terminalLog: LogLine[] = [
  { kind: 'text', text: 'wrangl / sessions', tone: 'bright' },
  { kind: 'text', text: 'one row per agent, grouped by project', tone: 'dim' },
  row('storefront', 'claude', 'fixing checkout bug', 'running'),
  row('payments-api', 'codex', 'writing refund tests', 'running'),
  row('infra', 'gemini', 'planning queue module', 'done'),
  row('docs-site', 'claude', 'rewriting install guide', 'running'),
  row('mobile-app', 'codex', 'bumping SDK version', 'running'),
  row('auth-service', 'claude', 'reviewing token refresh', 'waiting'),
  row('data-pipeline', 'gemini', 'profiling slow job', 'running'),
  row('admin-ui', 'claude', 'migrating table component', 'running'),
  row('search', 'codex', 'indexing test fixtures', 'done'),
  row('billing', 'claude', 'tracing invoice rounding', 'running'),
  row('emails', 'gemini', 'drafting template tests', 'running'),
  row('cli-tools', 'codex', 'splitting release script', 'done'),
  row('gateway', 'claude', 'tightening rate limits', 'running'),
  row('analytics', 'gemini', 'cleaning event schema', 'running'),
  row('onboarding', 'claude', 'wiring signup flow', 'waiting'),
  row('inventory', 'codex', 'adding stock sync retries', 'running'),
  row('notifications', 'claude', 'deduping push queue', 'running'),
  row('reports', 'gemini', 'exporting monthly CSV', 'done'),
  row('web-app', 'claude', 'splitting settings page', 'running'),
  row('sdk-js', 'codex', 'generating API types', 'running'),
  row('design-system', 'claude', 'auditing focus states', 'running'),
  { kind: 'text', text: '+ 78 more sessions', tone: 'dim' },
  { kind: 'text', text: '100 agents. one window.', tone: 'bright' },
];

export const tabNames = ['storefront', 'payments-api', 'infra', 'docs-site', 'mobile-app'];
