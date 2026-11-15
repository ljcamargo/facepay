'use client';

import * as React from 'react';
import Link from 'next/link';
import { formatMxn, t, type Transaction } from '@facepay/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { listTxs } from '@/lib/db';
import { timeOfDay } from '@/lib/utils';

export default function HistoryPage() {
  const [txs, setTxs] = React.useState<Transaction[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    void listTxs(100)
      .then(setTxs)
      .catch(() => setError('No pudimos cargar los movimientos.'));
  }, []);

  const paid = txs.filter((tx) => tx.status === 'paid');
  const pending = txs.filter((tx) => tx.status === 'awaiting_payment' || tx.status === 'created');
  const collected = paid.reduce((sum, tx) => sum + tx.amountCents, 0);

  return (
    <div className="flex flex-1 flex-col gap-6 px-6 py-6 md:px-12">
      <h1 className="text-2xl font-semibold tracking-tight">{t('kiosk.history.title')}</h1>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {t('kiosk.home.collected')}
            </p>
            <p className="amount mt-2 text-3xl font-semibold">{formatMxn(collected)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {t('kiosk.home.payments')}
            </p>
            <p className="amount mt-2 text-3xl font-semibold">{paid.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {t('kiosk.home.pending')}
            </p>
            <p className="amount mt-2 text-3xl font-semibold">{pending.length}</p>
          </CardContent>
        </Card>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {txs.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {t('kiosk.history.empty')}
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <CardContent className="divide-y divide-border p-0">
            {txs.map((tx) => (
              <Link
                key={tx.id}
                href={tx.status === 'paid' ? `/kiosk/receipt/${tx.id}` : `/kiosk/pay/${tx.id}`}
                className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-muted/50"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{tx.concept}</p>
                  <p className="text-xs text-muted-foreground">
                    {timeOfDay(tx.createdAt)} · {tx.method ?? 'sin método'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="amount font-semibold">{formatMxn(tx.amountCents)}</span>
                  <Badge
                    tone={
                      tx.status === 'paid'
                        ? 'success'
                        : tx.status === 'awaiting_payment' || tx.status === 'created'
                          ? 'warning'
                          : 'default'
                    }
                  >
                    {tx.status === 'paid'
                      ? t('kiosk.history.paid')
                      : tx.status === 'awaiting_payment' || tx.status === 'created'
                        ? t('kiosk.history.awaiting')
                        : t('kiosk.history.cancelled')}
                  </Badge>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
