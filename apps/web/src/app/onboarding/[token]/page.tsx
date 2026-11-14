'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Check, ExternalLink, ShieldCheck } from 'lucide-react';
import {
  formatMxInput,
  formatMxn,
  t,
  toE164Mx,
} from '@facepay/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { CameraStage } from '@/components/camera-stage';
import { StepProgress } from '@/components/step-progress';
import { MockBadge } from '@/components/mock-badge';
import { createTxFromSession, getSession, sendPush } from '@/lib/mock';

type Step = 'phone' | 'consent' | 'face' | 'done';

export default function OnboardingPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const token = params?.token ?? '';

  const [mode, setMode] = React.useState<'register' | 'pay'>('register');
  const [step, setStep] = React.useState<Step>('phone');
  const [phone, setPhone] = React.useState('');
  const [e164, setE164] = React.useState<string | null>(null);
  const [consent, setConsent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [progress, setProgress] = React.useState(0.05);

  // Resolve in an effect: localStorage is not available during SSR, and reading
  // it during render would desynchronise hydration.
  const [resolved, setResolved] = React.useState<{
    checked: boolean;
    session: ReturnType<typeof getSession>;
  }>({ checked: false, session: null });
  const session = resolved.session;

  React.useEffect(() => {
    setResolved({ checked: true, session: getSession(token) });
  }, [token]);

  React.useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    setMode(search.get('mode') === 'pay' ? 'pay' : 'register');
  }, []);

  React.useEffect(() => {
    if (step !== 'face') return;
    const timer = setInterval(() => setProgress((p) => Math.min(1, p + 0.03)), 80);
    const done = setTimeout(() => {
      clearInterval(timer);
      setProgress(1);
      setStep('done');
    }, 2800);
    return () => {
      clearInterval(timer);
      clearTimeout(done);
    };
  }, [step]);

  if (!resolved.checked) {
    return <div className="min-h-dvh" aria-busy="true" />;
  }

  if (!session) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-lg font-medium">{t('onboarding.expired')}</p>
        <Link href="/kiosk" className="text-sm text-primary underline-offset-4 hover:underline">
          {t('common.back')}
        </Link>
      </div>
    );
  }

  const steps: Step[] = mode === 'pay' ? ['phone', 'done'] : ['phone', 'consent', 'face', 'done'];
  const stepNumber = Math.max(1, steps.indexOf(step) + 1);

  function submitPhone(e: React.FormEvent) {
    e.preventDefault();
    const normalized = toE164Mx(phone);
    if (!normalized) {
      setError(t('onboarding.phone.invalid'));
      return;
    }
    setError(null);
    setE164(normalized);
    setStep(mode === 'pay' ? 'done' : 'consent');
  }

  function finish() {
    if (!e164) return;
    const tx = createTxFromSession(token, e164, { enroll: mode === 'register' });
    if (!tx) {
      setError(t('onboarding.expired'));
      return;
    }
    sendPush(tx.id);
    router.push(`/pay/${tx.id}`);
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-5 py-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-lg font-semibold">{t('common.appName')}</p>
          <p className="text-xs text-muted-foreground">
            {session.storeName} · {formatMxn(session.amountCents)}
          </p>
        </div>
        <MockBadge />
      </header>

      <StepProgress step={stepNumber} total={steps.length} label={t('onboarding.phone.title')} />

      {step === 'phone' && (
        <form onSubmit={submitPhone} className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">{t('onboarding.phone.title')}</h1>
          <div className="flex flex-col gap-2">
            <label htmlFor="phone" className="text-sm font-medium">
              {t('onboarding.phone.label')}
            </label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => {
                setPhone(formatMxInput(e.target.value));
                setError(null);
              }}
              inputMode="numeric"
              autoComplete="tel-national"
              placeholder="55 1234 5678"
              className="tracking-wide"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">{t('onboarding.phone.help')}</p>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" disabled={phone.replace(/\D/g, '').length !== 10}>
            {t('onboarding.phone.continue')}
          </Button>
        </form>
      )}

      {step === 'consent' && (
        <div className="flex flex-col gap-4">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ShieldCheck className="size-6" aria-hidden />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('onboarding.consent.title')}</h1>
          <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
            <li>• {t('onboarding.consent.p1')}</li>
            <li>• {t('onboarding.consent.p2')}</li>
            <li>• {t('onboarding.consent.p3')}</li>
            <li>• {t('onboarding.consent.p4')}</li>
          </ul>

          <label className="flex items-start gap-3 rounded-xl border border-border p-4 text-sm">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 size-5 accent-[var(--primary)]"
            />
            <span>{t('onboarding.consent.checkbox')}</span>
          </label>

          <div className="flex flex-wrap gap-3 text-sm">
            <Link
              href="/legal/privacy"
              target="_blank"
              className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
            >
              {t('legal.privacy')} <ExternalLink className="size-3" aria-hidden />
            </Link>
            <Link
              href="/legal/biometric-consent"
              target="_blank"
              className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
            >
              {t('legal.consent')} <ExternalLink className="size-3" aria-hidden />
            </Link>
          </div>

          <Button
            size="lg"
            disabled={!consent}
            onClick={() => {
              setStep('face');
              setProgress(0.05);
            }}
          >
            {t('onboarding.consent.accept')}
          </Button>
          {!consent && (
            <p className="text-xs text-muted-foreground">{t('onboarding.consent.required')}</p>
          )}
        </div>
      )}

      {step === 'face' && (
        <div className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">{t('onboarding.face.title')}</h1>
          <CameraStage progress={progress} challenge={t('onboarding.face.challenge')} showVector />
          <p className="text-center text-xs text-muted-foreground">{t('onboarding.face.local')}</p>
          <Button
            variant="outline"
            onClick={() => {
              setStep('consent');
              setProgress(0.05);
            }}
          >
            {t('onboarding.face.stop')}
          </Button>
        </div>
      )}

      {step === 'done' && (
        <div className="flex flex-col items-center gap-5 text-center">
          <div className="flex size-20 items-center justify-center rounded-full bg-success/15 text-success">
            <Check className="size-10" aria-hidden />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {mode === 'register' ? t('onboarding.done.title') : t('onboarding.phone.title')}
          </h1>
          {mode === 'register' && (
            <p className="text-sm text-muted-foreground">{t('onboarding.done.linked')}</p>
          )}

          <Card className="w-full">
            <CardContent className="flex flex-col gap-1 p-5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tienda</span>
                <span className="font-medium">{session.storeName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Monto</span>
                <span className="amount font-medium">{formatMxn(session.amountCents)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Celular</span>
                <span className="font-medium">•••• {e164?.slice(-4)}</span>
              </div>
            </CardContent>
          </Card>

          <Button size="lg" className="w-full" onClick={finish} disabled={!e164}>
            {t('onboarding.done.pay', { amount: formatMxn(session.amountCents) })}
          </Button>
          <p className="text-xs text-muted-foreground">{t('onboarding.done.qr')}</p>
        </div>
      )}
    </div>
  );
}
