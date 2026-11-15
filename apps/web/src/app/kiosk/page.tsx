'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';
import { t } from '@facepay/shared';

/** Kiosk home: one button. Nothing about sales volume is visible to a customer. */
export default function KioskHomePage() {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-10">
      <Link
        href="/kiosk/checkout"
        className="inline-flex h-32 w-full max-w-xl flex-col items-center justify-center gap-3 rounded-2xl bg-primary text-3xl font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-[filter] hover:brightness-110"
      >
        <Plus className="size-10" aria-hidden />
        {t('kiosk.home.newSale')}
      </Link>
    </div>
  );
}
