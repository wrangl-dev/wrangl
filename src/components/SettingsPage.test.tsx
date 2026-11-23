import { fireEvent, render, screen } from '@testing-library/react';
import type { SettingsView } from '../lib/settings';
import { SettingsPage } from './SettingsPage';

function fakeApi(start: SettingsView) {
  let view = start;
  return {
    getSettings: vi.fn(async () => view),
    saveSettings: vi.fn(async (patch: { robinhoodRpcUrl?: string; coingeckoApiKey?: string }) => {
      if (patch.robinhoodRpcUrl?.startsWith('http://')) throw new Error('use an https:// RPC URL');
      view = {
        rpcUrlSet:
          patch.robinhoodRpcUrl === undefined ? view.rpcUrlSet : patch.robinhoodRpcUrl !== '',
        rpcHost:
          patch.robinhoodRpcUrl === undefined
            ? view.rpcHost
            : patch.robinhoodRpcUrl
              ? new URL(patch.robinhoodRpcUrl).host
              : null,
        coingeckoKeySet:
          patch.coingeckoApiKey === undefined ? view.coingeckoKeySet : patch.coingeckoApiKey !== '',
      };
      return view;
    }),
    testRpc: vi.fn(async (url?: string) => {
      if (!url) throw new Error('RPC (public) unreachable: error sending request');
      return {
        rpc: 'your ROBINHOOD_RPC_URL',
        chain_id: 4663,
        latest_block: 1234567,
        gas_price_gwei: '0.01',
      };
    }),
  };
}

const empty: SettingsView = { rpcUrlSet: false, rpcHost: null, coingeckoKeySet: false };

describe('SettingsPage', () => {
  it('starts on the public RPC and saves the user’s own, showing only its host', async () => {
    const api = fakeApi(empty);
    render(<SettingsPage onClose={() => {}} api={api} />);
    expect(await screen.findByText('Using the public RPC')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('RPC URL'), {
      target: { value: 'https://robinhood-mainnet.g.alchemy.com/v2/SECRET' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[0]);

    expect(await screen.findByText('robinhood-mainnet.g.alchemy.com')).toBeInTheDocument();
    expect(screen.getByText('RPC saved. New chats use it.')).toBeInTheDocument();
    expect(screen.getByLabelText('RPC URL')).toHaveValue('');
    expect(screen.queryByText(/unreachable/)).toBeNull();
    expect(document.body.textContent).not.toContain('SECRET');
  });

  it('tests the typed URL before saving it', async () => {
    const api = fakeApi(empty);
    render(<SettingsPage onClose={() => {}} api={api} />);
    fireEvent.change(await screen.findByLabelText('RPC URL'), {
      target: { value: 'https://rpc.example/key' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Test' }));
    expect(await screen.findByText(/chain 4663, block 1\D?234\D?567/)).toBeInTheDocument();
    expect(api.testRpc).toHaveBeenCalledWith('https://rpc.example/key');
    expect(api.saveSettings).not.toHaveBeenCalled();
  });

  it('shows why the public RPC failed', async () => {
    render(<SettingsPage onClose={() => {}} api={fakeApi(empty)} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Test' }));
    expect(
      await screen.findByText(/unreachable.*block the public Robinhood Chain RPC/),
    ).toBeInTheDocument();
  });

  it('refuses a bad URL and can remove a saved one', async () => {
    const api = fakeApi({ rpcUrlSet: true, rpcHost: 'rpc.example', coingeckoKeySet: true });
    render(<SettingsPage onClose={() => {}} api={api} />);
    fireEvent.change(await screen.findByLabelText('RPC URL'), {
      target: { value: 'http://rpc.example' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[0]);
    expect(await screen.findByRole('alert')).toHaveTextContent('https://');

    fireEvent.click(screen.getByRole('button', { name: 'Remove my RPC' }));
    expect(await screen.findByText('Using the public RPC')).toBeInTheDocument();
    expect(api.saveSettings).toHaveBeenLastCalledWith({ robinhoodRpcUrl: '' });

    fireEvent.click(screen.getByRole('button', { name: 'Remove key' }));
    expect(await screen.findByText('No key')).toBeInTheDocument();
  });

  it('closes', async () => {
    const onClose = vi.fn();
    render(<SettingsPage onClose={onClose} api={fakeApi(empty)} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Back to chat' }));
    expect(onClose).toHaveBeenCalled();
  });
});
