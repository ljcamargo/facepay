'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Check, Loader2 } from 'lucide-react';
import { formatMxn, t } from '@facepay/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Countdown } from '@/components/countdown';
import { payTx } from '@/lib/mock';
import { useTx } from '@/lib/hooks';

export default function PhonePayPage() {
  const params = useParams<{ txId: string }>();
  const tx = useTx(params?.txId);

  if (!tx) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }

  const paid = tx.status === 'paid';
  const dead = tx.status === 'cancelled' || tx.status === 'expired';

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-6 px-5 py-8 text-center">
      {paid ? (
        <>
          <div className="flex size-20 items-center justify-center rounded-full bg-success/15 text-success">
            <Check className="size-10" aria-hidden />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('kiosk.receipt.title')}</h1>
          <p className="amount text-4xl font-semibold">{formatMxn(tx.amountCents)}</p>
          <p className="text-sm text-muted-foreground">{tx.concept}</p>
          <p className="text-sm text-muted-foreground">
            Muestra esta pantalla al cajero. La tablet ya recibió la confirmación.
          </p>
          <Link href="/mi-cuenta" className="text-sm text-primary underline-offset-4 hover:underline">
            {t('miCuenta.title')}
          </Link>
        </>
      ) : dead ? (
        <>
          <h1 className="text-xl font-semibold">{t('kiosk.error.timeout')}</h1>
          <p className="text-sm text-muted-foreground">
            Pide al cajero que genere una nueva solicitud.
          </p>
        </>
      ) : (
        <>
          <Loader2 className="size-10 animate-spin text-primary" aria-hidden />
          <h1 className="text-2xl font-semibold tracking-tight">{t('kiosk.wait.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('kiosk.wait.instruction')}</p>
          <Card className="w-full">
            <CardContent className="flex flex-col gap-2 p-5 text-left text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Monto</span>
                <span className="amount font-medium">{formatMxn(tx.amountCents)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Celular</span>
                <span className="font-medium">{tx.customer?.phoneMasked ?? '•••• ••••'}</span>
              </div>
            </CardContent>
          </Card>
          <Countdown expiresAt={tx.expiresAt} />
          <Button size="lg" className="w-full" onClick={() => payTx(tx.id)}>
            {t('kiosk.wait.check')}
          </Button>
          <p className="text-xs text-muted-foreground">{t('kiosk.confirm.disclosure')}</p>
        </>
      )}
    </div>
  );
}
