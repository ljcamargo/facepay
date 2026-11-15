'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Check, Printer } from 'lucide-react';
import { DEMO_BANKS, formatMxn, t } from '@facepay/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { getTx } from '@/lib/db';
import { clearTxContext, getTxContext } from '@/lib/tx-context';
import { timeOfDay } from '@/lib/utils';

const RETURN_SECONDS = 30;

export default function ReceiptPage() {
  const params = useParams<{ txId: string }>();
  const router = useRouter();
  const [tx, setTx] = React.useState<Awaited<ReturnType<typeof getTx>>>(null);
  const [left, setLeft] = React.useState(RETURN_SECONDS);

  React.useEffect(() => {
    const id = params?.txId;
    if (!id) return;
    void getTx(id).then(setTx).catch(() => undefined);
  }, [params?.txId]);

  React.useEffect(() => {
    const timer = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, []);

  React.useEffect(() => {
    if (left === 0) router.replace('/kiosk');
  }, [left, router]);

  if (!tx) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        {t('common.loading')}
      </div>
    );
  }

  if (tx.status !== 'paid') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <p className="text-lg font-medium">{t('kiosk.wait.title')}</p>
        <Button variant="outline" onClick={() => router.replace(`/kiosk/pay/${tx.id}`)}>
          {t('kiosk.wait.check')}
        </Button>
      </div>
    );
  }

  const ctx = getTxContext(tx.id);
  const bank = tx.payerBankCode ? (DEMO_BANKS[tx.payerBankCode] ?? String(tx.payerBankCode)) : '—';

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-8">
      <div className="flex size-16 items-center justify-center rounded-full bg-success/15 text-success">
        <Check className="size-8" aria-hidden />
      </div>

      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight">{t('kiosk.receipt.title')}</h1>
        <p className="amount mt-3 text-5xl font-semibold">{formatMxn(tx.amountCents)}</p>
        <p className="mt-2 text-muted-foreground">
          {tx.concept} · {timeOfDay(tx.paidAt ?? tx.createdAt)}
        </p>
      </div>

      <Card className="w-full max-w-lg">
        <CardContent className="divide-y divide-border p-0 text-sm">
          <Row
            label={t('kiosk.receipt.folio')}
            value={`A-${String(tx.receiptNo ?? 0).padStart(6, '0')}`}
          />
          <Row
            label={t('kiosk.receipt.method')}
            value={
              tx.method === 'codi_qr' ? t('kiosk.receipt.methodQr') : t('kiosk.receipt.methodFace')
            }
          />
          <Row label="Cliente" value={ctx?.displayName ?? '—'} />
          <Row
            label={t('kiosk.receipt.bank')}
            value={`${bank} · CLABE •••• ${tx.payerClabeLast4 ?? '----'}`}
          />
          <Row label={t('kiosk.receipt.ref')} value={tx.id.slice(-12).toUpperCase()} />
        </CardContent>
      </Card>

      {tx.peyTransactionId?.startsWith('mock-') && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-700 dark:text-amber-400">
          Pago simulado (sandbox): no se movió dinero.
        </p>
      )}

      {tx.latePayment && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-700 dark:text-amber-400">
          {t('kiosk.receipt.late')}
        </p>
      )}

      <div className="flex flex-wrap justify-center gap-3">
        <Link
          href="/kiosk"
          onClick={() => clearTxContext(tx.id)}
          className="inline-flex h-14 items-center justify-center rounded-lg bg-primary px-6 text-base font-medium text-primary-foreground transition-[filter] hover:brightness-110"
        >
          {t('kiosk.receipt.newSale')}
        </Link>
        <Button variant="outline" size="lg" onClick={() => window.print()}>
          <Printer className="size-4" aria-hidden /> {t('kiosk.receipt.print')}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">{t('kiosk.receipt.returning', { s: left })}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
