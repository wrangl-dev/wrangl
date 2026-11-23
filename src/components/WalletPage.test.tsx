import { fireEvent, render, screen } from '@testing-library/react';
import type { WalletApi, WalletSnapshot } from '../lib/wallet';
import { WalletPage } from './WalletPage';

vi.mock('../lib/ipc', async (orig) => ({
  ...(await orig<typeof import('../lib/ipc')>()),
  backendKind: async () => 'web',
}));

const USER = '0x1111111111111111111111111111111111111111';

function fakeApi(start: WalletSnapshot): WalletApi & { calls: string[] } {
  let snap = start;
  const calls: string[] = [];
  return {
    calls,
    status: async () => snap,
    openSigner: async () => {
      calls.push('open');
    },
    disconnect: async () => {
      calls.push('disconnect');
      snap = { ...snap, address: null, requests: [] };
      return snap;
    },
    reject: async (id: string) => {
      calls.push(`reject:${id}`);
      snap = { ...snap, requests: snap.requests.filter((r) => r.id !== id) };
      return snap;
    },
  };
}

const request = {
  id: 'tx-1',
  from: USER,
  to: '0x2222222222222222222222222222222222222222',
  valueEth: '0.01',
  valueWeiHex: '0x2386f26fc10000',
  data: '0x',
  description: 'Send 0.01 ETH to the test address',
  warnings: ['Unlimited approval'],
  gasEstimate: '21000',
  createdAtMs: 0,
};

describe('WalletPage', () => {
  it('offers to connect when no wallet is connected', async () => {
    const api = fakeApi({ address: null, chainId: 4663, requests: [] });
    render(<WalletPage onClose={() => {}} api={api} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Connect wallet' }));
    expect(await screen.findByText('Opened the signing page in your browser.')).toBeInTheDocument();
    expect(api.calls).toEqual(['open']);
  });

  it('shows the address and the proposals waiting, with their warnings', async () => {
    const api = fakeApi({ address: USER, chainId: 4663, requests: [request] });
    render(<WalletPage onClose={() => {}} api={api} />);
    expect(await screen.findByText(USER)).toBeInTheDocument();
    expect(screen.getByText(request.description)).toBeInTheDocument();
    expect(screen.getByText('Unlimited approval')).toBeInTheDocument();
    expect(screen.getByText('0x2222…2222')).toBeInTheDocument();
    expect(screen.getByText(/^0\.01 ETH to/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(await screen.findByText('Nothing to sign.')).toBeInTheDocument();
    expect(api.calls).toContain('reject:tx-1');
  });

  it('disconnects', async () => {
    const api = fakeApi({ address: USER, chainId: 4663, requests: [] });
    render(<WalletPage onClose={() => {}} api={api} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Disconnect' }));
    expect(await screen.findByText('No wallet connected')).toBeInTheDocument();
  });
});
