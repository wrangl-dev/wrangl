import { act, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import type { Portfolio, PortfolioApi, WatchItem, Watchlist } from '../lib/portfolio';
import { useWatchAlerts } from '../lib/use-watch-alerts';
import { PortfolioPage } from './PortfolioPage';

const USDG = '0x5fc5360d0400a0fd4f2af552add042d716f1d168';

const PORTFOLIO: Portfolio = {
  address: '0xme',
  totalUsd: 245,
  change24hUsd: 40,
  tokensChecked: 23,
  rpc: 'public RPC',
  holdings: [
    {
      address: '0xccc',
      symbol: 'SPY',
      name: 'S&P 500',
      amount: '2',
      priceUsd: 100,
      valueUsd: 200,
      change24h: 25,
    },
    {
      address: null,
      symbol: 'ETH',
      name: 'Ether',
      amount: '0.01',
      priceUsd: 2000,
      valueUsd: 20,
      change24h: null,
    },
  ],
};

const usdg = (above: number | null = null, below: number | null = null): WatchItem => ({
  address: USDG,
  symbol: 'USDG',
  name: 'Global Dollar',
  decimals: 6,
  addedAt: 1,
  alertAbove: above,
  alertBelow: below,
});

function fakeApi(watch: Watchlist = { items: [], markets: [] }, portfolio?: Error) {
  let list = watch;
  const api: PortfolioApi = {
    portfolio: vi.fn(async () => {
      if (portfolio) throw portfolio;
      return PORTFOLIO;
    }),
    watchlist: vi.fn(async () => list),
    watch: vi.fn(async () => {
      list = {
        items: [usdg()],
        markets: [
          {
            address: USDG,
            symbol: 'USDG',
            name: 'Global Dollar',
            priceUsd: 1.0002,
            change24h: -0.23,
            fdvUsd: 6e8,
            liquidityUsd: 35_156_595,
            volume24hUsd: 4e9,
          },
        ],
      };
      return list.items;
    }),
    unwatch: vi.fn(async () => {
      list = { items: [], markets: [] };
      return [];
    }),
    setAlerts: vi.fn(async (_a: string, above: number | null, below: number | null) => {
      list = { ...list, items: [usdg(above, below)] };
      return list.items;
    }),
  };
  return api;
}

describe('PortfolioPage', () => {
  it('shows holdings by value with the day change', async () => {
    render(<PortfolioPage onClose={() => {}} onOpenWallet={() => {}} api={fakeApi()} />);
    const table = await screen.findByRole('table', { name: 'Holdings' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((r) => r.querySelector('strong')?.textContent)).toEqual(['SPY', 'ETH']);
    expect(rows[0]).toHaveTextContent('$200.00');
    expect(rows[0]).toHaveTextContent('+25.00%');
    expect(screen.getByText('$245.00')).toBeInTheDocument();
    expect(screen.getByText(/\+\$40\.00 today/)).toBeInTheDocument();
    expect(screen.getByText(/Checked ETH and 23 tokens/)).toBeInTheDocument();
  });

  it('without a wallet it offers to connect one', async () => {
    const open = vi.fn();
    const api = fakeApi(undefined, new Error('connect a wallet first (Wallet in the sidebar)'));
    render(<PortfolioPage onClose={() => {}} onOpenWallet={open} api={api} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open Wallet' }));
    expect(open).toHaveBeenCalled();
  });

  it('watches a token, sets an alert and removes it', async () => {
    const api = fakeApi();
    render(<PortfolioPage onClose={() => {}} onOpenWallet={() => {}} api={api} />);
    const input = await screen.findByRole('textbox', { name: 'Token address' });

    fireEvent.change(input, { target: { value: 'not an address' } });
    fireEvent.click(screen.getByRole('button', { name: 'Watch' }));
    expect(await screen.findByText(/Paste a token contract address/)).toBeInTheDocument();
    expect(api.watch).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: USDG } });
    fireEvent.click(screen.getByRole('button', { name: 'Watch' }));
    const table = await screen.findByRole('table', { name: 'Watched tokens' });
    expect(table).toHaveTextContent('USDG');
    expect(table).toHaveTextContent('$35.2M');
    expect(table).toHaveTextContent('−0.23%');

    fireEvent.change(screen.getByLabelText('Alert USDG above'), { target: { value: '1.05' } });
    fireEvent.click(within(table).getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(api.setAlerts).toHaveBeenCalledWith(USDG, 1.05, null));

    fireEvent.click(screen.getByRole('button', { name: 'Stop watching USDG' }));
    await vi.waitFor(() =>
      expect(screen.queryByRole('table', { name: 'Watched tokens' })).toBeNull(),
    );
  });
});

describe('useWatchAlerts', () => {
  it('fires an alert once, then clears it', async () => {
    vi.useFakeTimers();
    const api = fakeApi({
      items: [usdg(1.0, 0.5)],
      markets: [
        {
          address: USDG,
          symbol: 'USDG',
          name: null,
          priceUsd: 1.0002,
          change24h: null,
          fdvUsd: null,
          liquidityUsd: null,
          volume24hUsd: null,
        },
      ],
    });
    const { result } = renderHook(() => useWatchAlerts(api, 1000));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(result.current.notices.map((n) => n.text)).toEqual([
      'USDG is at $1.00, above your alert of $1.00.',
    ]);
    // The above-alert is cleared; the below-alert stays.
    expect(api.setAlerts).toHaveBeenCalledWith(USDG, null, 0.5);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(result.current.notices).toHaveLength(1);
    act(() => result.current.dismiss(result.current.notices[0].id));
    expect(result.current.notices).toHaveLength(0);
    vi.useRealTimers();
  });
});
