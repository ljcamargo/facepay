'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, ExternalLink, ShieldCheck } from 'lucide-react';
import { formatMxInput, formatMxn, t, toE164Mx } from '@facepay/shared';
import { createFaceEngine, evaluateGates, type FaceEngine } from '@facepay/face-engine';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { CameraStage } from '@/components/camera-stage';
import { StepProgress } from '@/components/step-progress';
import { ensureSession, enrollMyFace, recordConsent, savePhone } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import type { LegalHashes } from '@/lib/legal';

type Step = 'phone' | 'consent' | 'face' | 'done';

interface Props {
  token: string; // the kiosk's transaction id
  legal: LegalHashes;
}

interface CheckoutInfo {
  amountCents: number;
  concept: string;
  storeName: string;
}

const GOOD_FRAMES = 8;

export function OnboardingFlow({ token, legal }: Props) {
  const router = useRouter();
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const engineRef = React.useRef<FaceEngine | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);

  const [step, setStep] = React.useState<Step>('phone');
  const [info, setInfo] = React.useState<CheckoutInfo | null>(null);
  const [missing, setMissing] = React.useState(false);
  const [phone, setPhone] = React.useState('');
  const [e164, setE164] = React.useState<string | null>(null);
  const [consent, setConsent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [hint, setHint] = React.useState<string | null>(null);
  const [debug, setDebug] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!supabase) {
      setMissing(true);
      return;
    }
    void (async () => {
      try {
        const { data, error } = await supabase.rpc('public_checkout_info', { p_tx: token });
        const row = Array.isArray(data) ? data[0] : data;
        if (error || !row) {
          setMissing(true);
          return;
        }
        setInfo({
          amountCents: row.amount_cents,
          concept: row.concept,
          storeName: row.store_name,
        });
      } catch {
        setMissing(true);
      }
    })();
  }, [token]);

  React.useEffect(() => {
    if (step !== 'face') return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    let streak = 0;
    let busyFrame = false;

    async function boot() {
      try {
        if (!window.isSecureContext) throw new Error('INSECURE');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720, facingMode: 'user' },
          audio: false,
        });
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) throw new Error('NO_VIDEO');
        video.srcObject = stream;
        await video.play();

        const engine = createFaceEngine();
        engineRef.current = engine;
        await engine.load({ modelBasePath: '/models/human/', hands: false });
        if (cancelled) return;

        timer = setInterval(async () => {
          if (busyFrame || cancelled || !videoRef.current) return;
          busyFrame = true;
          try {
            const analysis = await engine.analyze(videoRef.current);
            const gates = evaluateGates(analysis.faces, analysis.frame);
            const ok = gates.every((g) => g.ok);
            streak = ok ? streak + 1 : 0;
            setProgress(Math.min(1, streak / GOOD_FRAMES));
            setHint(ok ? null : gates.find((g) => !g.ok)?.hintKey ?? null);
            setDebug(
              `${analysis.faces.length} rostro(s) · yaw ${Math.round(analysis.signals.yaw)}° · nitidez ${Math.round(analysis.frame.sharpness)} · luz ${Math.round(analysis.frame.meanLuma)}`,
            );

            if (streak >= GOOD_FRAMES) {
              if (timer) clearInterval(timer);
              timer = null;
              setBusy(true);
              try {
                const capture = await engine.embed(videoRef.current);
                await enrollMyFace({
                  vector: capture.embedding.vector,
                  model: capture.embedding.model,
                  version: capture.embedding.version,
                  quality: capture.quality,
                  liveness: capture.liveness,
                  scope: 'global',
                });
                if (!cancelled) setStep('done');
              } catch (err) {
                if (!cancelled) {
                  const message = err instanceof Error ? err.message : '';
                  setError(
                    message.includes('consent')
                      ? 'Falta tu consentimiento. Vuelve al paso anterior.'
                      : `No pudimos guardar tu rostro. ${message || 'Intenta otra vez.'}`,
                  );
                }
              } finally {
                if (!cancelled) setBusy(false);
              }
            }
          } catch {
            streak = 0;
          } finally {
            busyFrame = false;
          }
        }, 140);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : '';
        setError(
          message.includes('INSECURE')
            ? 'La cámara requiere HTTPS. Abre esta página desde el enlace de la tablet.'
            : 'No pudimos abrir tu cámara. Puedes pedirle al cajero otro método.',
        );
      }
    }

    void boot();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      engineRef.current?.dispose();
    };
  }, [step]);

  if (missing) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-lg font-medium">{t('onboarding.expired')}</p>
        <Link href="/kiosk" className="text-sm text-primary underline-offset-4 hover:underline">
          {t('common.back')}
        </Link>
      </div>
    );
  }

  const steps: Step[] = ['phone', 'consent', 'face', 'done'];
  const stepNumber = Math.max(1, steps.indexOf(step) + 1);

  function abort() {
    // Leave the wizard; the chooser still offers "solo pagar".
    router.replace(`/start/${token}`);
  }

  async function submitPhone(e: React.FormEvent) {
    e.preventDefault();
    const normalized = toE164Mx(phone);
    if (!normalized) {
      setError(t('onboarding.phone.invalid'));
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await ensureSession();
      await savePhone(normalized);
      setE164(normalized);
      setStep('consent');
    } catch {
      setError(t('onboarding.authError'));
    } finally {
      setBusy(false);
    }
  }

  async function acceptConsent() {
    setBusy(true);
    setError(null);
    try {
      await ensureSession();
      await recordConsent({
        privacy: { version: legal.version, sha256: legal.privacy },
        biometric: { version: legal.version, sha256: legal.biometricConsent },
      });
      setStep('face');
    } catch {
      setError(t('onboarding.authError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-5 py-6">
      <header className="flex items-start justify-between">
        <div>
          <p className="text-lg font-semibold">{t('common.appName')}</p>
          <p className="text-xs text-muted-foreground">
            {info?.storeName ?? '—'} · {info ? formatMxn(info.amountCents) : '—'}
          </p>
        </div>
        {step !== 'done' && (
          <button
            type="button"
            onClick={abort}
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Cancelar
          </button>
        )}
      </header>

      <StepProgress step={stepNumber} total={steps.length} label={t('onboarding.phone.title')} />

      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

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
          <Button type="submit" size="lg" disabled={phone.replace(/\D/g, '').length !== 10 || busy}>
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

          <Button size="lg" disabled={!consent || busy} onClick={() => void acceptConsent()}>
            {t('onboarding.consent.accept')}
          </Button>
        </div>
      )}

      {step === 'face' && (
        <div className="flex flex-1 flex-col gap-3">
          <h1 className="text-xl font-semibold tracking-tight">{t('onboarding.face.title')}</h1>
          <CameraStage
            fill
            className="min-h-0 flex-1"
            videoRef={videoRef}
            progress={progress}
            challenge={t('onboarding.face.look')}
            hint={hint ? t(hint as never) : t('onboarding.face.still')}
            debug={debug}
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-muted-foreground">{t('onboarding.face.local')}</p>
            {busy && <p className="text-xs font-medium text-primary">Guardando…</p>}
          </div>
        </div>
      )}

      {step === 'done' && (
        <div className="flex flex-col items-center gap-5 text-center">
          <div className="flex size-20 items-center justify-center rounded-full bg-success/15 text-success">
            <Check className="size-10" aria-hidden />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('onboarding.done.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('onboarding.done.linked')}</p>

          <Card className="w-full">
            <CardContent className="flex flex-col gap-1 p-5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tienda</span>
                <span className="font-medium">{info?.storeName ?? '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Monto</span>
                <span className="amount font-medium">
                  {info ? formatMxn(info.amountCents) : '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Celular</span>
                <span className="font-medium">•••• {e164?.slice(-4)}</span>
              </div>
            </CardContent>
          </Card>

          <p className="rounded-xl bg-primary/10 px-4 py-3 text-sm font-medium text-primary">
            Listo. Vuelve a mirar la cámara de la tablet para pagar.
          </p>

          <button
            type="button"
            onClick={() => router.refresh()}
            className="text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            Cerrar
          </button>
        </div>
      )}
    </div>
  );
}
