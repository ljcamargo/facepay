import { describe, expect, test } from 'bun:test';
import { formatMxInput, maskPhone, toE164Mx, toPeyPhone } from './phone';

describe('toE164Mx', () => {
  test('normalizes common MX formats', () => {
    expect(toE164Mx('5512345678')).toBe('+525512345678');
    expect(toE164Mx('55 1234 5678')).toBe('+525512345678');
    expect(toE164Mx('+52 55 1234 5678')).toBe('+525512345678');
    expect(toE164Mx('5215512345678')).toBe('+525512345678');
    expect(toE164Mx('(55) 1234-5678')).toBe('+525512345678');
  });

  test('rejects short, repeated and empty input', () => {
    expect(toE164Mx('551234')).toBeNull();
    expect(toE164Mx('5555555555')).toBeNull();
    expect(toE164Mx('')).toBeNull();
  });
});

describe('toPeyPhone', () => {
  test('returns the 10 digits pey validates', () => {
    expect(toPeyPhone('+525512345678')).toBe('5512345678');
    expect(toPeyPhone('+525512345678')).toMatch(/^[0-9]{10}$/);
  });
});

describe('maskPhone', () => {
  test('never shows more than the last four digits', () => {
    expect(maskPhone('+525512345678')).toBe('•••• 5678');
  });
});

describe('formatMxInput', () => {
  test('groups digits for the input field', () => {
    expect(formatMxInput('5512345678')).toBe('55 1234 5678');
    expect(formatMxInput('55')).toBe('55');
    expect(formatMxInput('55123')).toBe('55 123');
    expect(formatMxInput('+52 55 1234 5678')).toBe('55 1234 5678');
  });
});
