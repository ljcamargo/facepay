import { adminClient } from '../_shared/auth.ts';
import { json, log, preflight, requestId } from '../_shared/http.ts';

/**
 * POST /webhooks-pey — Standard Webhooks.
 * verify_jwt is disabled for this function; the HMAC is the authentication.
 * One URL per API key, so every pey event type lands here.
 */

const enc = new TextEncoder();

async function verify(raw: string, headers: Headers, secret: string): Promise<boolean> {
  const id = headers.get('webhook-id');
  const ts = headers.get('webhook-timestamp');
  const sig = headers.get('webhook-signature');
  if (!id || !ts || !sig) return false;

  const skew = Math.abs(Date.now() / 1000 - Number(ts));
  if (!Number.isFinite(skew) || skew > 300) return false;

  const keyBytes = Uint8Array.from(atob(secret.replace(/^whsec_/, '')), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`${id}.${ts}.${raw}`)));
  const expected = btoa(String.fromCharCode(...mac));

  return sig.split(' ').some((part) => {
    const [version, value] = part.split(',');
    if (version !== 'v1' || !value || value.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i += 1) diff |= expected.charCodeAt(i) ^ value.charCodeAt(i);
    return diff === 0;
  });
}

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;
  const rid = requestId();

  const secret = Deno.env.get('PEY_WEBHOOK_SECRET');
  if (!secret) {
    log('webhook.no_secret', { requestId: rid });
    return json({ error: 'webhook secret not configured' }, 503);
  }

  const raw = await req.text();
  if (!(await verify(raw, req.headers, secret))) {
    log('webhook.bad_signature', { requestId: rid });
    return json({ error: 'invalid signature' }, 401);
  }

  const webhookId = req.headers.get('webhook-id')!;
  const admin = adminClient();

  // Idempotency first: a duplicate delivery is a fast 200 and nothing else.
  const { data: inserted, error: insertError } = await admin
    .from('payment_events')
    .insert({
      webhook_id: webhookId,
      type: 'unknown',
      payload: {},
      signature_verified: true,
    })
    .select('id')
    .maybeSingle();

  if (insertError) {
    // 23505 = unique violation → already processed.
    if (insertError.code === '23505') return json({ ok: true, duplicate: true });
    log('webhook.insert_failed', { requestId: rid, error: insertError.message });
    return json({ error: 'storage error' }, 500);
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw);
  } catch {
    await admin.from('payment_events').update({ status: 'error', processing_error: 'bad json' }).eq('id', inserted!.id);
    return json({ error: 'bad payload' }, 400);
  }

  const type = String(payload.type ?? 'unknown');
  const external = (payload.metadata as Record<string, unknown> | undefined)?.externalMetadata as
    | Record<string, string>
    | undefined;

  try {
    if (type === 'codi.pn.payment_received' || type === 'codi.qr.payment_received') {
      const peyId = String(payload.transactionId ?? '');
      const ourId = external?.txId ?? null;

      const base = admin
        .from('transactions')
        .select('id, status, store_id, pey_transaction_id');
      const { data: found } = ourId
        ? await base.eq('id', ourId).maybeSingle()
        : await base.eq('pey_transaction_id', peyId).maybeSingle();

      if (!found) {
        await admin
          .from('payment_events')
          .update({ type, status: 'orphan', payload })
          .eq('id', inserted!.id);
        log('webhook.orphan', { requestId: rid, pey: peyId, type });
        return json({ ok: true, orphan: true });
      }

      const datePaid = Number(payload.datePaid ?? 0);
      const paidAt = datePaid > 0 ? new Date(datePaid * 1000).toISOString() : new Date().toISOString();
      const meta = (payload.metadata ?? {}) as Record<string, unknown>;
      const clabe = typeof meta.clabe === 'string' ? meta.clabe : null;
      const bankCode = typeof meta.bankCode === 'number' ? meta.bankCode : null;

      await admin
        .from('transactions')
        .update({
          status: 'paid',
          paid_at: paidAt,
          pey_transaction_id: found.pey_transaction_id ?? peyId,
          payer_clabe_last4: clabe ? clabe.slice(-4) : null,
          payer_bank_code: bankCode,
          late_payment: found.status === 'cancelled' || found.status === 'expired',
        })
        .eq('id', found.id);

      await admin
        .from('payment_events')
        .update({ type, status: 'processed', payload, transaction_id: found.id, processed_at: new Date().toISOString() })
        .eq('id', inserted!.id);

      log('webhook.paid', { requestId: rid, tx: found.id, type });
      return json({ ok: true });
    }

    await admin.from('payment_events').update({ type, status: 'processed', payload }).eq('id', inserted!.id);
    return json({ ok: true, ignored: type });
  } catch (err) {
    await admin
      .from('payment_events')
      .update({ status: 'error', processing_error: err instanceof Error ? err.message : 'error', payload })
      .eq('id', inserted!.id);
    log('webhook.failed', { requestId: rid, error: err instanceof Error ? err.message : String(err) });
    return json({ error: 'processing failed' }, 500);
  }
});
