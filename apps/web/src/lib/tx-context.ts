'use client';

/**
 * The matched candidate is only known in the kiosk's memory (RLS does not let a
 * staff session read customer rows). We carry it across the confirm → pay
 * screens in sessionStorage, keyed by transaction id, and drop it on the receipt.
 */
export interface TxContext {
  customerId: string;
  displayName: string | null;
  phoneMasked: string | null;
  similarity: number | null;
  liveness: number | null;
}

const KEY = 'facepay.txctx';

function read(): Record<string, TxContext> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(window.sessionStorage.getItem(KEY) ?? '{}') as Record<string, TxContext>;
  } catch {
    return {};
  }
}

export function setTxContext(txId: string, ctx: TxContext): void {
  const all = read();
  all[txId] = ctx;
  window.sessionStorage.setItem(KEY, JSON.stringify(all));
}

export function getTxContext(txId: string | undefined): TxContext | null {
  if (!txId || typeof window === 'undefined') return null;
  return read()[txId] ?? null;
}

export function clearTxContext(txId: string): void {
  const all = read();
  delete all[txId];
  window.sessionStorage.setItem(KEY, JSON.stringify(all));
}
