'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Tablet } from 'lucide-react';
import { t } from '@facepay/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { pairDevice } from '@/lib/mock';

export default function SetupPage() {
  const router = useRouter();
  const [code, setCode] = React.useState('');
  const [error, setError] = React.useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pairDevice(code)) {
      router.replace('/kiosk');
      return;
    }
    setError(true);
  }

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-10">
      <Card className="w-full max-w-lg">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Tablet className="size-7" aria-hidden />
          </div>
          <CardTitle className="text-xl">{t('kiosk.setup.title')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ol className="flex flex-col gap-2 text-sm text-muted-foreground">
            <li>1. {t('kiosk.setup.step1')}</li>
            <li>2. {t('kiosk.setup.step2')}</li>
            <li>3. {t('kiosk.setup.step3')}</li>
          </ol>

          <form onSubmit={submit} className="flex flex-col gap-3">
            <Input
              value={code}
              onChange={(e) => {
                setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                setError(false);
              }}
              inputMode="numeric"
              autoComplete="one-time-code"
              aria-label="Código de emparejamiento"
              placeholder="000000"
              className="h-16 text-center text-3xl tracking-[0.5em] tabular"
              autoFocus
            />
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {t('kiosk.setup.invalid')}
              </p>
            )}
            <Button type="submit" size="lg" disabled={code.length !== 6}>
              {t('kiosk.setup.pair')}
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          </form>

          <p className="text-xs text-muted-foreground">{t('kiosk.setup.expires')}</p>
          <p className="text-xs text-muted-foreground">{t('kiosk.setup.scope')}</p>
          <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            {t('kiosk.setup.demoHint')}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
