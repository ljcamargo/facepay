'use client';

import { ScanFace } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  /** 0..1 */
  progress: number;
  challenge: string;
  hint?: string | null;
  className?: string;
  /** Renders the ephemeral vector bars, like the real engine will. */
  showVector?: boolean;
}

export function CameraStage({ progress, challenge, hint, className, showVector = true }: Props) {
  const pct = Math.round(Math.min(1, Math.max(0, progress)) * 100);
  const bars = Array.from({ length: 32 }, (_, i) => {
    const wobble = Math.sin(i * 1.7 + pct / 12) * 0.5 + 0.5;
    return 20 + wobble * 80;
  });

  return (
    <div className={cn('flex flex-col items-center gap-4', className)}>
      <div className="relative aspect-[4/3] w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-[radial-gradient(circle_at_50%_35%,rgba(15,118,110,0.18),transparent_60%)]">
        {/* simulated camera feed */}
        <div className="absolute inset-0 bg-gradient-to-b from-muted/40 via-transparent to-muted/60" />

        {/* face oval */}
        <div className="absolute left-1/2 top-1/2 size-[52%] -translate-x-1/2 -translate-y-1/2">
          <div className="absolute inset-0 rounded-[50%] border-2 border-primary/30" />
          <div
            className="absolute inset-0 rounded-[50%] border-2 border-primary transition-[clip-path] duration-200"
            style={{ clipPath: `inset(${100 - pct}% 0 0 0)` }}
          />
          <ScanFace className="absolute left-1/2 top-1/2 size-16 -translate-x-1/2 -translate-y-1/2 text-primary/30" />
        </div>

        {/* scan line */}
        <div
          className="absolute inset-x-0 h-px bg-primary/60 shadow-[0_0_18px_2px] shadow-primary/40"
          style={{ top: `${8 + pct * 0.84}%` }}
        />

        <div className="absolute inset-x-0 bottom-0 flex items-end justify-center gap-[2px] p-3">
          {showVector &&
            bars.map((h, i) => (
              <span
                key={i}
                className="w-1 rounded-sm bg-primary/50"
                style={{ height: `${h * 0.28}px` }}
              />
            ))}
        </div>
        <span className="sr-only">Vista previa de cámara (demo)</span>
      </div>

      <div className="flex w-full max-w-xl flex-col items-center gap-2">
        <p className="text-lg font-medium" aria-live="polite">
          {challenge}
        </p>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-200"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
