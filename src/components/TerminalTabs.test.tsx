import { fireEvent, render, screen } from '@testing-library/react';
import { TerminalTabs } from './TerminalTabs';

// xterm.js needs a real canvas; the tabs only care that one view per tab exists.
vi.mock('./TerminalView', () => ({
  TerminalView: ({ active }: { active: boolean }) => (
    <div data-testid="view" data-active={String(active)} />
  ),
}));

const tabs = () => screen.getAllByRole('tab');
const activeViews = () => screen.getAllByTestId('view').filter((v) => v.dataset.active === 'true');

describe('TerminalTabs', () => {
  it('starts with one active terminal', () => {
    render(<TerminalTabs />);
    expect(tabs()).toHaveLength(1);
    expect(tabs()[0]).toHaveAttribute('aria-selected', 'true');
    expect(activeViews()).toHaveLength(1);
  });

  it('adds a tab, makes it active and keeps the old view mounted', () => {
    render(<TerminalTabs />);
    fireEvent.click(screen.getByRole('button', { name: 'New terminal' }));
    expect(tabs()).toHaveLength(2);
    expect(tabs()[1]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByTestId('view')).toHaveLength(2);
    expect(activeViews()).toHaveLength(1);
  });

  it('switches tabs on click', () => {
    render(<TerminalTabs />);
    fireEvent.click(screen.getByRole('button', { name: 'New terminal' }));
    fireEvent.click(tabs()[0]);
    expect(tabs()[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs()[1]).toHaveAttribute('aria-selected', 'false');
  });

  it('closing the active tab activates its left neighbour', () => {
    render(<TerminalTabs />);
    fireEvent.click(screen.getByRole('button', { name: 'New terminal' }));
    const second = tabs()[1].textContent ?? '';
    fireEvent.click(screen.getByRole('button', { name: `Close ${second}` }));
    expect(tabs()).toHaveLength(1);
    expect(tabs()[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('closing the last tab offers a new terminal', () => {
    render(<TerminalTabs />);
    const only = tabs()[0].textContent ?? '';
    fireEvent.click(screen.getByRole('button', { name: `Close ${only}` }));
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    fireEvent.click(screen.getAllByRole('button', { name: 'New terminal' })[1]);
    expect(tabs()).toHaveLength(1);
    expect(tabs()[0]).toHaveAttribute('aria-selected', 'true');
  });
});
