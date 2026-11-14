'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, RotateCcw, Unplug } from 'lucide-react';
import {
  DEMO_SETTINGS_PIN,
  FACE,
  formatMxn,
  t,
  type DemoFaceOutcome,
} from '@facepay/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ThemeToggle } from '@/components/theme-toggle';
import { getDevice, getSettings, resetDemo, setFaceOutcome, unpairDevice } from '@/lib/mock';
import { DEMO_PILOT_LIMIT } from '@/lib/mock';
import { cn } from '@/lib/utils';

const OUTCOMES: Array<{ value: DemoFaceOutcome; labelKey: 'kiosk.settings.demoMatched' | 'kiosk.settings.demoNoMatch' | 'kiosk.settings.demoAmbiguous' }> = [
  { value: 'matched', labelKey: 'kiosk.settings.demoMatched' },
  { value: 'no_match', labelKey: 'kiosk.settings.demoNoMatch' },
  { value: 'ambiguous', labelKey: 'kiosk.settings.demoAmbiguous' },
];

export default function SettingsPage() {
  const router = useRouter();
  const [unlocked, setUnlocked] = React.useState(false);
  const [pin, setPin] = React.useState('');
  const [pinError, setPinError] = React.useState(false);
  const [outcome, setOutcome] = React.useState<DemoFaceOutcome>('matched');
  const [deviceLabel, setDeviceLabel] = React.useState('—');

  React.useEffect(() => {
    setOutcome(getSettings().faceOutcome);
    setDeviceLabel(getDevice()?.label ?? '—');
  }, []);

  function unlock(e: React.FormEvent) {
    e.preventDefault();
    if (pin === DEMO_SETTINGS_PIN) {
      setUnlocked(true);
      setPinError(false);
      return;
    }
    setPinError(true);
  }

  if (!unlocked) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-8">
        <form onSubmit={unlock} className="w-full max-w-sm">
          <Card>
            <CardHeader>
              <CardTitle>{t('kiosk.settings.title')}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <label htmlFor="pin" className="text-sm text-muted-foreground">
                {t('kiosk.settings.pin')}
              </label>
              <Input
                id="pin"
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                autoFocus
              />
              {pinError && (
                <p role="alert" className="text-sm text-destructive">
                  PIN incorrecto.
                </p>
              )}
              <Button type="submit" disabled={pin.length < 4}>
                {t('common.next')}
              </Button>
              <p className="text-xs text-muted-foreground">{t('kiosk.settings.pinHint')}</p>
            </CardContent>
          </Card>
        </form>
      </div>
    );
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
            <p className="amount text-2xl font-semibold">{formatMxn(DEMO_PILOT_LIMIT)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Candado del piloto, no un control de seguridad: el banco autoriza el pago.
            </p>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>{t('kiosk.settings.demo')}</CardTitle>
            <p className="text-sm text-muted-foreground">{t('kiosk.settings.demoHint')}</p>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {OUTCOMES.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  setOutcome(option.value);
                  setFaceOutcome(option.value);
                }}
                className={cn(
                  'h-10 rounded-full border px-4 text-sm transition-colors',
                  outcome === option.value
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border hover:bg-muted',
                )}
              >
                {t(option.labelKey)}
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('kiosk.settings.device')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <p>
              Caja 2 · {deviceLabel} · <span className="text-muted-foreground">store-cafe-centro</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Umbrales: similitud {FACE.minSimilarity.toFixed(2)} · margen{' '}
              {FACE.minMargin.toFixed(2)} · vivacidad {FACE.minLiveness.toFixed(2)}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2 self-start"
              onClick={() => {
                unpairDevice();
                router.replace('/kiosk/setup');
              }}
            >
              <Unplug className="size-4" aria-hidden /> {t('kiosk.settings.unpair')}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Demo</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => {
                resetDemo();
                router.replace('/kiosk/setup');
              }}
            >
              <RotateCcw className="size-4" aria-hidden /> {t('kiosk.settings.reset')}
            </Button>
            <p className="text-xs text-muted-foreground">v0.2.0 · Fase 4 (motor facial)</p>
            <div className="mt-2 flex flex-col gap-1 text-xs">
              <Link href="/dev/face" className="text-primary underline-offset-4 hover:underline">
                Probador de cámara
              </Link>
              <Link href="/dev/calibrate" className="text-primary underline-offset-4 hover:underline">
                Calibración de umbral
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
