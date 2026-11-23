import { describe, expect, test } from 'bun:test';

import { formatAge, formatBlock, formatGas, formatUsd, pickPools } from '../src/lib/chain';
import { isTokenAddress, TOKEN_CA } from '../src/lib/token';

describe('chain formatting', () => {
  test('formats block numbers and gas', () => {
    expect(formatBlock(1234567)).toBe('#1,234,567');
    expect(formatGas(0.005)).toBe('0.0050');
    expect(formatGas(0.1234)).toBe('0.123');
  });

  test('formats usd by magnitude', () => {
    expect(formatUsd('84200')).toBe('$84.2k');
    expect(formatUsd(2_500_000)).toBe('$2.5M');
    expect(formatUsd(120)).toBe('$120');
    expect(formatUsd(undefined)).toBe('$0');
  });

  test('formats age in m, h and d', () => {
    const now = Date.parse('2026-01-02T00:00:00Z');
    expect(formatAge('2026-01-01T23:59:50Z', now)).toBe('1m');
    expect(formatAge('2026-01-01T22:00:00Z', now)).toBe('2h');
    expect(formatAge('2025-12-30T00:00:00Z', now)).toBe('3d');
  });
});

describe('pickPools', () => {
  const now = Date.parse('2026-01-02T00:00:00Z');
  const pool = (name: string, usd: number) => ({
    name,
    reserve_in_usd: String(usd),
    pool_created_at: '2026-01-01T23:00:00Z',
  });

  test('keeps only pools with $500+ liquidity when three or more qualify', () => {
    const rows = pickPools([pool('a', 900), pool('dust', 3), pool('b', 700), pool('c', 600)], now);
    expect(rows.map((r) => r.name)).toEqual(['a', 'b', 'c']);
  });

  test('falls back to all pools when fewer than three qualify', () => {
    const rows = pickPools([pool('a', 900), pool('dust', 3), pool('b', 700)], now);
    expect(rows.map((r) => r.name)).toEqual(['a', 'dust', 'b']);
  });

  test('returns at most five rows', () => {
    const rows = pickPools(
      Array.from({ length: 9 }, (_, i) => pool(`p${i}`, 1000)),
      now,
    );
    expect(rows).toHaveLength(5);
  });

  test('keeps markup in names as plain text (React escapes on render)', () => {
    expect(pickPools([pool('<b>x</b>', 1)], now)[0].name).toBe('<b>x</b>');
  });
});

describe('token slot', () => {
  test('TOKEN_CA is empty until launch, so the slot stays hidden', () => {
    expect(TOKEN_CA).toBe('');
    expect(isTokenAddress(TOKEN_CA)).toBe(false);
  });

  test('accepts only 0x + 40 hex characters', () => {
    expect(isTokenAddress('0x' + 'a'.repeat(40))).toBe(true);
    expect(isTokenAddress('0x' + 'a'.repeat(39))).toBe(false);
    expect(isTokenAddress('0x' + 'g'.repeat(40))).toBe(false);
  });
});
