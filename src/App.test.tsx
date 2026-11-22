import { render, screen } from '@testing-library/react';
import { App } from './App';

vi.mock('./components/TerminalView', () => ({ TerminalView: () => <div /> }));

describe('App', () => {
  it('shows the shell with browser fallback info outside Tauri', async () => {
    render(<App />);
    expect(screen.getByRole('complementary', { name: 'Agents' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Terminal' })).toBeInTheDocument();
    expect(await screen.findByText('Robinhood Chain 4663')).toBeInTheDocument();
    expect(screen.getByText('vdev')).toBeInTheDocument();
  });
});
