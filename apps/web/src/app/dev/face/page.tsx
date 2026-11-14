'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  CHALLENGES,
  challengeLabelKey,
  createFaceEngine,
  evaluateGates,
  initialChallenge,
  pickChallenge,
  shortHash,
  stepChallenge,
  worstHint,
  type ChallengeKind,
  type ChallengeState,
  type FaceEngine,
  type FaceGeometry,
  type FrameSignals,
  type FrameStats,
  type GateResult,
} from '@facepay/face-engine';
import { t, type CopyKey } from '@facepay/shared';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Report {
  faces: FaceGeometry[];
  frame: FrameStats;
  signals: FrameSignals;
  liveness: number;
  gates: GateResult[];
  hint: CopyKey | null;
}

interface Capture {
  hash: string;
  dims: number;
  ms: number;
  quality: number;
  liveness: number;
  bars: number[];
}

export default function FaceHarnessPage() {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const engineRef = React.useRef<FaceEngine | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const challengeRef = React.useRef<ChallengeState | null>(null);

  const [camera, setCamera] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [backend, setBackend] = React.useState<string>('—');
  const [fps, setFps] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [report, setReport] = React.useState<Report | null>(null);
  const [capture, setCapture] = React.useState<Capture | null>(null);
  const [challenge, setChallenge] = React.useState<ChallengeState | null>(null);
  const [challengeKind, setChallengeKind] = React.useState<ChallengeKind>('blink');
  const [withHands, setWithHands] = React.useState(false);

  const stop = React.useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCamera(false);
    setReport(null);
    setFps(0);
  }, []);

  React.useEffect(() => {
    return () => {
      stop();
      engineRef.current?.dispose();
    };
  }, [stop]);

  async function start() {
    setError(null);
    setLoading(true);
    try {
      // getUserMedia only exists in a secure context. Plain-HTTP LAN URLs (e.g.
      // http://192.168.x.x:3000) look like they work until this line throws.
      if (!window.isSecureContext) {
        throw new Error(
          'INSECURE_CONTEXT: la cámara requiere HTTPS. Abre la versión de Netlify o corre bun run dev:https.',
        );
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Este navegador no expone getUserMedia.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error('NO_VIDEO_ELEMENT');
      video.srcObject = stream;
      await video.play();

      const engine = engineRef.current ?? createFaceEngine();
      engineRef.current = engine;
      const { backend: chosen } = await engine.load({
        modelBasePath: '/models/human/',
        hands: withHands,
      });
      setBackend(chosen);
      setCamera(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(
        message.includes('INSECURE_CONTEXT')
          ? 'La cámara requiere HTTPS (no http:// en LAN). Usa la URL de Netlify o bun run dev:https.'
          : message.includes('models')
            ? 'Faltan los modelos. Corre: bun run models:sync'
            : `No pudimos iniciar: ${message}`,
      );
      stop();
    } finally {
      setLoading(false);
    }
  }

  // Analysis loop (~8 fps). Frames stay in the canvas; only numbers leave.
  React.useEffect(() => {
    if (!camera) return;
    let cancelled = false;
    let last = performance.now();
    let frames = 0;
    let fpsAt = last;

    const timer = setInterval(async () => {
      const engine = engineRef.current;
      const video = videoRef.current;
      if (!engine || !video || video.readyState < 2 || cancelled) return;

      try {
        const analysis = await engine.analyze(video);
        if (cancelled) return;
        const gates = evaluateGates(analysis.faces, analysis.frame);

        if (challengeRef.current && !challengeRef.current.satisfied && !challengeRef.current.failed) {
          challengeRef.current = stepChallenge(
            challengeRef.current,
            analysis.signals,
            performance.now(),
          );
          setChallenge(challengeRef.current);
        }

        setReport({ ...analysis, gates, hint: worstHint(gates) });

        frames += 1;
        const now = performance.now();
        if (now - fpsAt >= 1000) {
          setFps(Math.round((frames * 1000) / (now - fpsAt)));
          frames = 0;
          fpsAt = now;
        }
        last = now;
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    }, 130);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [camera]);

  async function captureTemplate() {
    const engine = engineRef.current;
    const video = videoRef.current;
    if (!engine || !video) return;
    setError(null);
    try {
      const started = performance.now();
      const result = await engine.embed(video);
      const ms = Math.round(performance.now() - started);
      const bars = Array.from({ length: 32 }, (_, i) => {
        const v = result.embedding.vector[i * 8] ?? 0;
        return Math.min(1, Math.abs(v) * 6);
      });
      setCapture({
        hash: shortHash(result.embedding.vector),
        dims: result.embedding.dim,
        ms,
        quality: result.quality,
        liveness: result.liveness,
        bars,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function startChallenge(kind: ChallengeKind) {
    const next = initialChallenge(kind, performance.now());
    challengeRef.current = next;
    setChallenge(next);
    setChallengeKind(kind);
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col gap-5 px-5 py-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Probador del motor facial</h1>
          <p className="text-xs text-muted-foreground">
            Fase 4 · nada se guarda ni se envía. Cierra esta pestaña al terminar.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="warning">DEV</Badge>
          <Link href="/kiosk" className="text-sm text-muted-foreground hover:text-foreground">
            Salir
          </Link>
        </div>
      </header>

      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardContent className="flex flex-col gap-3 p-4">
            <div className="relative overflow-hidden rounded-lg bg-black">
              <video
                ref={videoRef}
                playsInline
                muted
                className="aspect-[4/3] w-full scale-x-[-1] object-cover"
              />
              {!camera && (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-white/70">
                  Cámara apagada
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={withHands}
                  onChange={(e) => setWithHands(e.target.checked)}
                  disabled={camera || loading}
                />
                manos
              </label>
              <Button onClick={start} disabled={loading || camera}>
                {loading ? 'Cargando modelos…' : 'Encender cámara'}
              </Button>
              <Button variant="outline" onClick={stop} disabled={!camera}>
                Apagar
              </Button>
              <Button variant="secondary" onClick={captureTemplate} disabled={!camera}>
                Capturar plantilla
              </Button>
              <span className="ml-auto text-xs text-muted-foreground tabular">
                backend {backend} · {fps} fps
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Reto de vivacidad</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              {CHALLENGES.map((kind) => (
                <Button
                  key={kind}
                  size="sm"
                  variant={challengeKind === kind ? 'primary' : 'outline'}
                  onClick={() => startChallenge(kind)}
                  disabled={!camera}
                >
                  {t(challengeLabelKey(kind) as CopyKey).replace('Reto: ', '')}
                </Button>
              ))}
            </div>
            {challenge ? (
              <div className="flex flex-col gap-2 text-sm">
                <p className="font-medium">{t(challengeLabelKey(challenge.kind) as CopyKey)}</p>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-[width]"
                    style={{ width: `${Math.round(challenge.progress * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {challenge.satisfied
                    ? '✓ cumplido'
                    : challenge.failed
                      ? '✗ tiempo agotado'
                      : 'esperando…'}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Elige un reto. En producción es aleatorio.
              </p>
            )}
            <Button size="sm" variant="ghost" onClick={() => startChallenge(pickChallenge())} disabled={!camera}>
              Reto aleatorio
            </Button>
          </CardContent>
        </Card>
      </div>

      {capture && (
        <Card>
          <CardHeader>
            <CardTitle>Plantilla en memoria</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <div className="flex items-end gap-[2px]">
              {capture.bars.map((h, i) => (
                <span
                  key={i}
                  className="w-1.5 rounded-sm bg-primary/70"
                  style={{ height: `${Math.max(3, h * 60)}px` }}
                />
              ))}
            </div>
            <p className="text-xs text-muted-foreground tabular">
              {capture.dims} dims · hash {capture.hash} · {capture.ms} ms · calidad{' '}
              {capture.quality.toFixed(2)} · vivacidad {capture.liveness.toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground">
              Esto es una representación de los primeros valores. El vector completo no se muestra ni
              se guarda aquí.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Filtros de calidad</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5 text-sm">
            {report?.gates.map((gate) => (
              <div key={gate.id} className="flex items-center justify-between">
                <span className="text-muted-foreground">{gate.id}</span>
                <span className={gate.ok ? 'text-success' : 'text-destructive'}>
                  {gate.ok ? 'ok' : 'falla'}
                </span>
              </div>
            )) ?? <p className="text-muted-foreground">Sin datos.</p>}
            {report?.hint && (
              <p className="mt-2 rounded-md bg-amber-500/10 px-2 py-1 text-xs text-amber-700 dark:text-amber-400">
                Pista al cliente: {t(report.hint)}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Señales</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto text-xs leading-relaxed text-muted-foreground">
              {JSON.stringify(
                report
                  ? {
                      faces: report.faces.length,
                      liveness: Number(report.liveness.toFixed(3)),
                      luma: Math.round(report.frame.meanLuma),
                      sharpness: Math.round(report.frame.sharpness),
                      clipped: Number(report.frame.clippedRatio.toFixed(3)),
                      yaw: Math.round(report.signals.yaw),
                      pitch: Math.round(report.faces[0]?.pitch ?? 0),
                      roll: Math.round(report.faces[0]?.roll ?? 0),
                      blink: report.signals.blink,
                      smile: Number(report.signals.smile.toFixed(2)),
                      hands: report.signals.hands,
                      fingers: report.signals.fingers,
                      faceScale: Number(report.signals.faceScale.toFixed(2)),
                    }
                  : 'sin datos',
                null,
                2,
              )}
            </pre>
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">
        Si los filtros fallan en la tablet real, ajusta los umbrales en{' '}
        <code>packages/face-engine/src/gates.ts</code> y vuelve a medir aquí. Los números de esta
        pantalla son la evidencia para la calibración (docs/06 §4).
      </p>
    </div>
  );
}
