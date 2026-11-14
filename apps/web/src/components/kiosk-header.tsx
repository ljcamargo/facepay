'use client';

import Link from 'next/link';
import { History, Settings, Wifi } from 'lucide-react';
import { t } from '@facepay/shared';
import { MockBadge } from '@/components/mock-badge';
import { ThemeToggle } from '@/components/theme-toggle';
import { cn } from '@/lib/utils';

interface Props {
  storeName: string;
  deviceLabel: string;
  className?: string;
}

export function KioskHeader({ storeName, deviceLabel, className }: Props) {
  return (
    <header
      className={cn(
        'flex items-center justify-between gap-4 border-b border-border px-6 py-3 md:px-12',
        className,
      )}
    >
      <div className="flex items-baseline gap-3">
        <span className="text-lg font-semibold tracking-tight">{t('common.appName')}</span>
        <span className="text-sm text-muted-foreground">
          {storeName} · {deviceLabel}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <MockBadge />
        <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex">
          <Wifi className="size-3.5 text-success" aria-hidden />
          {t('common.online')}
        </span>
        <Link
          href="/kiosk/history"
          className="inline-flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
          aria-label={t('kiosk.home.history')}
        >
          <History className="size-5" aria-hidden />
        </Link>
        <Link
          href="/kiosk/settings"
          className="inline-flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
          aria-label={t('kiosk.home.settings')}
        >
          <Settings className="size-5" aria-hidden />
        </Link>
        <ThemeToggle compact />
      </div>
    </header>
  );
}
