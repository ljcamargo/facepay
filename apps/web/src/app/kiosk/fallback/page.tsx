'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { formatMxn, t } from '@facepay/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cancelTransaction, getTx } from '@/lib/db';
import { QrPanel } from '@/components/qr-panel';

/** Reached when the face is unknown, ambiguous or the customer cancels. */
export default function FallbackPage() {
  const router = useRouter();
  const [txId, setTxId] = React.useState<string | null>(null);
  const [amount, setAmount] = React.useState(0);
  const [origin, setOrigin] = React.useState('');

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('tx');
    if (!id) {
      router.replace('/kiosk');
      return;
    }
    setTxId(id);
    setOrigin(window.location.origin);
    void getTx(id)
      .then((tx) => tx && setAmount(tx.amountCents))
      .catch(() => undefined);
  }, [router]);

  // If the customer starts paying from their phone, the kiosk follows along.
  React.useEffect(() => {
    if (!txId) return;
    const poll = setInterval(() => {
      void getTx(txId)
        .then((tx) => {
          if (!tx) return;
          if (tx.status === 'paid') router.replace(`/kiosk/receipt/${txId}`);
          else if (tx.status === 'awaiting_payment') router.replace(`/kiosk/pay/${txId}`);
          else if (tx.status === 'cancelled' || tx.status === 'expired') router.replace('/kiosk');
        })
        .catch(() => undefined);
    }, 1000);
    return () => clearInterval(poll);
  }, [txId, router]);

  async function cancel() {
    if (txId) await cancelTransaction(txId).catch(() => undefined);
    router.replace('/kiosk');
  }

  if (!txId) return <div className="flex flex-1 items-center justify-center">…</div>;

  return (
    <div className="flex flex-1 flex-col gap-6 px-6 py-6 md:px-12">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => void cancel()}>
          <ArrowLeft className="size-4" aria-hidden /> {t('common.cancel')}
        </Button>
        <span className="amount text-xl font-semibold">{formatMxn(amount)}</span>
      </div>

      <div>
        <h1 className="max-w-2xl text-2xl font-semibold tracking-tight">
          No pudimos identificarte
        </h1>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-5">
          {origin ? (
            <QrPanel value={`${origin}/start/${txId}`} size={168} />
          ) : (
            <div className="h-[168px] w-[168px] animate-pulse rounded-lg bg-muted" />
          )}
          <span className="text-center text-sm font-medium">Regístrate o paga con tu celular</span>
          <span className="text-center text-xs text-muted-foreground">
            Escanea con tu teléfono. Toma menos de un minuto.
          </span>
          {origin && (
            <a
              href={`${origin}/start/${txId}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-primary underline-offset-4 hover:underline"
            >
              Abrir en este navegador (demo)
            </a>
          )}
        </div>

        <button
          type="button"
          onClick={() => router.replace(`/kiosk/identify?tx=${txId}`)}
          className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-card p-5 text-left transition-colors hover:border-primary/50 hover:bg-muted/40"
        >
          <span className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <RotateCcw className="size-6" aria-hidden />
          </span>
          <span className="text-base font-medium">Volver a mirar la cámara</span>
          <span className="text-xs text-muted-foreground">
            Si acabas de registrarte, ya deberíamos reconocerte.
          </span>
        </button>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-2 p-5 text-sm text-muted-foreground">
          <p>
            ¿Aún no tienes tu rostro registrado? Escanea el código de la tablet con tu celular: te
            toma menos de un minuto.
          </p>
          <p className="text-xs">El cajero puede cancelar este cobro y empezar de nuevo.</p>
        </CardContent>
      </Card>

      <Button variant="outline" className="self-start" onClick={() => void cancel()}>
        {t('common.cancel')}
      </Button>
    </div>
  );
}
