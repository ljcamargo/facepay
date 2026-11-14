'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ExternalLink, Smartphone, UserPlus } from 'lucide-react';
import { formatMxn, t, type OnboardingSession } from '@facepay/shared';
import { Button } from '@/components/ui/button';
import { QrPanel } from '@/components/qr-panel';
import { Countdown } from '@/components/countdown';
import {
  cancelTx,
  createSession,
  getTx,
  payTx,
  sessionTxId,
  startQr,
} from '@/lib/mock';
import { useTx } from '@/lib/hooks';

type Mode = 'menu' | 'register' | 'phone' | 'qr';

export default function FallbackPage() {
  const router = useRouter();
  const [txId, setTxId] = React.useState<string | null>(null);
  const [mode, setMode] = React.useState<Mode>('menu');
  const [session, setSession] = React.useState<OnboardingSession | null>(null);
  const qrStarted = React.useRef(false);
  const tx = useTx(txId ?? undefined);

  React.useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('tx');
    if (!id || !getTx(id)) {
      router.replace('/kiosk');
      return;
    }
    setTxId(id);
  }, [router]);

  // Registration / pay-by-phone: create the session once and wait for the phone tab.
  React.useEffect(() => {
    if (!txId || (mode !== 'register' && mode !== 'phone') || session) return;
    const current = getTx(txId);
    if (!current) return;
    setSession(createSession({ amountCents: current.amountCents, concept: current.concept }));
  }, [txId, mode, session]);

  React.useEffect(() => {
    if (!session) return;
    const timer = setInterval(() => {
      const linked = sessionTxId(session.token);
      if (linked) {
        clearInterval(timer);
        router.replace(`/kiosk/pay/${linked}`);
      }
    }, 700);
    return () => clearInterval(timer);
  }, [session, router]);

  // CoDi QR on the tablet: the mock pays itself after a few seconds.
  React.useEffect(() => {
    if (!txId || mode !== 'qr' || qrStarted.current) return;
    qrStarted.current = true;
    startQr(txId);
  }, [txId, mode]);

  React.useEffect(() => {
    if (tx?.status === 'paid') router.replace(`/kiosk/receipt/${tx.id}`);
  }, [tx?.status, tx?.id, router]);

  if (!tx) {
    return <div className="flex flex-1 items-center justify-center text-muted-foreground">…</div>;
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const onboardingUrl = session ? `${origin}/onboarding/${session.token}` : '';
  const onboardingUrlPay = session ? `${onboardingUrl}?mode=pay` : '';

  return (
    <div className="flex flex-1 flex-col gap-6 px-6 py-6 md:px-12">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => router.push('/kiosk')}>
          <ArrowLeft className="size-4" aria-hidden /> {t('common.cancel')}
        </Button>
        <span className="amount text-xl font-semibold">{formatMxn(tx.amountCents)}</span>
      </div>

      {mode === 'menu' && (
        <>
          <h1 className="max-w-2xl text-2xl font-semibold tracking-tight">
            {t('kiosk.fallback.title')}
          </h1>

          <div className="grid gap-4 md:grid-cols-3">
            <button
              type="button"
              onClick={() => setMode('register')}
              className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-card p-5 text-left transition-colors hover:border-primary/50 hover:bg-muted/40"
            >
              <span className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <UserPlus className="size-6" aria-hidden />
              </span>
              <span className="text-base font-medium">{t('kiosk.fallback.register')}</span>
              <span className="text-xs text-muted-foreground">
                {t('kiosk.fallback.registerTime')}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setMode('qr')}
              className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-card p-5 text-left transition-colors hover:border-primary/50 hover:bg-muted/40"
            >
              <span className="flex size-12 items-center justify-center rounded-xl bg-accent/20 text-accent-foreground dark:text-accent">
                <span className="grid grid-cols-3 gap-0.5" aria-hidden>
                  {Array.from({ length: 9 }, (_, i) => (
                    <span key={i} className="size-1.5 rounded-[1px] bg-current" />
                  ))}
                </span>
              </span>
              <span className="text-base font-medium">{t('kiosk.fallback.codiQr')}</span>
              <span className="text-xs text-muted-foreground">
                {t('kiosk.fallback.codiQrTime')}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setMode('phone')}
              className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-card p-5 text-left transition-colors hover:border-primary/50 hover:bg-muted/40"
            >
              <span className="flex size-12 items-center justify-center rounded-xl bg-muted text-foreground">
                <Smartphone className="size-6" aria-hidden />
              </span>
              <span className="text-base font-medium">{t('kiosk.fallback.phone')}</span>
              <span className="text-xs text-muted-foreground">
                {t('kiosk.fallback.phoneTime')}
              </span>
            </button>
          </div>

          <p className="text-sm text-muted-foreground">{t('kiosk.fallback.store')}</p>
        </>
      )}

      {(mode === 'register' || mode === 'phone') && (
        <div className="grid flex-1 items-center gap-8 md:grid-cols-2">
          <div className="flex flex-col gap-3">
            <h2 className="text-2xl font-semibold tracking-tight">
              {mode === 'register' ? t('kiosk.fallback.register') : t('kiosk.fallback.phone')}
            </h2>
            <p className="text-sm text-muted-foreground">
              Escanea con tu celular. La tablet continúa sola cuando termines.
            </p>
            {onboardingUrl && (
              <a
                href={mode === 'register' ? onboardingUrl : onboardingUrlPay}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-primary underline-offset-4 hover:underline"
              >
                {t('kiosk.fallback.openHere')}
                <ExternalLink className="size-3.5" aria-hidden />
              </a>
            )}
            <Button variant="outline" size="sm" className="mt-4 self-start" onClick={() => setMode('menu')}>
              {t('common.back')}
            </Button>
          </div>

          <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card p-6">
            {onboardingUrl ? (
              <>
                <QrPanel value={mode === 'register' ? onboardingUrl : onboardingUrlPay} size={210} />
                {session && <Countdown expiresAt={session.expiresAt} label={t('kiosk.fallback.remaining')} />}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
            )}
          </div>
        </div>
      )}

      {mode === 'qr' && (
        <div className="grid flex-1 items-center gap-8 md:grid-cols-2">
          <div className="flex flex-col gap-3">
            <h2 className="text-2xl font-semibold tracking-tight">{t('kiosk.fallback.codiQr')}</h2>
            <p className="text-sm text-muted-foreground">
              Abre tu app bancaria, escanea el código y aprueba el cobro CoDi.
            </p>
            {tx.expiresAt && <Countdown expiresAt={tx.expiresAt} label={t('kiosk.wait.expires')} />}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => txId && payTx(txId)}>
                {t('kiosk.wait.check')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (txId) cancelTx(txId);
                  router.push('/kiosk');
                }}
              >
                {t('common.cancel')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setMode('menu')}>
                {t('common.back')}
              </Button>
            </div>
          </div>

          <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card p-6">
            <QrPanel
              value={JSON.stringify({ TYP: 1, v: '01', ic: 0, IDC: `DEMO${tx.id.slice(-8)}` })}
              size={210}
              caption="QR CoDi (demo)"
            />
            <p className="text-xs text-muted-foreground">Esperando el pago…</p>
          </div>
        </div>
      )}
    </div>
  );
}
