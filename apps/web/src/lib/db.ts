'use client';

import { supabase, hasSupabase } from '@/lib/supabase';

/**
 * The customer-facing data layer for Phase 3.
 *
 * Who can do what is enforced in Postgres (RLS + SECURITY DEFINER RPCs), not here:
 *   customers            → select/update own row
 *   biometric_consents   → select/insert own, append-only
 *   face_templates       → no direct access (view for metadata, RPC to revoke)
 *   set_my_phone / revoke_my_face / delete_my_account → the only writes
 */

export interface MyProfile {
  id: string;
  phoneE164: string | null;
  displayName: string | null;
  status: 'active' | 'blocked' | 'deleted';
  createdAt: string;
}

export interface MyConsent {
  slug: string;
  version: string;
  acceptedAt: string;
}

export interface MyTemplate {
  id: string;
  model: string;
  scope: string;
  createdAt: string;
}

function client() {
  if (!supabase) throw new Error('NO_SUPABASE');
  return supabase;
}

/** Reuses the session stored on this device or creates an anonymous one. */
export async function ensureSession(): Promise<string> {
  const db = client();
  const { data } = await db.auth.getSession();
  if (data.session?.user.id) return data.session.user.id;

  const { data: created, error } = await db.auth.signInAnonymously();
  if (error || !created.user) throw error ?? new Error('ANON_SIGNIN_FAILED');
  return created.user.id;
}

export async function getMyProfile(): Promise<MyProfile | null> {
  const db = client();
  const { data, error } = await db
    .from('customers')
    .select('id, phone_e164, display_name, status, created_at')
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    phoneE164: data.phone_e164,
    displayName: data.display_name,
    status: data.status,
    createdAt: data.created_at,
  };
}

/** Returns the normalized E.164 stored by the database. */
export async function savePhone(phone: string): Promise<string> {
  const db = client();
  const { data, error } = await db.rpc('set_my_phone', { p_phone: phone });
  if (error) throw error;
  return data as string;
}

export async function recordConsent(input: {
  privacy: { version: string; sha256: string };
  biometric: { version: string; sha256: string };
}): Promise<void> {
  const db = client();
  const { data: session } = await db.auth.getSession();
  const customerId = session?.session?.user.id;
  if (!customerId) throw new Error('NO_SESSION');

  const rows = [
    {
      customer_id: customerId,
      doc_slug: 'privacy',
      doc_version: input.privacy.version,
      doc_sha256: input.privacy.sha256,
      accepted: true,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      evidence: { source: 'onboarding' },
    },
    {
      customer_id: customerId,
      doc_slug: 'biometric-consent',
      doc_version: input.biometric.version,
      doc_sha256: input.biometric.sha256,
      accepted: true,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      evidence: { source: 'onboarding' },
    },
  ];

  const { error } = await db.from('biometric_consents').insert(rows);
  if (error) throw error;
}

export async function listMyConsents(): Promise<MyConsent[]> {
  const db = client();
  const { data, error } = await db
    .from('biometric_consents')
    .select('doc_slug, doc_version, created_at')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row) => ({
    slug: row.doc_slug,
    version: row.doc_version,
    acceptedAt: row.created_at,
  }));
}

export async function listMyTemplates(): Promise<MyTemplate[]> {
  const db = client();
  const { data, error } = await db
    .from('face_templates_public')
    .select('id, model, scope, created_at')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    model: row.model,
    scope: row.scope,
    createdAt: row.created_at,
  }));
}

export async function revokeMyFace(): Promise<number> {
  const db = client();
  const { data, error } = await db.rpc('revoke_my_face');
  if (error) throw error;
  return (data as number) ?? 0;
}

export async function deleteMyAccount(): Promise<void> {
  const db = client();
  const { error } = await db.rpc('delete_my_account');
  if (error) throw error;
}

export { hasSupabase };
