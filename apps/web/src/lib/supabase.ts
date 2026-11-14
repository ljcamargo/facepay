import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Browser client. Only the public URL + anon key are used; RLS protects every
 * row. Phase 3 uses it for the customer identity/consent layer while the kiosk
 * keeps running on fixtures (NEXT_PUBLIC_MOCK_MODE=true).
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const hasSupabase = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = hasSupabase
  ? createClient(url as string, anonKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: 'facepay.auth',
      },
    })
  : null;
