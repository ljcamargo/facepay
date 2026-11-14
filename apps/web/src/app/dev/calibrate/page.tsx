'use client';

import * as React from 'react';
import Link from 'next/link';
import { createFaceEngine, type FaceEngine } from '@facepay/face-engine';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Offline calibration harness (docs/06 §4).
 *
 * Feed it a folder of consented photos named `person__anything.jpg` (one folder
 * per person is not required; the prefix before `__` is the identity). It prints
 * genuine vs impostor similarity distributions and the FAR/FRR curve, so the
 * threshold is chosen from data instead of guessed.
 *
 * Nothing is uploaded. Images live in memory and are discarded on reload.
 */

interface Sample {
  person: string;
  vector: Float32Array;
  name: string;
}

function dot(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += (a[i] ?? 0) * (b[i] ?? 0);
  return sum;
}

function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)));
  return sorted[index] ?? 0;
}

export default function CalibratePage() {
  const engineRef = React.useRef<FaceEngine | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState({ done: 0, total: 0 });
  const [samples, setSamples] = React.useState<Sample[]>([]);
  const [failed, setFailed] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  async function analyzeFiles(files: FileList) {
    setBusy(true);
    setError(null);
    setSamples([]);
    setFailed([]);
    setProgress({ done: 0, total: files.length });

    try {
      if (!engineRef.current) {
        const engine = createFaceEngine();
        await engine.load({ modelBasePath: '/models/human/', hands: false });
        engineRef.current = engine;
      }
      const engine = engineRef.current;
      const canvas = canvasRef.current;
      if (!canvas) throw new Error('NO_CANVAS');

      const collected: Sample[] = [];
      const failures: string[] = [];

      for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        if (!file) continue;
        try {
          const bitmap = await createImageBitmap(file);
          canvas.width = 640;
          canvas.height = 480;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) throw new Error('NO_CTX');
          // letterbox into 640x480 so the engine sees a consistent frame
          const scale = Math.min(640 / bitmap.width, 480 / bitmap.height);
          const w = bitmap.width * scale;
          const h = bitmap.height * scale;
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, 640, 480);
          ctx.drawImage(bitmap, (640 - w) / 2, (480 - h) / 2, w, h);
          bitmap.close();

          const result = await engine.embed(canvas);
          collected.push({
            person: file.name.split('__')[0] ?? file.name,
            vector: result.embedding.vector,
            name: file.name,
          });
        } catch {
          failures.push(file.name);
        }
        setProgress({ done: i + 1, total: files.length });
      }

      setSamples(collected);
      setFailed(failures);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const analysis = React.useMemo(() => {
    if (samples.length < 2) return null;

    const genuine: number[] = [];
    const impostor: number[] = [];

    for (let i = 0; i < samples.length; i += 1) {
      for (let j = i + 1; j < samples.length; j += 1) {
        const a = samples[i];
        const b = samples[j];
        if (!a || !b) continue;
        const sim = dot(a.vector, b.vector);
        if (a.person === b.person) genuine.push(sim);
        else impostor.push(sim);
      }
    }

    if (genuine.length === 0 || impostor.length === 0) return null;

    const curve: Array<{ t: number; far: number; frr: number }> = [];
    for (let t = 0.4; t <= 0.9501; t += 0.01) {
      const far = impostor.filter((s) => s >= t).length / impostor.length;
      const frr = genuine.filter((s) => s < t).length / genuine.length;
      curve.push({ t: Number(t.toFixed(2)), far, frr });
    }

    const eer = curve.reduce((best, point) =>
      Math.abs(point.far - point.frr) < Math.abs(best.far - best.frr) ? point : best,
    );

    // Lowest threshold that keeps FAR at or below 0.1 % (the target in docs/06).
    const strict = curve.find((p) => p.far <= 0.001) ?? null;

    return {
      persons: new Set(samples.map((s) => s.person)).size,
      genuineCount: genuine.length,
      impostorCount: impostor.length,
      genuineMedian: quantile(genuine, 0.5),
      genuineP05: quantile(genuine, 0.05),
      impostorP99: quantile(impostor, 0.99),
      impostorMax: Math.max(...impostor),
      eer,
      strict,
      curve,
    };
  }, [samples]);

  const report = analysis
    ? {
        generatedAt: new Date().toISOString(),
        images: samples.length,
        persons: analysis.persons,
        genuinePairs: analysis.genuineCount,
        impostorPairs: analysis.impostorCount,
        genuineP05: Number(analysis.genuineP05.toFixed(4)),
        genuineMedian: Number(analysis.genuineMedian.toFixed(4)),
        impostorP99: Number(analysis.impostorP99.toFixed(4)),
        impostorMax: Number(analysis.impostorMax.toFixed(4)),
        eer: {
          threshold: analysis.eer.t,
          far: Number(analysis.eer.far.toFixed(4)),
          frr: Number(analysis.eer.frr.toFixed(4)),
        },
        recommended: analysis.strict
          ? {
              threshold: analysis.strict.t,
              far: Number(analysis.strict.far.toFixed(4)),
              frr: Number(analysis.strict.frr.toFixed(4)),
            }
          : null,
        model: 'human-hse-faceres',
      }
    : null;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col gap-5 px-5 py-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Calibración de umbral</h1>
          <p className="text-xs text-muted-foreground">
            Imágenes locales con consentimiento. Nada sale del navegador.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="warning">DEV</Badge>
          <Link href="/kiosk" className="text-sm text-muted-foreground hover:text-foreground">
            Salir
          </Link>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>1. Elige las fotos</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Nombra cada archivo <code>persona__loquesea.jpg</code>. El prefijo antes de{' '}
            <code>__</code> es la identidad. Necesitas ≥ 10 personas y ≥ 2 fotos por persona para
            que el reporte tenga sentido.
          </p>
          <input
            type="file"
            accept="image/*"
            multiple
            disabled={busy}
            onChange={(e) => {
              if (e.target.files?.length) void analyzeFiles(e.target.files);
            }}
            className="text-sm"
          />
          {busy && (
            <p className="text-xs text-muted-foreground tabular">
              Procesando {progress.done}/{progress.total}…
            </p>
          )}
          {failed.length > 0 && (
            <p className="text-xs text-destructive">
              Sin rostro utilizable: {failed.slice(0, 6).join(', ')}
              {failed.length > 6 ? ` y ${failed.length - 6} más` : ''}
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <canvas ref={canvasRef} className="hidden" />
        </CardContent>
      </Card>

      {analysis && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>2. Distribuciones</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
              <Row label="Personas" value={String(analysis.persons)} />
              <Row label="Pares genuinos" value={String(analysis.genuineCount)} />
              <Row label="Pares impostores" value={String(analysis.impostorCount)} />
              <Row label="Genuinos p05" value={analysis.genuineP05.toFixed(3)} />
              <Row label="Genuinos mediana" value={analysis.genuineMedian.toFixed(3)} />
              <Row label="Impostores p99" value={analysis.impostorP99.toFixed(3)} />
              <Row label="Impostor máximo" value={analysis.impostorMax.toFixed(3)} />
              <Row
                label="EER"
                value={`t=${analysis.eer.t} · FAR ${(analysis.eer.far * 100).toFixed(2)}%`}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>3. Umbral recomendado</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              {analysis.strict ? (
                <>
                  <p className="text-2xl font-semibold tabular">t = {analysis.strict.t}</p>
                  <p className="text-muted-foreground">
                    FAR {(analysis.strict.far * 100).toFixed(2)}% · FRR{' '}
                    {(analysis.strict.frr * 100).toFixed(2)}%
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Es el umbral más bajo que mantiene FAR ≤ 0.1%. Si el FRR es mayor a 5%, el motor
                    no es suficiente: pasa a MediaPipe + ArcFace (docs/06 §4).
                  </p>
                </>
              ) : (
                <p className="text-destructive">
                  Con estos datos no se alcanza FAR ≤ 0.1%. No uses este umbral en producción.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>4. Curva (muestreada)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-64 overflow-auto">
                <table className="w-full text-left text-xs tabular">
                  <thead className="sticky top-0 bg-card text-muted-foreground">
                    <tr>
                      <th className="py-1">t</th>
                      <th>FAR</th>
                      <th>FRR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.curve
                      .filter((_, i) => i % 5 === 0)
                      .map((point) => (
                        <tr key={point.t} className="border-t border-border">
                          <td className="py-1">{point.t.toFixed(2)}</td>
                          <td>{(point.far * 100).toFixed(2)}%</td>
                          <td>{(point.frr * 100).toFixed(2)}%</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>5. Reporte para pegar en docs/calibration/</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <pre className="max-h-56 overflow-auto rounded-md bg-muted p-3 text-xs">
                {JSON.stringify(report, null, 2)}
              </pre>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (report) void navigator.clipboard.writeText(JSON.stringify(report, null, 2));
                }}
              >
                Copiar JSON
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular">{value}</span>
    </div>
  );
}
