import { fireEvent, render, screen, within } from '@testing-library/react';
import { App } from './App';

vi.mock('./components/TerminalView', () => ({ TerminalView: () => <div data-testid="view" /> }));

describe('App', () => {
  beforeEach(() => localStorage.clear());

  it('asks for a project first, then names it in the heading', async () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Add a project to start' })).toBeInTheDocument();
    expect(await screen.findByText('Robinhood Chain 4663')).toBeInTheDocument();

    const input = screen.getByRole('textbox', { name: 'Project folder' });
    fireEvent.change(input, { target: { value: 'C:\\work\\storefront' } });
    fireEvent.submit(input);

    expect(
      screen.getByRole('heading', { name: 'What should we do in storefront?' }),
    ).toBeInTheDocument();
    const sidebar = screen.getByRole('complementary', { name: 'Projects' });
    expect(within(sidebar).getByRole('button', { name: 'storefront' })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  it('remembers projects and the selected one across reloads', () => {
    const first = render(<App />);
    for (const path of ['/srv/a', '/srv/b']) {
      fireEvent.click(screen.getByRole('button', { name: 'Add project' }));
      const input = screen.queryByRole('textbox', { name: 'Project folder' });
      if (!input) fireEvent.click(screen.getByRole('button', { name: 'Add project' }));
      const box = screen.getByRole('textbox', { name: 'Project folder' });
      fireEvent.change(box, { target: { value: path } });
      fireEvent.submit(box);
    }
    fireEvent.click(screen.getByRole('button', { name: /^a$/ }));
    first.unmount();

    render(<App />);
    expect(screen.getByRole('heading', { name: 'What should we do in a?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^b$/ })).toBeInTheDocument();
  });

  it('toggles the terminal from the status bar and with Ctrl+`', () => {
    render(<App />);
    const toggle = screen.getByRole('button', { name: 'Terminal' });
    expect(screen.queryByRole('region', { name: 'Terminal' })).toBeNull();

    fireEvent.click(toggle);
    expect(screen.getByRole('region', { name: 'Terminal' })).toBeVisible();
    expect(toggle).toHaveAttribute('aria-pressed', 'true');

    fireEvent.keyDown(window, { key: '`', ctrlKey: true });
    expect(screen.queryByRole('region', { name: 'Terminal' })).toBeNull();
    expect(screen.getAllByTestId('view')).toHaveLength(1);
  });

  it('a suggestion fills the composer', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Show my wallet balance' }));
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('Show my wallet balance');
  });
});
