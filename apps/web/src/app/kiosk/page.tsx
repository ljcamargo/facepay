'use client';

import Link from 'next/link';
import { ArrowRight, Plus, Settings2 } from 'lucide-react';
import { formatMxn, t } from '@facepay/shared';
import { Card, CardContent } from '@/components/ui/card';
import { MockBadge } from '@/components/mock-badge';
import { todayStats } from '@/lib/mock';
import { timeOfDay } from '@/lib/utils';
import { useMounted } from '@/lib/hooks';

export default function KioskHomePage() {
  const mounted = useMounted();
  const stats = mounted ? todayStats() : null;

  return (
    <div className="flex flex-1 flex-col gap-8 px-6 py-8 md:px-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t('kiosk.home.title')}</h1>
        <MockBadge />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {t('kiosk.home.collected')}
            </p>
            <p className="amount mt-2 text-3xl font-semibold">
              {formatMxn(stats?.collectedCents ?? 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {t('kiosk.home.payments')}
            </p>
            <p className="amount mt-2 text-3xl font-semibold">{stats?.paidCount ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {t('kiosk.home.pending')}
            </p>
            <p className="amount mt-2 text-3xl font-semibold">{stats?.pendingCount ?? 0}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-1 items-center justify-center py-6">
        <Link
          href="/kiosk/checkout"
          className="inline-flex h-24 w-full max-w-xl items-center justify-center gap-3 rounded-xl bg-primary text-2xl font-medium text-primary-foreground shadow-sm shadow-primary/20 transition-[filter] hover:brightness-110"
        >
          <Plus className="size-7" aria-hidden />
          {t('kiosk.home.newSale')}
        </Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>
          {stats?.lastPaid
            ? `${t('kiosk.home.lastSale')}: ${formatMxn(stats.lastPaid.amountCents)} · ${timeOfDay(stats.lastPaid.paidAt ?? stats.lastPaid.createdAt)}`
            : 'Sin ventas todavía en esta sesión.'}
        </span>
        <div className="flex items-center gap-3">
          <Link href="/kiosk/history" className="inline-flex items-center gap-1.5 hover:text-foreground">
            {t('kiosk.home.history')} <ArrowRight className="size-4" aria-hidden />
          </Link>
          <Link href="/kiosk/settings" className="inline-flex items-center gap-1.5 hover:text-foreground">
            <Settings2 className="size-4" aria-hidden /> {t('kiosk.home.settings')}
          </Link>
        </div>
      </div>
    </div>
  );
}
