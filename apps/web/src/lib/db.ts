'use client';

import { supabase, vendor, hasSupabase } from '@/lib/supabase';
import type { Transaction, TxMethod, TxStatus } from '@facepay/shared';

/* ────────────────────────────────────────────────────────────────────────────
 * Customer side (anonymous session on the phone)
 * ──────────────────────────────────────────────────────────────────────────── */

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

export async function ensureSession(): Promise<string> {
  const db = client();
  const { data } = await db.auth.getSession();
  if (data.session?.user.id) return data.session.user.id;
  const { data: created, error } = await db.auth.signInAnonymously();
  if (error || !created.user) throw error ?? new Error('ANON_SIGNIN_FAILED');
  return created.user.id;
}

export async function getMyProfile(): Promise<MyProfile | null> {
  const { data, error } = await client()
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

export async function savePhone(phone: string): Promise<string> {
  const { data, error } = await client().rpc('set_my_phone', { p_phone: phone });
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

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : null;
  const rows = [
    { doc_slug: 'privacy', doc: input.privacy },
    { doc_slug: 'biometric-consent', doc: input.biometric },
  ].map(({ doc_slug, doc }) => ({
    customer_id: customerId,
    doc_slug,
    doc_version: doc.version,
    doc_sha256: doc.sha256,
    accepted: true,
    user_agent: ua,
    evidence: { source: 'onboarding' },
  }));

  const { error } = await db.from('biometric_consents').insert(rows);
  if (error) throw error;
}

export async function listMyConsents(): Promise<MyConsent[]> {
  const { data, error } = await client()
    .from('biometric_consents')
    .select('doc_slug, doc_version, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({ slug: r.doc_slug, version: r.doc_version, acceptedAt: r.created_at }));
}

export async function listMyTemplates(): Promise<MyTemplate[]> {
  const { data, error } = await client()
    .from('face_templates_public')
    .select('id, model, scope, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.id, model: r.model, scope: r.scope, createdAt: r.created_at }));
}

export async function revokeMyFace(): Promise<number> {
  const { data, error } = await client().rpc('revoke_my_face');
  if (error) throw error;
  return (data as number) ?? 0;
}

export async function deleteMyAccount(): Promise<void> {
  const { error } = await client().rpc('delete_my_account');
  if (error) throw error;
}

/** Stores the unit-normalized 1024-d template. Consent is checked in the DB. */
export async function cancelMyCheckout(txId: string): Promise<void> {
  const { error } = await client().rpc('cancel_my_checkout', { p_tx: txId });
  if (error) throw error;
}

/** Customer starts the payment from their own phone (no face). */
export async function startPhonePayment(txId: string, phoneE164: string): Promise<void> {
  const { data, error } = await client().functions.invoke('payments-phone', {
    body: { transactionId: txId, phone: phoneE164 },
  });

  if (error) {
    let code = 'INVOKE_FAILED';
    try {
      const body = await (error as { context?: Response }).context?.json();
      code = body?.error?.code ?? code;
    } catch {
      /* no body */
    }
    throw new Error(code);
  }
  if (data?.error) throw new Error(data.error.code ?? 'PUSH_FAILED');
}

export async function getPeyMock(): Promise<boolean> {
  const { data, error } = await kiosk().from('stores').select('pey_mock').maybeSingle();
  if (error) throw error;
  return data?.pey_mock ?? true;
}

export async function setPeyMock(mock: boolean): Promise<void> {
  const { error } = await kiosk().rpc('set_pey_mock', { p_mock: mock });
  if (error) throw error;
}

export async function enrollMyFace(input: {
  vector: Float32Array;
  model: string;
  version: string;
  quality: number;
  liveness: number;
  scope?: 'global' | 'store';
}): Promise<string> {
  const { data, error } = await client().rpc('enroll_my_face', {
    p_embedding: vectorToText(input.vector),
    p_model: input.model,
    p_model_version: input.version,
    p_quality: input.quality,
    p_liveness: input.liveness,
    p_scope: input.scope ?? 'global',
  });
  if (error) throw error;
  return data as string;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Kiosk side (vendor session)
 * ──────────────────────────────────────────────────────────────────────────── */

export interface StaffSession {
  userId: string;
  storeId: string;
  role: string;
  displayName: string;
  storeName: string;
  peyMock: boolean;
}

function kiosk() {
  if (!vendor) throw new Error('NO_SUPABASE');
  return vendor;
}

export async function signInVendor(email: string, password: string): Promise<void> {
  const { error } = await kiosk().auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOutVendor(): Promise<void> {
  await kiosk().auth.signOut();
}

export async function getStaffSession(): Promise<StaffSession | null> {
  if (!vendor) return null;
  const { data } = await vendor.auth.getSession();
  if (!data.session?.user.id) return null;

  const { data: staff, error } = await vendor
    .from('staff')
    .select('store_id, role, display_name, stores(name, pey_mock)')
    .maybeSingle();
  if (error) throw error;
  if (!staff) return null;

  const store = (Array.isArray(staff.stores) ? staff.stores[0] : staff.stores) as
    | { name?: string; pey_mock?: boolean }
    | null;

  return {
    userId: data.session.user.id,
    storeId: staff.store_id,
    role: staff.role,
    displayName: staff.display_name,
    storeName: store?.name ?? 'Tienda',
    peyMock: store?.pey_mock ?? false,
  };
}

export async function createCheckout(amountCents: number, concept: string): Promise<Transaction> {
  const { data, error } = await kiosk().rpc('create_checkout', {
    p_amount_cents: amountCents,
    p_concept: concept,
  });
  if (error) throw error;
  return mapTx(data);
}

export async function getTx(id: string): Promise<Transaction | null> {
  const { data, error } = await kiosk()
    .from('transactions')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapTx(data) : null;
}

export async function listTxs(limit = 50): Promise<Transaction[]> {
  const { data, error } = await kiosk()
    .from('transactions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(mapTx);
}

export async function confirmFacePayment(input: {
  txId: string;
  customerId: string;
  similarity: number | null;
  liveness: number | null;
}): Promise<Transaction> {
  const { data, error } = await kiosk().rpc('confirm_face_payment', {
    p_tx: input.txId,
    p_customer: input.customerId,
    p_similarity: input.similarity,
    p_liveness: input.liveness,
  });
  if (error) throw error;
  return mapTx(data);
}

/** Asks the Edge Function to send the real CoDi push (or mock it per store). */
export async function sendPush(txId: string): Promise<void> {
  const { data, error } = await kiosk().functions.invoke('payments-push', {
    body: { transactionId: txId },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error.message ?? 'push failed');
}

/** Asks pey for the current status; covers a late/lost webhook. */
export async function syncPayment(txId: string): Promise<void> {
  await kiosk().functions.invoke('payments-sync', { body: { transactionId: txId } }).catch(() => undefined);
}

/** Simulation only: called by the kiosk while the provider id is `mock-…`. */
export async function demoMarkPaid(txId: string): Promise<Transaction> {
  const { data, error } = await kiosk().rpc('demo_mark_paid', { p_tx: txId });
  if (error) throw error;
  return mapTx(data);
}

export async function cancelTransaction(txId: string): Promise<Transaction | null> {
  const { data, error } = await kiosk().rpc('cancel_transaction', { p_tx: txId });
  if (error) throw error;
  return data ? mapTx(data) : null;
}

export interface FaceMatch {
  decision: 'matched' | 'ambiguous' | 'no_match' | 'low_quality' | 'liveness_fail' | 'model_error';
  customerId: string | null;
  displayName: string | null;
  phoneMasked: string | null;
  similarity: number | null;
  margin: number | null;
}

export async function identifyFace(input: {
  vector: Float32Array;
  model: string;
  storeId: string;
}): Promise<FaceMatch> {
  const { data, error } = await kiosk().rpc('identify_customer', {
    p_embedding: vectorToText(input.vector),
    p_model: input.model,
    // Cross-device (phone enrollment vs tablet camera) needs slack. These are
    // constants on purpose: tune from /dev/face, not from a UI switch.
    p_min_sim: 0.4,
    p_min_margin: 0.05,
    p_store_id: input.storeId,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    decision: row?.decision ?? 'no_match',
    customerId: row?.customer_id ?? null,
    displayName: row?.display_name ?? null,
    phoneMasked: row?.phone_masked ?? null,
    similarity: row?.similarity ?? null,
    margin: row?.margin ?? null,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * helpers
 * ──────────────────────────────────────────────────────────────────────────── */

export function vectorToText(vector: Float32Array): string {
  let out = '[';
  for (let i = 0; i < vector.length; i += 1) {
    out += (i > 0 ? ',' : '') + (vector[i] ?? 0).toFixed(6);
  }
  return out + ']';
}

interface TxRow {
  id: string;
  store_id: string;
  amount_cents: number;
  concept: string;
  method: TxMethod | null;
  status: TxStatus;
  created_at: string;
  expires_at: string | null;
  paid_at: string | null;
  receipt_no: number | null;
  customer_id: string | null;
  payer_bank_code: number | null;
  payer_clabe_last4: string | null;
  late_payment: boolean;
  match_similarity: number | null;
  pey_transaction_id?: string | null;
}

function mapTx(row: TxRow): Transaction {
  return {
    id: row.id,
    storeId: row.store_id,
    amountCents: row.amount_cents,
    concept: row.concept,
    method: row.method,
    status: row.status,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    paidAt: row.paid_at,
    receiptNo: row.receipt_no,
    customer: null,
    payerBankCode: row.payer_bank_code,
    payerClabeLast4: row.payer_clabe_last4,
    latePayment: row.late_payment,
    peyTransactionId: row.pey_transaction_id ?? null,
  };
}

export { hasSupabase };
