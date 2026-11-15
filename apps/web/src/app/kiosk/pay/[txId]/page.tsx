'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { formatMxn, t } from '@facepay/shared';
import { Button } from '@/components/ui/button';
import { Countdown } from '@/components/countdown';
import { cancelTransaction, demoMarkPaid, getTx } from '@/lib/db';
import { getTxContext } from '@/lib/tx-context';

/** How long the fake bank takes to "approve". Removed in Phase B. */
const SIMULATED_APPROVAL_MS = 6000;

export default function PayPage() {
  const params = useParams<{ txId: string }>();
  const router = useRouter();
  const [tx, setTx] = React.useState<Awaited<ReturnType<typeof getTx>>>(null);
  const [error, setError] = React.useState<string | null>(null);
  const simulated = React.useRef(false);

  React.useEffect(() => {
    const id = params?.txId;
    if (!id) return;
    let active = true;

    const load = async () => {
      try {
        const row = await getTx(id);
        if (active) setTx(row);
      } catch {
        if (active) setError('No pudimos consultar el cobro.');
      }
    };

    void load();
    const poll = setInterval(load, 900);
    const simulate = setTimeout(() => {
      if (simulated.current) return;
      simulated.current = true;
      void demoMarkPaid(id).catch(() => undefined);
    }, SIMULATED_APPROVAL_MS);

    return () => {
      active = false;
      clearInterval(poll);
      clearTimeout(simulate);
    };
  }, [params?.txId]);

  React.useEffect(() => {
    if (tx?.status === 'paid') router.replace(`/kiosk/receipt/${tx.id}`);
  }, [tx?.status, tx?.id, router]);

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
        <p className="text-lg font-medium">{error}</p>
        <Button variant="outline" onClick={() => router.push('/kiosk')}>
          {t('common.close')}
        </Button>
      </div>
    );
  }

  if (!tx) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }

  if (tx.status === 'cancelled' || tx.status === 'expired' || tx.status === 'failed') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
        <p className="text-lg font-medium">{t('kiosk.error.timeout')}</p>
        <Button variant="outline" onClick={() => router.push('/kiosk')}>
          {t('common.close')}
        </Button>
      </div>
    );
  }

  const ctx = getTxContext(tx.id);

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
            phone: ctx?.phoneMasked ?? '•••• ••••',
          })}
        </p>
        <p className="mt-1 text-muted-foreground">{t('kiosk.wait.instruction')}</p>
        <p className="mt-1 text-sm font-medium">{t('kiosk.wait.keepOpen')}</p>
      </div>

      <Countdown expiresAt={tx.expiresAt} label={t('kiosk.wait.expires')} className="text-base" />

      <Button
        size="lg"
        variant="outline"
        onClick={async () => {
          try {
            await cancelTransaction(tx.id);
          } catch {
            /* ignore */
          }
          router.push('/kiosk');
        }}
      >
        {t('common.cancel')}
      </Button>

      <p className="max-w-md text-center text-sm text-muted-foreground">{t('kiosk.wait.slow')}</p>
      <p className="text-xs text-muted-foreground">{t('kiosk.confirm.disclosure')}</p>
    </div>
  );
}
