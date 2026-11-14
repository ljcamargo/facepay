import type { Store } from './types';

/** Demo store used by the mock adapter until Phase 2 wires Supabase. */
export const DEMO_STORE: Store = {
  id: 'store-cafe-centro',
  name: 'Café Centro',
  timezone: 'America/Mexico_City',
  currency: 'MXN',
  pilotLimitCents: 30_000,
};

export const DEMO_CUSTOMER = {
  id: 'cust-ana',
  displayName: 'Ana',
  phoneE164: '+525512345678',
  phoneMasked: '•••• 5678',
  templateHash: '7f3a9c',
} as const;

export const DEMO_BANKS: Record<number, string> = {
  40012: 'BBVA',
  40014: 'Santander',
  40021: 'HSBC',
  40036: 'Banorte',
  40072: 'Banco Azteca',
};
