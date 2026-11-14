/**
 * Money is integer cents everywhere. This module is the only place that
 * converts to the decimal number the pey API expects.
 */

const mxn = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  minimumFractionDigits: 2,
});

const MAX_DIGITS = 7;

/** 8000 → "$80.00" */
export function formatMxn(cents: number): string {
  return mxn.format(cents / 100);
}

/** 8000 → "80.00" (no symbol, for inputs) */
export function centsToDecimalString(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** The number pey expects in `amount`: 8000 → 80 (never a float artefact). */
export function toPeyAmount(cents: number): number {
  return Math.round(cents) / 100;
}

/** "80" → 8000, "80.5" → 8050, "" → 0. Tolerates a comma as separator. */
export function parseAmountToCents(input: string): number {
  const clean = input.replace(/[^\d.,]/g, '');
  if (!clean) return 0;
  // MX input mixes "1,234.56" (thousands) with "80,50" (decimal comma).
  const normalized =
    clean.includes('.') || /,\d{3}(?!\d)/.test(clean)
      ? clean.replace(/,/g, '')
      : clean.replace(',', '.');
  const [whole = '0', fraction = ''] = normalized.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0').slice(0, 2) || 0);
  return Number.isFinite(cents) ? Math.round(cents) : 0;
}

/**
 * Amount-pad buffer: the cashier types digits, the last two are cents.
 * "8" → $0.08, "80" → $0.80, "8000" → $80.00. No floating point anywhere.
 */
export function padAppend(buffer: string, key: string): string {
  if (!/^\d{1,2}$/.test(key)) return buffer;
  const next = `${buffer}${key}`.replace(/^0+(?=\d)/, '');
  return next.length > MAX_DIGITS ? buffer : next;
}

export function padBackspace(buffer: string): string {
  return buffer.slice(0, -1);
}

export function padToCents(buffer: string): number {
  return buffer ? Number(buffer) : 0;
}

export function centsToPad(cents: number): string {
  return cents > 0 ? String(cents) : '';
}
