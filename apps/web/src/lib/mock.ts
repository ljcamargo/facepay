'use client';

import {
  DEMO_CUSTOMER,
  DEMO_STORE,
  PUSH_EXPIRATION_SECONDS,
  QR_EXPIRATION_SECONDS,
  type CustomerRef,
  type DemoFaceOutcome,
  type MatchResult,
  type OnboardingSession,
  type Transaction,
  type TxMethod,
} from '@facepay/shared';
import { sleep } from '@/lib/utils';

/**
 * Phase 1 mock backend. Replaces the Edge Functions with an in-browser store so
 * every screen can be reviewed before Supabase exists. All state lives in
 * localStorage (shared across tabs, so the kiosk and the "phone" can talk).
 *
 * Contract mirrors docs/04-api.md on purpose: when the real adapter lands, only
 * `lib/api.ts` changes.
 */

const K = {
  tx: 'fp.mock.tx',
  receipt: 'fp.mock.receipt',
  sessions: 'fp.mock.sessions',
  settings: 'fp.mock.settings',
  device: 'fp.mock.device',
  account: 'fp.mock.account',
} as const;

type MockSession = OnboardingSession & { linkedTxId?: string };

interface MockSettings {
  faceOutcome: DemoFaceOutcome;
}

interface MockDevice {
  id: string;
  label: string;
  storeId: string;
  pairedAt: string;
}

interface MockAccount {
  phoneE164: string;
  displayName: string;
  templates: Array<{ id: string; model: string; createdAt: string; scope: 'global' | 'store' }>;
  consents: Array<{ slug: string; version: string; sha256: string; acceptedAt: string }>;
}

/** Exposed for the checkout UI so the guardrail is visible, not hidden in code. */
export const DEMO_PILOT_LIMIT = DEMO_STORE.pilotLimitCents;

const isBrowser = () => typeof window !== 'undefined';

function read<T>(key: string, fallback: T): T {
  if (!isBrowser()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private mode: the demo keeps working in memory only */
  }
}

const rid = (prefix: string) =>
  `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;

const now = () => new Date().toISOString();
const plus = (seconds: number) => new Date(Date.now() + seconds * 1000).toISOString();

/* ── settings ─────────────────────────────────────────────────────────────── */

export function getSettings(): MockSettings {
  return read<MockSettings>(K.settings, { faceOutcome: 'matched' });
}

export function setFaceOutcome(faceOutcome: DemoFaceOutcome): void {
  write(K.settings, { ...getSettings(), faceOutcome });
}

/* ── device ───────────────────────────────────────────────────────────────── */

export function getDevice(): MockDevice | null {
  return read<MockDevice | null>(K.device, null);
}

export function pairDevice(code: string): MockDevice | null {
  if (!/^\d{6}$/.test(code)) return null;
  const device: MockDevice = {
    id: rid('dev'),
    label: 'Caja 2',
    storeId: DEMO_STORE.id,
    pairedAt: now(),
  };
  write(K.device, device);
  return device;
}

export function unpairDevice(): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(K.device);
}

/* ── transactions ─────────────────────────────────────────────────────────── */

function allTx(): Record<string, Transaction> {
  return read<Record<string, Transaction>>(K.tx, {});
}

function saveTx(tx: Transaction): void {
  const all = allTx();
  all[tx.id] = tx;
  write(K.tx, all);
}

export class PilotLimitError extends Error {
  constructor() {
    super('PILOT_LIMIT');
    this.name = 'PilotLimitError';
  }
}

export function createCheckout(input: { amountCents: number; concept?: string }): Transaction {
  const amountCents = Math.round(input.amountCents);
  if (!Number.isFinite(amountCents) || amountCents <= 0) throw new Error('INVALID_AMOUNT');
  if (amountCents > DEMO_STORE.pilotLimitCents) throw new PilotLimitError();

  const concept = input.concept?.trim() || DEMO_STORE.name;
  const tx: Transaction = {
    id: rid('tx'),
    storeId: DEMO_STORE.id,
    amountCents,
    concept,
    method: null,
    status: 'created',
    createdAt: now(),
    expiresAt: null,
    paidAt: null,
    receiptNo: null,
    customer: null,
    payerBankCode: null,
    payerClabeLast4: null,
    latePayment: false,
    peyTransactionId: null,
  };
  saveTx(tx);
  return tx;
}

export function getTx(id: string): Transaction | null {
  return allTx()[id] ?? null;
}

export function listTx(): Transaction[] {
  return Object.values(allTx()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Simulates the 2.6 s capture + match round trip. No image leaves the screen. */
export async function identify(): Promise<MatchResult> {
  await sleep(2600);
  const { faceOutcome } = getSettings();

  if (faceOutcome === 'matched') {
    return {
      decision: 'matched',
      candidate: {
        id: DEMO_CUSTOMER.id,
        displayName: DEMO_CUSTOMER.displayName,
        phoneMasked: DEMO_CUSTOMER.phoneMasked,
      },
      similarity: 0.74,
      margin: 0.11,
    };
  }
  if (faceOutcome === 'ambiguous') {
    return { decision: 'ambiguous', candidate: null, similarity: 0.63, margin: 0.02 };
  }
  return { decision: 'no_match', candidate: null, similarity: 0.41, margin: 0 };
}

/** Persists the confirmed candidate on the transaction (the kiosk's "¿Eres tú?"). */
export function attachCandidate(txId: string, candidate: CustomerRef): Transaction | null {
  const tx = getTx(txId);
  if (!tx) return null;
  const next: Transaction = { ...tx, customer: candidate };
  saveTx(next);
  return next;
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();

function schedulePayment(txId: string, ms: number): void {
  const existing = timers.get(txId);
  if (existing) clearTimeout(existing);
  timers.set(
    txId,
    setTimeout(() => {
      timers.delete(txId);
      payTx(txId);
    }, ms),
  );
}

export function sendPush(txId: string): Transaction | null {
  const tx = getTx(txId);
  if (!tx) return null;
  if (tx.status !== 'created') return tx;

  const next: Transaction = {
    ...tx,
    method: 'face_pn' satisfies TxMethod,
    status: 'awaiting_payment',
    customer: tx.customer ?? {
      id: DEMO_CUSTOMER.id,
      displayName: DEMO_CUSTOMER.displayName,
      phoneMasked: DEMO_CUSTOMER.phoneMasked,
    },
    expiresAt: plus(PUSH_EXPIRATION_SECONDS),
  };
  saveTx(next);
  schedulePayment(txId, 8000); // pretend the customer approved in their bank app
  return next;
}

export function startQr(txId: string): Transaction | null {
  const tx = getTx(txId);
  if (!tx) return null;
  const next: Transaction = {
    ...tx,
    method: 'codi_qr',
    status: 'awaiting_payment',
    expiresAt: plus(QR_EXPIRATION_SECONDS),
  };
  saveTx(next);
  schedulePayment(txId, 7000);
  return next;
}

/** Stand-in for the pey webhook. Idempotent: paying twice is a no-op. */
export function payTx(txId: string): Transaction | null {
  const tx = getTx(txId);
  if (!tx || tx.status === 'paid') return tx;

  const late = tx.status === 'cancelled' || tx.status === 'expired';
  const receipt = read<number>(K.receipt, 136) + 1;
  write(K.receipt, receipt);

  const next: Transaction = {
    ...tx,
    status: 'paid',
    paidAt: now(),
    receiptNo: receipt,
    latePayment: late,
    peyTransactionId: tx.peyTransactionId ?? null,
    payerBankCode: 40012,
    payerClabeLast4: '8842',
    customer: tx.customer ?? {
      id: DEMO_CUSTOMER.id,
      displayName: DEMO_CUSTOMER.displayName,
      phoneMasked: DEMO_CUSTOMER.phoneMasked,
    },
  };
  saveTx(next);

  const timer = timers.get(txId);
  if (timer) {
    clearTimeout(timer);
    timers.delete(txId);
  }
  return next;
}

export function cancelTx(txId: string): Transaction | null {
  const tx = getTx(txId);
  if (!tx || tx.status === 'paid') return tx;
  const next: Transaction = { ...tx, status: 'cancelled' };
  saveTx(next);
  return next;
}

/* ── onboarding ───────────────────────────────────────────────────────────── */

function allSessions(): Record<string, MockSession> {
  return read<Record<string, MockSession>>(K.sessions, {});
}

export function createSession(input: { amountCents: number; concept?: string }): MockSession {
  const sessions = allSessions();
  const token = rid('s').replace('s_', '');
  const session: MockSession = {
    token,
    storeId: DEMO_STORE.id,
    storeName: DEMO_STORE.name,
    amountCents: Math.round(input.amountCents),
    concept: input.concept?.trim() || DEMO_STORE.name,
    expiresAt: plus(15 * 60),
    claimed: false,
  };
  sessions[token] = session;
  write(K.sessions, sessions);
  return session;
}

export function getSession(token: string): MockSession | null {
  return allSessions()[token] ?? null;
}

export function claimSession(token: string): MockSession | null {
  const sessions = allSessions();
  const session = sessions[token];
  if (!session) return null;
  const next = { ...session, claimed: true };
  sessions[token] = next;
  write(K.sessions, sessions);
  return next;
}

/** Used by the kiosk to notice that the phone finished and started paying. */
export function sessionTxId(token: string): string | null {
  return allSessions()[token]?.linkedTxId ?? null;
}

export function createTxFromSession(
  token: string,
  phoneE164: string,
  options: { enroll?: boolean } = {},
): Transaction | null {
  const enroll = options.enroll ?? true;
  const session = getSession(token);
  if (!session) return null;

  const tx = createCheckout({ amountCents: session.amountCents, concept: session.concept });
  const withPhone: Transaction = {
    ...tx,
    customer: {
      id: DEMO_CUSTOMER.id,
      displayName: DEMO_CUSTOMER.displayName,
      phoneMasked: `•••• ${phoneE164.slice(-4)}`,
    },
  };
  saveTx(withPhone);

  const sessions = allSessions();
  sessions[token] = { ...session, claimed: true, linkedTxId: tx.id };
  write(K.sessions, sessions);

  if (enroll) {
    saveAccount({
      phoneE164,
      displayName: DEMO_CUSTOMER.displayName,
      templates: [
        {
          id: rid('tpl'),
          model: 'human-hse-faceres',
          createdAt: now(),
          scope: 'global',
        },
      ],
      consents: [
        {
          slug: 'privacy',
          version: '2026-11-14',
          sha256: 'demo-sha256',
          acceptedAt: now(),
        },
        {
          slug: 'biometric-consent',
          version: '2026-11-14',
          sha256: 'demo-sha256',
          acceptedAt: now(),
        },
      ],
    });
  }

  return withPhone;
}

/* ── demo customer account (phone side) ───────────────────────────────────── */

export function getAccount(): MockAccount | null {
  return read<MockAccount | null>(K.account, null);
}

function saveAccount(account: MockAccount): void {
  write(K.account, account);
}

export function deleteFace(): void {
  const account = getAccount();
  if (!account) return;
  saveAccount({ ...account, templates: [], consents: account.consents });
}

export function resetDemo(): void {
  if (!isBrowser()) return;
  Object.values(K).forEach((key) => window.localStorage.removeItem(key));
  timers.forEach((timer) => clearTimeout(timer));
  timers.clear();
}

/* ── derived helpers ──────────────────────────────────────────────────────── */

export function todayStats() {
  const txs = listTx();
  const paid = txs.filter((t) => t.status === 'paid');
  return {
    collectedCents: paid.reduce((sum, t) => sum + t.amountCents, 0),
    paidCount: paid.length,
    pendingCount: txs.filter((t) => t.status === 'awaiting_payment' || t.status === 'created')
      .length,
    lastPaid: paid[0] ?? null,
  };
}
