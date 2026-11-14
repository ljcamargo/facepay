'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { formatMxn, t } from '@facepay/shared';
import { Button } from '@/components/ui/button';
import { Countdown } from '@/components/countdown';
import { cancelTx, payTx, startQr } from '@/lib/mock';
import { useTx } from '@/lib/hooks';

export default function PayPage() {
  const params = useParams<{ txId: string }>();
  const router = useRouter();
  const tx = useTx(params?.txId);

  React.useEffect(() => {
    if (tx?.status === 'paid') router.replace(`/kiosk/receipt/${tx.id}`);
  }, [tx?.status, tx?.id, router]);

  if (!tx) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }

  if (tx.status === 'cancelled' || tx.status === 'expired') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
        <p className="text-lg font-medium">{t('kiosk.error.timeout')}</p>
        <div className="flex gap-2">
          <Button onClick={() => router.push(`/kiosk/fallback?tx=${tx.id}`)}>
            {t('kiosk.wait.useQr')}
          </Button>
          <Button variant="outline" onClick={() => router.push('/kiosk')}>
            {t('common.close')}
          </Button>
        </div>
      </div>
    );
  }

  if (tx.status === 'created') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
        <p className="text-lg">{formatMxn(tx.amountCents)}</p>
        <Button onClick={() => payTx(tx.id)}>{t('kiosk.wait.check')}</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-8">
      <div className="relative flex size-24 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-primary/10" aria-hidden />
        <Loader2 className="size-10 animate-spin text-primary" aria-hidden />
      </div>

      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight">{t('kiosk.wait.title')}</h1>
        <p className="mt-3 text-lg text-muted-foreground">
          {t('kiosk.wait.sent', {
            amount: formatMxn(tx.amountCents),
            phone: tx.customer?.phoneMasked ?? '•••• ••••',
          })}
        </p>
        <p className="mt-1 text-muted-foreground">{t('kiosk.wait.instruction')}</p>
        <p className="mt-1 text-sm font-medium">{t('kiosk.wait.keepOpen')}</p>
      </div>

      <Countdown expiresAt={tx.expiresAt} label={t('kiosk.wait.expires')} className="text-base" />

      <div className="flex flex-wrap justify-center gap-3">
        <Button size="lg" onClick={() => payTx(tx.id)}>
          {t('kiosk.wait.check')}
        </Button>
        <Button
          size="lg"
          variant="outline"
          onClick={() => {
            cancelTx(tx.id);
            router.push('/kiosk');
          }}
        >
          {t('common.cancel')}
        </Button>
        <Button
          size="lg"
          variant="ghost"
          onClick={() => {
            startQr(tx.id);
            router.push(`/kiosk/fallback?tx=${tx.id}`);
          }}
        >
          {t('kiosk.wait.useQr')}
        </Button>
      </div>

      <p className="max-w-md text-center text-sm text-muted-foreground">{t('kiosk.wait.slow')}</p>
      <p className="text-xs text-muted-foreground">{t('kiosk.confirm.disclosure')}</p>
    </div>
  );
}
