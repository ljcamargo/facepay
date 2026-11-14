'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { formatMxn, t } from '@facepay/shared';
import { CameraStage } from '@/components/camera-stage';
import { Button } from '@/components/ui/button';
import { attachCandidate, identify } from '@/lib/mock';
import { useTx } from '@/lib/hooks';

export default function IdentifyPage() {
  const router = useRouter();
  const [txId, setTxId] = React.useState<string | null>(null);
  const [progress, setProgress] = React.useState(0.05);
  const started = React.useRef(false);
  const tx = useTx(txId ?? undefined);

  React.useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('tx');
    if (!id) {
      router.replace('/kiosk');
      return;
    }
    setTxId(id);
  }, [router]);

  React.useEffect(() => {
    if (!txId || started.current) return;
    started.current = true;

    const tick = setInterval(() => setProgress((p) => Math.min(0.94, p + 0.035)), 90);

    identify()
      .then((result) => {
        clearInterval(tick);
        setProgress(1);
        if (result.decision === 'matched' && result.candidate) {
          attachCandidate(txId, result.candidate);
          router.replace(`/kiosk/confirm?tx=${txId}`);
        } else {
          router.replace(`/kiosk/fallback?tx=${txId}&reason=${result.decision}`);
        }
      })
      .catch(() => {
        clearInterval(tick);
        router.replace(`/kiosk/fallback?tx=${txId}&reason=error`);
      });

    return () => clearInterval(tick);
  }, [txId, router]);

  function toFallback() {
    if (txId) router.replace(`/kiosk/fallback?tx=${txId}&reason=manual`);
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-6 md:px-12">
      <div className="flex w-full max-w-3xl items-center justify-between">
        <p className="text-lg font-medium">
          {t('kiosk.identify.title', { amount: formatMxn(tx?.amountCents ?? 0) })}
        </p>
        <Button variant="ghost" size="sm" onClick={toFallback}>
          <X className="size-4" aria-hidden /> {t('common.cancel')}
        </Button>
      </div>

      <CameraStage
        progress={progress}
        challenge={t('kiosk.identify.look')}
        hint={t('kiosk.identify.holdStill')}
        showVector
      />

      <p className="max-w-xl text-center text-sm text-muted-foreground">
        {t('kiosk.identify.privacy')}
      </p>

      <Button variant="outline" onClick={toFallback}>
        {t('kiosk.identify.useQr')}
      </Button>
    </div>
  );
}
