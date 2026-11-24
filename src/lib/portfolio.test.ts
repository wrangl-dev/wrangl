import {
  alertHits,
  formatAmount,
  formatCompactUsd,
  formatPct,
  formatUsd,
  type Market,
  researchPrompt,
  type WatchItem,
} from './portfolio';

const item = (address: string, above: number | null, below: number | null): WatchItem => ({
  address,
  symbol: address.toUpperCase(),
  name: '',
  decimals: 18,
  addedAt: 0,
  alertAbove: above,
  alertBelow: below,
});

const market = (address: string, priceUsd: number | null): Market => ({
  address,
  symbol: null,
  name: null,
  priceUsd,
  change24h: null,
  fdvUsd: null,
  liquidityUsd: null,
  volume24hUsd: null,
});

describe('portfolio helpers', () => {
  it('fires an alert when the price reaches it, on either side', () => {
    const items = [item('a', 10, null), item('b', null, 5), item('c', 10, 5), item('d', 1, null)];
    const markets = [market('a', 10), market('b', 4.9), market('c', 7), market('d', null)];
    expect(alertHits(items, markets).map((h) => [h.item.address, h.side, h.price])).toEqual([
      ['a', 'above', 10],
      ['b', 'below', 4.9],
    ]);
  });

  it('formats money, changes and amounts', () => {
    expect(formatUsd(1234.5)).toBe('$1,234.50');
    expect(formatUsd(0.000123456)).toBe('$0.000123');
    expect(formatUsd(-3)).toBe('−$3.00');
    expect(formatUsd(null)).toBe('–');
    expect(formatCompactUsd(35_156_595)).toBe('$35.2M');
    expect(formatPct(1.234)).toBe('+1.23%');
    expect(formatPct(-4)).toBe('−4.00%');
    expect(formatAmount('1408.325')).toBe('1,408.325');
    expect(formatAmount('0.000001052099502507')).toBe('0.00000105');
    expect(formatAmount('0.5')).toBe('0.5');
  });
});

describe('researchPrompt', () => {
  it('names the token and the research tools to run', () => {
    const p = researchPrompt('CAT', '0xabc');
    expect(p).toContain('CAT (0xabc)');
    for (const tool of [
      'token_report',
      'pool_info',
      'pool_trades',
      'price_chart',
      'dev_launches',
    ]) {
      expect(p).toContain(tool);
    }
  });
});
