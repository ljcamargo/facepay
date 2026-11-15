'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { formatMxn, t, type CopyKey } from '@facepay/shared';
import {
  createFaceEngine,
  evaluateGates,
  worstHint,
  type FaceEngine,
} from '@facepay/face-engine';
import { CameraStage } from '@/components/camera-stage';
import { Button } from '@/components/ui/button';
import { getStaffSession, getTx, identifyFace } from '@/lib/db';
import { setTxContext } from '@/lib/tx-context';
import { hasSupabase } from '@/lib/supabase';

const GOOD_FRAMES = 5; // ~0.7 s of a clean, frontal frame
const TIMEOUT_MS = 12_000;

export default function IdentifyPage() {
  const router = useRouter();
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const engineRef = React.useRef<FaceEngine | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);

  const [txId, setTxId] = React.useState<string | null>(null);
  const [amount, setAmount] = React.useState(0);
  const [stage, setStage] = React.useState<'loading' | 'scanning' | 'error'>('loading');
  const [progress, setProgress] = React.useState(0);
  const [hint, setHint] = React.useState<CopyKey | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const done = React.useRef(false);

  const goFallback = React.useCallback(
    (id: string) => {
      if (done.current) return;
      done.current = true;
      router.replace(`/kiosk/fallback?tx=${id}`);
    },
    [router],
  );

  React.useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('tx');
    if (!id) {
      router.replace('/kiosk');
      return;
    }
    setTxId(id);
    void getTx(id)
      .then((tx) => tx && setAmount(tx.amountCents))
      .catch(() => undefined);
  }, [router]);

  React.useEffect(() => {
    if (!txId || !hasSupabase) return;
    const id = txId;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    let streak = 0;
    let busy = false;

    const timeout = setTimeout(() => {
      if (!done.current) {
        setError('No pudimos identificarte a tiempo.');
        goFallback(id);
      }
    }, TIMEOUT_MS);

    async function boot() {
      try {
        if (!window.isSecureContext) throw new Error('INSECURE_CONTEXT');

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

        const staff = await getStaffSession();
        if (!staff) throw new Error('NO_STAFF');

        setStage('scanning');

        timer = setInterval(async () => {
          if (busy || cancelled || done.current || !videoRef.current) return;
          busy = true;
          try {
            const analysis = await engine.analyze(videoRef.current);
            const gates = evaluateGates(analysis.faces, analysis.frame);
            setHint(worstHint(gates));

            const ok = gates.every((g) => g.ok);
            streak = ok ? streak + 1 : 0;
            setProgress(Math.min(1, streak / GOOD_FRAMES));

            if (streak >= GOOD_FRAMES) {
              if (timer) clearInterval(timer);
              timer = null;
              const capture = await engine.embed(videoRef.current);
              const match = await identifyFace({
                vector: capture.embedding.vector,
                model: capture.embedding.model,
                storeId: staff.storeId,
              });

              if (match.decision === 'matched' && match.customerId) {
                if (done.current) return;
                done.current = true;
                setTxContext(id, {
                  customerId: match.customerId,
                  displayName: match.displayName,
                  phoneMasked: match.phoneMasked,
                  similarity: match.similarity,
                  liveness: capture.liveness,
                });
                router.replace(`/kiosk/confirm?tx=${id}`);
              } else {
                goFallback(id);
              }
            }
          } catch {
            // A single bad frame is not fatal: keep scanning.
            streak = 0;
          } finally {
            busy = false;
          }
        }, 140);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : '';
        setStage('error');
        setError(
          message.includes('INSECURE_CONTEXT')
            ? 'La cámara requiere HTTPS.'
            : 'No pudimos abrir la cámara.',
        );
      }
    }

    void boot();

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      if (timer) clearInterval(timer);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      engineRef.current?.dispose();
    };
  }, [txId, goFallback, router]);

  if (!txId) return <div className="flex flex-1 items-center justify-center">…</div>;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-6 md:px-12">
      <div className="flex w-full max-w-3xl items-center justify-between">
        <p className="text-lg font-medium">{t('kiosk.identify.title', { amount: formatMxn(amount) })}</p>
        <Button variant="ghost" size="sm" onClick={() => goFallback(txId)}>
          <X className="size-4" aria-hidden /> {t('common.cancel')}
        </Button>
      </div>

      <CameraStage
        videoRef={videoRef}
        progress={progress}
        challenge={stage === 'loading' ? t('kiosk.identify.preparing') : t('kiosk.identify.look')}
        hint={error ?? (hint ? t(hint) : t('kiosk.identify.holdStill'))}
        showVector={false}
      />

      <p className="max-w-xl text-center text-sm text-muted-foreground">
        {t('kiosk.identify.privacy')}
      </p>

      <Button variant="outline" onClick={() => goFallback(txId)}>
        {t('kiosk.identify.useQr')}
      </Button>
    </div>
  );
}
