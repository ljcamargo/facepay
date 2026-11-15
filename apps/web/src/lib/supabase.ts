import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Two clients, two storage keys, on purpose:
 *   • `supabase`  → the customer's phone (anonymous session) → facepay.auth
 *   • `vendor`    → the kiosk (email + password)              → facepay.vendor
 * Sharing one key would let a vendor login hijack a customer signup when both
 * are tested in the same browser.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const hasSupabase = Boolean(url && anonKey);

function makeClient(storageKey: string): SupabaseClient | null {
  if (!hasSupabase) return null;
  return createClient(url as string, anonKey as string, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey,
    },
  });
}

export const supabase = makeClient('facepay.auth');
export const vendor = makeClient('facepay.vendor');
