'use client';

import Link from 'next/link';
import { formatMxn, t, DEMO_BANKS } from '@facepay/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { listTx } from '@/lib/mock';
import { timeOfDay } from '@/lib/utils';
import { useMounted } from '@/lib/hooks';

export default function HistoryPage() {
  const mounted = useMounted();
  const txs = mounted ? listTx() : [];

  return (
    <div className="flex flex-1 flex-col gap-6 px-6 py-6 md:px-12">
      <h1 className="text-2xl font-semibold tracking-tight">{t('kiosk.history.title')}</h1>

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
                    {timeOfDay(tx.createdAt)} · {tx.method ?? 'sin método'} ·{' '}
                    {tx.payerBankCode ? (DEMO_BANKS[tx.payerBankCode] ?? tx.payerBankCode) : '—'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="amount font-semibold">{formatMxn(tx.amountCents)}</span>
                  <Badge
                    tone={
                      tx.status === 'paid'
                        ? 'success'
                        : tx.status === 'awaiting_payment'
                          ? 'warning'
                          : 'default'
                    }
                  >
                    {tx.status === 'paid'
                      ? t('kiosk.history.paid')
                      : tx.status === 'awaiting_payment'
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
