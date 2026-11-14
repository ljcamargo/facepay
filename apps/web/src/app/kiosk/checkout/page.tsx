'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ScanFace, Wallet } from 'lucide-react';
import { formatMxn, padToCents, t } from '@facepay/shared';
import { AmountPad } from '@/components/amount-pad';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createCheckout, PilotLimitError, DEMO_PILOT_LIMIT } from '@/lib/mock';
import { cn } from '@/lib/utils';

export default function CheckoutPage() {
  const router = useRouter();
  const [buffer, setBuffer] = React.useState('');
  const [concept, setConcept] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  const cents = padToCents(buffer);
  const overLimit = cents > DEMO_PILOT_LIMIT;

  function start(destination: 'identify' | 'fallback') {
    setError(null);
    if (cents <= 0) {
      setError(t('kiosk.checkout.zero'));
      return;
    }
    try {
      const tx = createCheckout({ amountCents: cents, concept });
      router.push(`/kiosk/${destination}?tx=${tx.id}`);
    } catch (err) {
      if (err instanceof PilotLimitError) {
        setError(`El tope del piloto es ${formatMxn(DEMO_PILOT_LIMIT)} por cobro.`);
        return;
      }
      setError(t('common.error'));
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 px-6 py-6 md:px-12">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => router.push('/kiosk')}>
          <ArrowLeft className="size-4" aria-hidden /> {t('common.cancel')}
        </Button>
        <span className="text-sm text-muted-foreground">{t('kiosk.checkout.title')}</span>
      </div>

      <div className="grid flex-1 gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="flex flex-col justify-between gap-6">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              {t('kiosk.checkout.total')}
            </p>
            <p
              className={cn('amount mt-1 text-6xl font-semibold', overLimit && 'text-destructive')}
              aria-live="polite"
            >
              {formatMxn(cents)}
            </p>
            {overLimit && (
              <p className="mt-2 text-sm text-destructive">
                El tope del piloto es {formatMxn(DEMO_PILOT_LIMIT)}.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="concept" className="text-sm font-medium">
              {t('kiosk.checkout.concept')}{' '}
              <span className="font-normal text-muted-foreground">
                ({t('common.optional')})
              </span>
            </label>
            <Input
              id="concept"
              value={concept}
              maxLength={60}
              placeholder={t('kiosk.checkout.conceptPlaceholder')}
              onChange={(e) => setConcept(e.target.value)}
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">{t('kiosk.checkout.conceptHint')}</p>
          </div>

          <div className="flex flex-col gap-3">
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button
              size="lg"
              className="h-16 text-lg"
              disabled={cents <= 0 || overLimit}
              onClick={() => start('identify')}
            >
              <ScanFace className="size-5" aria-hidden />
              {t('kiosk.checkout.face')}
            </Button>
            <Button
              variant="outline"
              size="lg"
              disabled={cents <= 0 || overLimit}
              onClick={() => start('fallback')}
            >
              <Wallet className="size-5" aria-hidden />
              {t('kiosk.checkout.other')}
            </Button>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card/60 p-5">
          <AmountPad buffer={buffer} onChange={setBuffer} />
        </section>
      </div>
    </div>
  );
}
