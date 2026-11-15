'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { Check, Smartphone } from 'lucide-react';
import { formatMxInput, formatMxn, t, toE164Mx } from '@facepay/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ensureSession, startPhonePayment } from '@/lib/db';
import { supabase } from '@/lib/supabase';

/** Pay without enrolling a face: type your number on your own phone. */
export default function PhonePayPage() {
  const params = useParams<{ txId: string }>();
  const [phone, setPhone] = React.useState('');
  const [amount, setAmount] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [cancelled, setCancelled] = React.useState(false);

  async function cancelPayment() {
    if (!supabase || !params?.txId) return;
    setBusy(true);
    try {
      await ensureSession();
      await supabase.rpc('cancel_my_checkout', { p_tx: params.txId });
      setCancelled(true);
    } catch {
      setError('No pudimos cancelar. Pídele al cajero que lo haga.');
    } finally {
      setBusy(false);
    }
  }

  React.useEffect(() => {
    if (!supabase || !params?.txId) return;
    void (async () => {
      const { data } = await supabase.rpc('public_checkout_info', { p_tx: params.txId });
      const row = Array.isArray(data) ? data[0] : data;
      if (row) setAmount(row.amount_cents);
    })();
  }, [params?.txId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const e164 = toE164Mx(phone);
    if (!e164) return setError(t('onboarding.phone.invalid'));
    setBusy(true);
    setError(null);
    try {
      await ensureSession();
      await startPhonePayment(params!.txId, e164);
      setDone(true);
    } catch (err) {
      const code =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
            ? String((err as { message: unknown }).message)
            : String(err);
      setError(`No pudimos enviar la solicitud (${code}). Pide al cajero que la genere de nuevo.`);
    } finally {
      setBusy(false);
    }
  }

  if (cancelled) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-3 px-5 text-center">
        <h1 className="text-xl font-semibold">Pago cancelado</h1>
        <p className="text-sm text-muted-foreground">No se envió ninguna solicitud.</p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 px-5 text-center">
        <div className="flex size-20 items-center justify-center rounded-full bg-success/15 text-success">
          <Check className="size-10" aria-hidden />
        </div>
        <h1 className="text-xl font-semibold">Solicitud enviada</h1>
        <p className="text-sm text-muted-foreground">
          Aprueba el cobro en la app de tu banco. La tablet ya está esperando.
        </p>
        <p className="text-xs text-muted-foreground">{formatMxn(amount)}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-5 py-10">
      <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Smartphone className="size-6" aria-hidden />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">Pagar con mi celular</h1>
      <p className="text-sm text-muted-foreground">
        Sin registrar tu rostro. Te enviamos la solicitud y la apruebas en tu banco.
      </p>

      <form onSubmit={submit} className="flex flex-col gap-3">
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
          autoFocus
        />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" disabled={busy || phone.replace(/\D/g, '').length !== 10}>
          Enviar solicitud · {formatMxn(amount)}
        </Button>
      </form>

      <Card>
        <CardContent className="p-4 text-xs text-muted-foreground">
          Usamos tu número solo para enviarte este cobro. Puedes borrarlo después.
        </CardContent>
      </Card>

      <button
        type="button"
        onClick={() => void cancelPayment()}
        disabled={busy}
        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        Cancelar este pago
      </button>
    </div>
  );
}
