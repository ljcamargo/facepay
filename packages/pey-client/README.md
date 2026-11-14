# `@facepay/pey-client`

Typed, **server-only** client for the pey.mx API. Runs inside Supabase Edge Functions (Deno) and in
tests. Never imported by the browser.

## Surface

```ts
const pey = createPeyClient({ apiKey, baseUrl });

await pey.createPushNotification({
  amount: 80, phoneNumber: '5512345678', concept: 'Pedido #123',
  expiration: 600, numRef: '0042317', metadata: { txId },
});                                                  // → { transactionId, codiId }

await pey.createQr({ amount: 80, concept, expiration: 600, numRef, generateImage: false });
                                                     // → { id, qrString, qrImage }

await pey.getTransaction(peyTransactionId);          // → { status: 'PENDING'|'PAID', … }
await pey.createPaymentLink({ amount, successUrl, backUrl, hasTip, metadata });
```

## Rules

- `import 'server-only'` at the top; CI fails if this package ends up in a client chunk.
- Never log the API key or the full request headers. Errors are mapped to a stable code
  (`PEY_UNAVAILABLE`, `PEY_REJECTED`, `PEY_INVALID_PHONE`, …) per `docs/02-pey-integration.md` §7.
- Timeout every request (5 s) and never retry a 4xx.
- Amounts: the caller passes a number already converted from cents. The client does not do money math.
- `numRef` and `phoneNumber` are validated locally too, so an obvious mistake never reaches a real
  provider call (each test costs money).
- Webhook verification lives in `verifyWebhook()` in this package (Web Crypto, no dependencies) so it
  can be unit-tested with fixtures and re-used by the function.
