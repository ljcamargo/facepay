'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { formatMxn, t } from '@facepay/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cancelTransaction, confirmFacePayment, getTx } from '@/lib/db';
import { getTxContext } from '@/lib/tx-context';

const AUTO_SEND_MS = 5000;

/**
 * No confirmation button: a registered customer does not touch the tablet.
 * A 5 s reverse progress bar sends the request on its own; Cancel aborts.
 */
export default function ConfirmPage() {
  const router = useRouter();
  const [txId, setTxId] = React.useState<string | null>(null);
  const [amount, setAmount] = React.useState(0);
  const [left, setLeft] = React.useState(AUTO_SEND_MS);
  const [error, setError] = React.useState<string | null>(null);
  const sent = React.useRef(false);
  const [ctx, setCtx] = React.useState<ReturnType<typeof getTxContext>>(null);

  React.useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('tx');
    if (!id) {
      router.replace('/kiosk');
      return;
    }
    setTxId(id);
    setCtx(getTxContext(id));
    void getTx(id)
      .then((tx) => tx && setAmount(tx.amountCents))
      .catch(() => undefined);
  }, [router]);

  const send = React.useCallback(async () => {
    if (!txId || sent.current) return;
    const context = getTxContext(txId);
    if (!context) {
      router.replace(`/kiosk/fallback?tx=${txId}`);
      return;
    }
    sent.current = true;
    try {
      await confirmFacePayment({
        txId,
        customerId: context.customerId,
        similarity: context.similarity,
        liveness: context.liveness,
      });
      router.replace(`/kiosk/pay/${txId}`);
    } catch {
      sent.current = false;
      setError('No pudimos enviar la solicitud. Intenta de nuevo.');
    }
  }, [txId, router]);

  React.useEffect(() => {
    if (!txId) return;
    const started = Date.now();
    const timer = setInterval(() => {
      const elapsed = Date.now() - started;
      const remaining = Math.max(0, AUTO_SEND_MS - elapsed);
      setLeft(remaining);
      if (remaining === 0) {
        clearInterval(timer);
        void send();
      }
    }, 60);
    return () => clearInterval(timer);
  }, [txId, send]);

  async function abort() {
    if (!txId) return;
    sent.current = true;
    try {
      await cancelTransaction(txId);
    } catch {
      /* the row stays; not worth blocking the cashier */
    }
    router.replace('/kiosk');
  }

  const progress = Math.max(0, Math.min(1, left / AUTO_SEND_MS));

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-8 md:px-12">
      <div className="flex size-20 items-center justify-center rounded-full bg-primary/10 text-primary">
        <ShieldCheck className="size-10" aria-hidden />
      </div>

      <div className="text-center">
        <h1 className="text-4xl font-semibold tracking-tight">
          {ctx?.displayName ? `Hola, ${ctx.displayName}` : t('kiosk.confirm.title', { name: '' })}
        </h1>
        <p className="mt-2 text-lg text-muted-foreground">
          {t('kiosk.confirm.sendTo', { phone: ctx?.phoneMasked ?? '•••• ••••' })}
        </p>
        <p className="amount mt-4 text-2xl font-semibold">{formatMxn(amount)}</p>
      </div>

      <div className="w-full max-w-md">
        <p className="mb-2 text-center text-sm font-medium">Estamos validando tu rostro…</p>
        <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-100 ease-linear"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Enviando en {Math.ceil(left / 1000)} s · toca cancelar si no eres tú
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Button variant="outline" size="lg" className="h-14 px-10" onClick={() => void abort()}>
        {t('common.cancel')}
      </Button>

      <Card className="w-full max-w-md border-dashed">
        <CardContent className="p-4 text-center text-xs text-muted-foreground">
          {t('kiosk.confirm.disclosure')}
        </CardContent>
      </Card>
    </div>
  );
}
