import { adminClient, requireStaff } from '../_shared/auth.ts';
import { json, log, preflight, requestId, toPeyPhone } from '../_shared/http.ts';
import { createPushNotification, numRefFor } from '../_shared/pey.ts';

/**
 * POST /payments-push  { transactionId }
 * Staff-only. Turns a `created` checkout into a CoDi push request.
 * With stores.pey_mock = true it skips pey and writes a `mock-` provider id, so
 * the kiosk can keep simulating the bank (Ajustes → Modo simulación).
 */
Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;
  const rid = requestId();

  try {
    const staff = await requireStaff(req);
    if (!staff) return json({ error: { code: 'FORBIDDEN', message: 'Sesión de caja inválida', requestId: rid } }, 403);

    const { transactionId } = await req.json().catch(() => ({}));
    if (!transactionId) return json({ error: { code: 'VALIDATION', message: 'Falta transactionId', requestId: rid } }, 400);

    const admin = adminClient();
    const { data: tx } = await admin
      .from('transactions')
      .select('id, store_id, customer_id, amount_cents, concept, status')
      .eq('id', transactionId)
      .maybeSingle();

    if (!tx || tx.store_id !== staff.staff.storeId) {
      return json({ error: { code: 'NOT_FOUND', message: 'Cobro no encontrado', requestId: rid } }, 404);
    }
    if (tx.status !== 'created') {
      return json({ data: { transactionId: tx.id, status: tx.status, idempotent: true } });
    }
    if (!tx.customer_id) {
      return json({ error: { code: 'NO_CUSTOMER', message: 'El cobro no tiene cliente', requestId: rid } }, 409);
    }

    const { data: customer } = await admin
      .from('customers')
      .select('id, phone_e164, status')
      .eq('id', tx.customer_id)
      .maybeSingle();

    if (!customer || customer.status !== 'active') {
      return json({ error: { code: 'CUSTOMER_UNAVAILABLE', message: 'Cliente no disponible', requestId: rid } }, 409);
    }

    const phone = customer.phone_e164 ? toPeyPhone(customer.phone_e164) : null;
    if (!phone) {
      return json({ error: { code: 'NO_PHONE', message: 'Sin celular para enviar el cobro', requestId: rid } }, 409);
    }

    const { data: store } = await admin
      .from('stores')
      .select('name, pey_mock')
      .eq('id', tx.store_id)
      .maybeSingle();

    const mock = store?.pey_mock ?? true;
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();

    // ── mock: no pey call, the kiosk simulates the bank ─────────────────────
    if (mock) {
      await admin
        .from('transactions')
        .update({
          method: 'face_pn',
          status: 'awaiting_payment',
          pey_transaction_id: `mock-${tx.id}`,
          num_ref: numRefFor(tx.id),
          expires_at: expiresAt,
        })
        .eq('id', tx.id);

      log('payment.mock_push', { requestId: rid, tx: tx.id, store: tx.store_id });
      return json({ data: { transactionId: tx.id, status: 'awaiting_payment', mock: true } });
    }

    const result = await createPushNotification({
      amount: tx.amount_cents / 100,
      phoneNumber: phone,
      concept: tx.concept,
      numRef: numRefFor(tx.id),
      metadata: { txId: tx.id, storeId: tx.store_id },
    });

    if (!result.ok) {
      log('payment.pey_error', { requestId: rid, tx: tx.id, type: result.type, status: result.status, providerMessage: result.message });
      await admin
        .from('transactions')
        .update({ status: 'failed', metadata: { peyError: { type: result.type, status: result.status, message: result.message, requestId: rid } } })
        .eq('id', tx.id);
      await admin.from('audit_log').insert({
        actor_type: 'system',
        store_id: tx.store_id,
        action: 'payment.push_pey_error',
        entity: 'transactions',
        entity_id: tx.id,
        data: { type: result.type, status: result.status, message: result.message, requestId: rid },
      });
      return json(
        {
          error: {
            code: result.type === 'INVALID_PARAMETER' ? 'PEY_INVALID_PHONE' : 'PEY_REJECTED',
            message: 'No pudimos enviar la solicitud al banco.',
            requestId: rid,
          },
        },
        502,
      );
    }

    await admin
      .from('transactions')
      .update({
        method: 'face_pn',
        status: 'awaiting_payment',
        pey_transaction_id: result.transactionId,
        pey_codi_id: result.codiId,
        num_ref: numRefFor(tx.id),
        expires_at: expiresAt,
      })
      .eq('id', tx.id);

    log('payment.push_sent', {
      requestId: rid,
      tx: tx.id,
      pey: result.transactionId,
      amount: tx.amount_cents,
    });

    return json({ data: { transactionId: tx.id, status: 'awaiting_payment', mock: false } });
  } catch (err) {
    log('payment.push_exception', { requestId: rid, error: err instanceof Error ? err.message : String(err) });
    return json({ error: { code: 'INTERNAL', message: 'Error interno', requestId: rid } }, 500);
  }
});
