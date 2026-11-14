'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { formatMxn, t } from '@facepay/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { getTx, sendPush } from '@/lib/mock';
import { useTx } from '@/lib/hooks';

export default function ConfirmPage() {
  const router = useRouter();
  const [txId, setTxId] = React.useState<string | null>(null);
  const tx = useTx(txId ?? undefined);

  React.useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('tx');
    if (!id || !getTx(id)) {
      router.replace('/kiosk');
      return;
    }
    setTxId(id);
  }, [router]);

  const customer = tx?.customer;

  function accept() {
    if (!tx) return;
    sendPush(tx.id);
    router.push(`/kiosk/pay/${tx.id}`);
  }

  function reject() {
    if (!tx) return;
    router.push(`/kiosk/fallback?tx=${tx.id}&reason=rejected`);
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-8 md:px-12">
      <div className="flex size-20 items-center justify-center rounded-full bg-primary/10 text-primary">
        <ShieldCheck className="size-10" aria-hidden />
      </div>

      <div className="text-center">
        <h1 className="text-4xl font-semibold tracking-tight">
          {t('kiosk.confirm.title', { name: customer?.displayName ?? '—' })}
        </h1>
        <p className="mt-2 text-lg text-muted-foreground">
          {t('kiosk.confirm.sendTo', { phone: customer?.phoneMasked ?? '•••• ••••' })}
        </p>
        <p className="amount mt-4 text-2xl font-semibold">{formatMxn(tx?.amountCents ?? 0)}</p>
      </div>

      <div className="flex w-full max-w-md flex-col gap-3">
        <Button size="lg" className="h-16 text-lg" onClick={accept}>
          {t('kiosk.confirm.yes')}
        </Button>
        <Button variant="outline" size="lg" className="h-14" onClick={reject}>
          {t('kiosk.confirm.no')}
        </Button>
      </div>

      <Card className="w-full max-w-md border-dashed">
        <CardContent className="p-4 text-center text-xs text-muted-foreground">
          <p>{t('kiosk.confirm.disclosure')}</p>
          <p className="mt-2">
            {t('kiosk.confirm.fingerprint', { hash: '7f3a9c…' })}
            <span className="ml-1 inline-flex gap-0.5 align-middle" aria-hidden>
              {Array.from({ length: 12 }, (_, i) => (
                <span
                  key={i}
                  className="inline-block size-1.5 rounded-[1px] bg-primary/60"
                  style={{ opacity: ((i * 37) % 10) / 10 + 0.15 }}
                />
              ))}
            </span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
