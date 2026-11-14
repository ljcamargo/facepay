/** Domain types shared by the web app, Edge Functions and (later) Android. */

export type TxStatus =
  | 'created'
  | 'awaiting_payment'
  | 'paid'
  | 'expired'
  | 'cancelled'
  | 'failed';

export type TxMethod = 'face_pn' | 'manual_pn' | 'codi_qr';

export type MatchDecision =
  | 'matched'
  | 'ambiguous'
  | 'no_match'
  | 'low_quality'
  | 'liveness_fail';

/** What the kiosk is allowed to know about a person after a match. */
export interface CustomerRef {
  id: string;
  displayName: string | null;
  phoneMasked: string;
}

export interface MatchResult {
  decision: MatchDecision;
  candidate: CustomerRef | null;
  similarity: number | null;
  margin: number | null;
}

export interface Transaction {
  id: string;
  storeId: string;
  amountCents: number;
  concept: string;
  method: TxMethod | null;
  status: TxStatus;
  createdAt: string;
  expiresAt: string | null;
  paidAt: string | null;
  receiptNo: number | null;
  /** Masked identity, for receipts only. Never the full number. */
  customer: CustomerRef | null;
  payerBankCode: number | null;
  payerClabeLast4: string | null;
  latePayment: boolean;
}

export interface OnboardingSession {
  token: string;
  storeId: string;
  storeName: string;
  amountCents: number;
  concept: string;
  expiresAt: string;
  claimed: boolean;
}

export interface Store {
  id: string;
  name: string;
  timezone: string;
  currency: 'MXN';
  pilotLimitCents: number;
}

/** Demo-only switch so reviewers can reach the no-match branch on purpose. */
export type DemoFaceOutcome = 'matched' | 'no_match' | 'ambiguous';
