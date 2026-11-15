import { adminClient, requireStaff } from '../_shared/auth.ts';
import { json, log, preflight, requestId } from '../_shared/http.ts';
import { getTransaction } from '../_shared/pey.ts';

/**
 * POST /payments-sync  { transactionId }
 * Fallback for a late or lost webhook: asks pey for the transaction and applies
 * the same transition. Safe to call repeatedly; the webhook stays authoritative.
 */
Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;
  const rid = requestId();

  try {
    const staff = await requireStaff(req);
    if (!staff) return json({ error: { code: 'FORBIDDEN', message: 'Sesión inválida', requestId: rid } }, 403);

    const { transactionId } = await req.json().catch(() => ({}));
    if (!transactionId) return json({ error: { code: 'VALIDATION', message: 'Falta transactionId', requestId: rid } }, 400);

    const admin = adminClient();
    const { data: tx } = await admin
      .from('transactions')
      .select('id, store_id, status, pey_transaction_id')
      .eq('id', transactionId)
      .maybeSingle();

    if (!tx || tx.store_id !== staff.staff.storeId) {
      return json({ error: { code: 'NOT_FOUND', requestId: rid } }, 404);
    }
    if (tx.status === 'paid' || !tx.pey_transaction_id || tx.pey_transaction_id.startsWith('mock-')) {
      return json({ data: { status: tx.status, checked: false } });
    }

    const remote = await getTransaction(tx.pey_transaction_id);
    if (!remote.ok) {
      log('sync.error', { requestId: rid, tx: tx.id, error: remote.error });
      return json({ data: { status: tx.status, checked: true, remote: 'error' } });
    }

    if (remote.status === 'PAID') {
      await admin
        .from('transactions')
        .update({
          status: 'paid',
          paid_at: remote.datePaid ? new Date(remote.datePaid * 1000).toISOString() : new Date().toISOString(),
          payer_clabe_last4: remote.clabe ? remote.clabe.slice(-4) : null,
          payer_bank_code: remote.bankCode ?? null,
          late_payment: tx.status === 'cancelled' || tx.status === 'expired',
        })
        .eq('id', tx.id);
      log('sync.paid', { requestId: rid, tx: tx.id });
      return json({ data: { status: 'paid', checked: true } });
    }

    return json({ data: { status: tx.status, checked: true, remote: 'pending' } });
  } catch (err) {
    log('sync.exception', { requestId: rid, error: err instanceof Error ? err.message : String(err) });
    return json({ error: { code: 'INTERNAL', requestId: rid } }, 500);
  }
});
