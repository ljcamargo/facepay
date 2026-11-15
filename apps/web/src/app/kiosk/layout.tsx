'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { t } from '@facepay/shared';
import { KioskHeader } from '@/components/kiosk-header';
import { getStaffSession, type StaffSession } from '@/lib/db';
import { useMounted } from '@/lib/hooks';
import { hasSupabase } from '@/lib/supabase';

export default function KioskLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const mounted = useMounted();
  const [staff, setStaff] = React.useState<StaffSession | null>(null);
  const [checked, setChecked] = React.useState(false);

  const isSetup = pathname === '/kiosk/setup';

  React.useEffect(() => {
    if (!mounted) return;
    let active = true;
    getStaffSession()
      .then((session) => {
        if (!active) return;
        setStaff(session);
        setChecked(true);
        if (!session && !isSetup) router.replace('/kiosk/setup');
      })
      .catch(() => {
        if (!active) return;
        setChecked(true);
        if (!isSetup) router.replace('/kiosk/setup');
      });
    return () => {
      active = false;
    };
  }, [mounted, isSetup, router]);

  if (!mounted || (!staff && !isSetup) || (!checked && !isSetup)) {
    return <div className="min-h-dvh bg-background" aria-busy="true" />;
  }

  return (
    <div className="kiosk flex min-h-dvh flex-col bg-background">
      <KioskHeader
        storeName={staff?.storeName ?? 'FacePay MX'}
        deviceLabel={staff?.displayName ?? 'Nueva caja'}
        sandbox={staff?.peyMock ?? false}
      />
      <main className="flex flex-1 flex-col">{children}</main>
      <footer className="border-t border-border px-6 py-3 text-center text-xs text-muted-foreground md:px-12">
        {t('common.disclosure')}
      </footer>
      {!hasSupabase && (
        <p className="bg-destructive/10 px-6 py-2 text-center text-xs text-destructive">
          Supabase no está configurado: esta tablet no puede cobrar.
        </p>
      )}
    </div>
  );
}
