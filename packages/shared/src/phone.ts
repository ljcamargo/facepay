/** Mexican phone helpers. pey wants 10 digits; Supabase/E.164 wants +52 + 10. */

export function digitsOnly(input: string): string {
  return input.replace(/\D/g, '');
}

/**
 * Accepts "55 1234 5678", "+52 55 1234 5678", "5215512345678" and returns
 * "+525512345678". Returns null when it is not a plausible MX mobile number.
 */
export function toE164Mx(input: string): string | null {
  let digits = digitsOnly(input);
  if (digits.startsWith('52')) digits = digits.slice(2);
  if (digits.startsWith('1') && digits.length === 11) digits = digits.slice(1);
  if (digits.length !== 10) return null;
  if (/^(\d)\1{9}$/.test(digits)) return null; // 5555555555
  return `+52${digits}`;
}

/** "+525512345678" → "5512345678" (the exact shape pey validates). */
export function toPeyPhone(e164: string): string {
  return digitsOnly(e164).replace(/^52/, '');
}

/** Never show more than the last four digits. */
export function maskPhone(input: string): string {
  const digits = digitsOnly(input);
  return `•••• ${digits.slice(-4)}`;
}

/** Progressive formatting for the input field: 5512345678 → "55 1234 5678". */
export function formatMxInput(input: string): string {
  const d = digitsOnly(input).replace(/^52/, '').slice(0, 10);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `${d.slice(0, 2)} ${d.slice(2)}`;
  return `${d.slice(0, 2)} ${d.slice(2, 6)} ${d.slice(6)}`;
}
