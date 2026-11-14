'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { DEMO_STORE, t } from '@facepay/shared';
import { KioskHeader } from '@/components/kiosk-header';
import { getDevice } from '@/lib/mock';
import { useMounted } from '@/lib/hooks';

export default function KioskLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const mounted = useMounted();
  const [device, setDevice] = React.useState<ReturnType<typeof getDevice>>(null);

  const isSetup = pathname === '/kiosk/setup';

  React.useEffect(() => {
    if (!mounted) return;
    const current = getDevice();
    setDevice(current);
    if (!current && !isSetup) router.replace('/kiosk/setup');
  }, [mounted, isSetup, router]);

  if (!mounted) {
    return <div className="min-h-dvh bg-background" aria-busy="true" />;
  }

  if (!device && !isSetup) {
    return <div className="min-h-dvh bg-background" aria-busy="true" />;
  }

  return (
    <div className="kiosk flex min-h-dvh flex-col bg-background">
      <KioskHeader storeName={DEMO_STORE.name} deviceLabel={device?.label ?? 'Nueva tablet'} />
      <main className="flex flex-1 flex-col">{children}</main>
      <footer className="border-t border-border px-6 py-3 text-center text-xs text-muted-foreground md:px-12">
        {t('common.disclosure')}
      </footer>
    </div>
  );
}
