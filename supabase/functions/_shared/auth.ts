import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const url = Deno.env.get('SUPABASE_URL')!;
const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/** Caller-scoped client: RLS applies, so we can trust `auth.uid()`. */
export function userClient(req: Request): SupabaseClient {
  return createClient(url, anon, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  });
}

/** Bypasses RLS. Only use it to read rows the caller proved they may act on. */
export function adminClient(): SupabaseClient {
  return createClient(url, service, { auth: { persistSession: false } });
}

export interface Staff {
  userId: string;
  storeId: string;
}

export async function requireStaff(req: Request): Promise<{ staff: Staff; userId: string } | null> {
  const client = userClient(req);
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;

  const admin = adminClient();
  const { data: row } = await admin
    .from('staff')
    .select('store_id')
    .eq('user_id', data.user.id)
    .maybeSingle();

  if (!row) return null;
  return { staff: { userId: data.user.id, storeId: row.store_id }, userId: data.user.id };
}

export async function requireCustomer(req: Request): Promise<string | null> {
  const client = userClient(req);
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
}
