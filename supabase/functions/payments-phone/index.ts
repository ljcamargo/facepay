import { adminClient, requireCustomer } from '../_shared/auth.ts';
import { json, log, preflight, requestId, toPeyPhone } from '../_shared/http.ts';
import { createPushNotification, numRefFor } from '../_shared/pey.ts';

/**
 * POST /payments-phone  { transactionId, phone }
 * The customer starts the payment from their own phone, no face involved.
 * Same pey call as the kiosk path; the difference is who is authenticated.
 */
Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;
  const rid = requestId();

  try {
    const customerId = await requireCustomer(req);
    if (!customerId) {
      const reason = req.headers.get('Authorization') ? 'invalid_jwt' : 'missing_jwt';
      // Durable breadcrumb: the dashboard log is the only other place to look.
      await adminClient().from('audit_log').insert({
        actor_type: 'system',
        action: 'payment.phone_rejected',
        entity: 'transactions',
        data: { code: 'UNAUTHORIZED', reason, requestId: rid },
      });
      return json(
        { error: { code: 'UNAUTHORIZED', message: `Sesión inválida (${reason})`, requestId: rid } },
        401,
      );
    }

    const body = await req.json().catch(() => ({}));
    const transactionId: string | undefined = body.transactionId;
    const rawPhone: string | undefined = body.phone;
    if (!transactionId || !rawPhone) {
      await adminClient().from('audit_log').insert({
        actor_type: 'system',
        action: 'payment.phone_rejected',
        data: { code: 'VALIDATION', hasTx: Boolean(transactionId), hasPhone: Boolean(rawPhone), requestId: rid },
      });
      return json({ error: { code: 'VALIDATION', message: 'Faltan datos', requestId: rid } }, 400);
    }

    const digits = rawPhone.replace(/\D/g, '').replace(/^52/, '');
    if (!/^[0-9]{10}$/.test(digits)) {
      return json({ error: { code: 'VALIDATION', message: 'Celular inválido', requestId: rid } }, 400);
    }
    const phone = toPeyPhone(digits)!;

    const admin = adminClient();
    const { data: tx } = await admin
      .from('transactions')
      .select('id, store_id, amount_cents, concept, status, created_at')
      .eq('id', transactionId)
      .maybeSingle();

    const fresh = tx && Date.now() - new Date(tx.created_at).getTime() < 2 * 60 * 60 * 1000;
    if (!tx || tx.status !== 'created' || !fresh) {
      await admin.from('audit_log').insert({
        actor_type: 'system',
        action: 'payment.phone_rejected',
        data: {
          code: 'NOT_FOUND',
          found: Boolean(tx),
          status: tx?.status ?? null,
          fresh,
          requestId: rid,
        },
      });
      return json({ error: { code: 'NOT_FOUND', message: 'El cobro ya no está disponible', requestId: rid } }, 404);
    }

    const { data: store } = await admin
      .from('stores')
      .select('pey_mock')
      .eq('id', tx.store_id)
      .maybeSingle();

    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();

    await admin
      .from('customers')
      .update({ phone_e164: `+52${phone}`, last_seen_at: new Date().toISOString() })
      .eq('id', customerId);

    const mock = store?.pey_mock ?? true;

    if (mock) {
      await admin
        .from('transactions')
        .update({
          customer_id: customerId,
          phone_e164: `+52${phone}`,
          method: 'manual_pn',
          status: 'awaiting_payment',
          pey_transaction_id: `mock-${tx.id}`,
          num_ref: numRefFor(tx.id),
          expires_at: expiresAt,
        })
        .eq('id', tx.id);

      log('payment.mock_phone', { requestId: rid, tx: tx.id });
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
      log('payment.phone_error', { requestId: rid, tx: tx.id, type: result.type, status: result.status, providerMessage: result.message });
      // Durable evidence: the dashboard log expires, this does not.
      await admin
        .from('transactions')
        .update({ metadata: { peyError: { type: result.type, status: result.status, message: result.message, requestId: rid } } })
        .eq('id', tx.id);
      await admin.from('audit_log').insert({
        actor_type: 'system',
        store_id: tx.store_id,
        action: 'payment.phone_pey_error',
        entity: 'transactions',
        entity_id: tx.id,
        data: { type: result.type, status: result.status, message: result.message, requestId: rid },
      });
      return json(
        {
          error: {
            code: result.type === 'INVALID_PARAMETER' ? 'PEY_PHONE_NOT_ENROLLED' : 'PEY_REJECTED',
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
        customer_id: customerId,
        phone_e164: `+52${phone}`,
        method: 'manual_pn',
        status: 'awaiting_payment',
        pey_transaction_id: result.transactionId,
        pey_codi_id: result.codiId,
        num_ref: numRefFor(tx.id),
        expires_at: expiresAt,
      })
      .eq('id', tx.id);

    await admin.from('audit_log').insert({
      actor_type: 'customer',
      actor_id: customerId,
      store_id: tx.store_id,
      action: 'payment.phone_sent',
      entity: 'transactions',
      entity_id: tx.id,
    });

    return json({ data: { transactionId: tx.id, status: 'awaiting_payment', mock: false } });
  } catch (err) {
    log('payment.phone_exception', { requestId: rid, error: err instanceof Error ? err.message : String(err) });
    return json({ error: { code: 'INTERNAL', message: 'Error interno', requestId: rid } }, 500);
  }
});
