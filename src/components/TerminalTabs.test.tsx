import { fireEvent, render, screen } from '@testing-library/react';
import { TerminalTabs } from './TerminalTabs';

// xterm.js needs a real canvas; the tabs only care that one view per tab exists.
vi.mock('./TerminalView', () => ({
  TerminalView: ({ active, cwd }: { active: boolean; cwd?: string }) => (
    <div data-testid="view" data-active={String(active)} data-cwd={cwd ?? ''} />
  ),
}));

const tabs = () => screen.getAllByRole('tab', { hidden: true });
const views = () => screen.queryAllByTestId('view');
const activeViews = () => views().filter((v) => v.dataset.active === 'true');

describe('TerminalTabs', () => {
  it('starts no shell until the panel first opens, then one in the project', () => {
    const { rerender } = render(<TerminalTabs visible={false} cwd="/work/a" onHide={() => {}} />);
    expect(views()).toHaveLength(0);
    rerender(<TerminalTabs visible cwd="/work/a" onHide={() => {}} />);
    expect(tabs()).toHaveLength(1);
    expect(views()[0].dataset.cwd).toBe('/work/a');
    expect(activeViews()).toHaveLength(1);
  });

  it('hiding keeps shells mounted but inactive', () => {
    const { rerender } = render(<TerminalTabs visible cwd="/a" onHide={() => {}} />);
    rerender(<TerminalTabs visible={false} cwd="/a" onHide={() => {}} />);
    expect(views()).toHaveLength(1);
    expect(activeViews()).toHaveLength(0);
  });

  it('new tabs start in the current project', () => {
    const { rerender } = render(<TerminalTabs visible cwd="/a" onHide={() => {}} />);
    rerender(<TerminalTabs visible cwd="/b" onHide={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'New terminal' }));
    expect(views().map((v) => v.dataset.cwd)).toEqual(['/a', '/b']);
    expect(tabs()[1]).toHaveAttribute('aria-selected', 'true');
  });

  it('closing the active tab activates its left neighbour', () => {
    render(<TerminalTabs visible onHide={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'New terminal' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close Terminal 2' }));
    expect(tabs()).toHaveLength(1);
    expect(tabs()[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('closing the last tab offers a new terminal', () => {
    render(<TerminalTabs visible onHide={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close Terminal 1' }));
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    fireEvent.click(screen.getAllByRole('button', { name: 'New terminal' })[1]);
    expect(tabs()).toHaveLength(1);
  });

  it('has a hide button', () => {
    const onHide = vi.fn();
    render(<TerminalTabs visible onHide={onHide} />);
    fireEvent.click(screen.getByRole('button', { name: 'Hide terminal' }));
    expect(onHide).toHaveBeenCalled();
  });
});
