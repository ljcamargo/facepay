// Thin wrapper over the pey public API. docs/02-pey-integration.md has the contract.

const BASE = Deno.env.get('PEY_API_BASE') ?? 'https://api.pey.mx';

export interface PushInput {
  amount: number; // MXN, decimals
  phoneNumber: string; // 10 digits
  concept: string;
  numRef: string;
  expiration?: number;
  metadata: Record<string, string>;
}

export interface PushResult {
  ok: true;
  transactionId: string;
  codiId: string;
}

export interface PushError {
  ok: false;
  status: number;
  type: string;
  message: string;
  requestId: string | null;
}

export async function createPushNotification(input: PushInput): Promise<PushResult | PushError> {
  const key = Deno.env.get('PEY_API_KEY');
  if (!key) {
    return { ok: false, status: 500, type: 'NO_API_KEY', message: 'pey key missing', requestId: null };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(`${BASE}/codi/pn`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: input.amount,
        phoneNumber: input.phoneNumber,
        concept: input.concept.slice(0, 60),
        expiration: input.expiration ?? 600,
        numRef: input.numRef,
        metadata: input.metadata,
      }),
      signal: controller.signal,
    });

    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        type: body?.error?.type ?? 'UNKNOWN',
        message: body?.error?.message ?? `HTTP ${res.status}`,
        requestId: body?.error?.requestId ?? null,
      };
    }

    return { ok: true, transactionId: body.transactionId, codiId: body.codiId };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      type: 'NETWORK',
      message: err instanceof Error ? err.message : 'network error',
      requestId: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** 1..7 digits, derived from the transaction id so it is stable per payment. */
export function numRefFor(txId: string): string {
  let hash = 0;
  for (const ch of txId.replace(/-/g, '')) hash = (hash * 31 + ch.charCodeAt(0)) % 9_999_999;
  return String(hash).padStart(7, '0').slice(-7);
}
