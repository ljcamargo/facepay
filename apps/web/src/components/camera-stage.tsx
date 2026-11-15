'use client';

import { cn } from '@/lib/utils';

interface Props {
  /** 0..1 */
  progress: number;
  challenge: string;
  hint?: string | null;
  className?: string;
  /** Renders the ephemeral vector bars, like the real engine will. */
  showVector?: boolean;
  /** When present, the live camera feed is shown behind the guide. */
  videoRef?: React.RefObject<HTMLVideoElement | null>;
}

export function CameraStage({
  progress,
  challenge,
  hint,
  className,
  showVector = true,
  videoRef,
}: Props) {
  const pct = Math.round(Math.min(1, Math.max(0, progress)) * 100);
  const bars = Array.from({ length: 32 }, (_, i) => {
    const wobble = Math.sin(i * 1.7 + pct / 12) * 0.5 + 0.5;
    return 20 + wobble * 80;
  });

  return (
    <div className={cn('flex flex-col items-center gap-4', className)}>
      <div className="relative mx-auto aspect-square w-full max-w-[min(72vh,560px)] overflow-hidden rounded-3xl border border-border bg-black">
        {videoRef ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 size-full -scale-x-100 object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-b from-muted/40 via-transparent to-muted/60" />
        )}

        {/* soft vignette keeps the guide readable without hiding the face */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(0,0,0,0.35)_100%)]" />

        {/* vertical oval: a face is taller than it is wide */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-[76%] w-[54%] -translate-x-1/2 -translate-y-1/2">
          <div className="absolute inset-0 rounded-[50%] border-2 border-white/25" />
          <div
            className="absolute inset-0 rounded-[50%] border-2 border-primary transition-[clip-path] duration-200"
            style={{ clipPath: `inset(${100 - pct}% 0 0 0)` }}
          />
        </div>
      </div>

      <div className="flex w-full max-w-[min(72vh,560px)] flex-col items-center gap-2">
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
