'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, LogOut } from 'lucide-react';
import { FACE, formatMxn, t } from '@facepay/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ThemeToggle } from '@/components/theme-toggle';
import { getStaffSession, signOutVendor, type StaffSession } from '@/lib/db';

const PILOT_LIMIT = 30_000;

export default function SettingsPage() {
  const router = useRouter();
  const [staff, setStaff] = React.useState<StaffSession | null>(null);

  React.useEffect(() => {
    void getStaffSession().then(setStaff).catch(() => undefined);
  }, []);

  async function signOut() {
    await signOutVendor().catch(() => undefined);
    router.replace('/kiosk/setup');
  }

  return (
    <div className="flex flex-1 flex-col gap-6 px-6 py-6 md:px-12">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => router.push('/kiosk')}>
          <ArrowLeft className="size-4" aria-hidden /> {t('common.back')}
        </Button>
        <h1 className="text-lg font-semibold">{t('kiosk.settings.title')}</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('kiosk.settings.theme')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ThemeToggle />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('kiosk.settings.pilotLimit')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="amount text-2xl font-semibold">{formatMxn(PILOT_LIMIT)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Candado del piloto, no un control de seguridad: el banco autoriza el pago.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('kiosk.settings.device')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <p>
              {staff?.storeName ?? '—'} · {staff?.displayName ?? '—'} ·{' '}
              <span className="text-muted-foreground">{staff?.role ?? '—'}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Umbrales: similitud {FACE.minSimilarity.toFixed(2)} · margen{' '}
              {FACE.minMargin.toFixed(2)}
            </p>
            <Button variant="outline" size="sm" className="mt-2 self-start" onClick={() => void signOut()}>
              <LogOut className="size-4" aria-hidden /> Desconectar
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Desarrollo</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-xs">
            <Link href="/dev/face" className="text-primary underline-offset-4 hover:underline">
              Probador de cámara
            </Link>
            <Link href="/dev/calibrate" className="text-primary underline-offset-4 hover:underline">
              Calibración de umbral
            </Link>
            <p className="mt-2 text-muted-foreground">v0.3.0 · Fase A (cobro simulado)</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
