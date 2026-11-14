import { describe, expect, test } from 'bun:test';
import {
  centsToPad,
  formatMxn,
  padAppend,
  padBackspace,
  padToCents,
  parseAmountToCents,
  toPeyAmount,
} from './money';

describe('formatMxn', () => {
  test('formats cents as MXN', () => {
    expect(formatMxn(8000)).toContain('80.00');
    expect(formatMxn(0)).toContain('0.00');
    expect(formatMxn(1)).toContain('0.01');
  });
});

describe('pad buffer', () => {
  test('types digits into cents', () => {
    let b = '';
    for (const k of ['8', '0', '0', '0']) b = padAppend(b, k);
    expect(b).toBe('8000');
    expect(padToCents(b)).toBe(8000);
  });

  test('strips leading zeros but keeps a single 0', () => {
    expect(padAppend('0', '5')).toBe('5');
    expect(padAppend('', '0')).toBe('0');
  });

  test('ignores non-digit keys and overlong input', () => {
    expect(padAppend('12', 'ab')).toBe('12');
    expect(padAppend('1234567', '8')).toBe('1234567');
  });

  test('backspace and round trip', () => {
    expect(padBackspace('8000')).toBe('800');
    expect(centsToPad(0)).toBe('');
    expect(centsToPad(8000)).toBe('8000');
  });
});

describe('parseAmountToCents', () => {
  test('accepts plain and decimal input', () => {
    expect(parseAmountToCents('80')).toBe(8000);
    expect(parseAmountToCents('80.5')).toBe(8050);
    expect(parseAmountToCents('80.55')).toBe(8055);
    expect(parseAmountToCents('$1,234.56')).toBe(123456);
    expect(parseAmountToCents('$1,234')).toBe(123400);
    expect(parseAmountToCents('80,50')).toBe(8050);
    expect(parseAmountToCents('')).toBe(0);
  });
});

describe('toPeyAmount', () => {
  test('converts cents to the decimal number pey expects', () => {
    expect(toPeyAmount(8000)).toBe(80);
    expect(toPeyAmount(1)).toBe(0.01);
    expect(toPeyAmount(999999)).toBe(9999.99);
  });
});
