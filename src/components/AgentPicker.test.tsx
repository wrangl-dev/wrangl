import { fireEvent, render, screen } from '@testing-library/react';
import type { AgentSummary } from '../lib/agents';
import { filterAgents } from '../lib/agents';
import { AgentPicker } from './AgentPicker';

const agent = (id: string, name: string, launch: AgentSummary['launch'] = 'npx'): AgentSummary => ({
  id,
  name,
  version: '1.0.0',
  description: `${name} agent`,
  icon: null,
  website: null,
  launch,
});

const AGENTS = [
  agent('claude-acp', 'Claude Agent', 'binary'),
  agent('codex-acp', 'Codex'),
  agent('mac-only', 'Mac Only', null),
];

function setup(props: Partial<Parameters<typeof AgentPicker>[0]> = {}) {
  const onSelect = vi.fn();
  const onRetry = vi.fn();
  render(
    <AgentPicker
      agents={AGENTS}
      loading={false}
      error={null}
      selectedId={null}
      onSelect={onSelect}
      onRetry={onRetry}
      {...props}
    />,
  );
  return { onSelect, onRetry };
}

describe('filterAgents', () => {
  it('matches every word and lists runnable agents first', () => {
    expect(filterAgents(AGENTS, 'codex').map((a) => a.id)).toEqual(['codex-acp']);
    expect(filterAgents(AGENTS, 'agent').map((a) => a.id)).toEqual([
      'claude-acp',
      'codex-acp',
      'mac-only',
    ]);
    expect(filterAgents([AGENTS[2], AGENTS[1]], '').map((a) => a.id)).toEqual([
      'codex-acp',
      'mac-only',
    ]);
  });
});

describe('AgentPicker', () => {
  it('shows the chosen agent', () => {
    setup({ selectedId: 'codex-acp' });
    expect(screen.getByRole('button', { name: /Codex/ })).toBeInTheDocument();
  });

  it('opens, filters and picks', () => {
    const { onSelect } = setup();
    fireEvent.click(screen.getByRole('button', { name: /Choose an agent/ }));
    expect(screen.getAllByRole('option')).toHaveLength(3);
    fireEvent.change(screen.getByRole('textbox', { name: 'Search agents' }), {
      target: { value: 'claude' },
    });
    fireEvent.click(screen.getByRole('option', { name: /Claude Agent/ }));
    expect(onSelect).toHaveBeenCalledWith('claude-acp');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('agents without a build for this OS cannot be picked', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /Choose an agent/ }));
    expect(screen.getByRole('option', { name: /Mac Only/ })).toBeDisabled();
  });

  it('offers a retry when the registry failed', () => {
    const { onRetry } = setup({ agents: [], error: 'could not download the agent registry' });
    expect(screen.getByRole('button', { name: /Agents unavailable/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Agents unavailable/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('closes on Escape', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /Choose an agent/ }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
