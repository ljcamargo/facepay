'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ScanFace, Smartphone } from 'lucide-react';
import { formatMxn } from '@facepay/shared';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/lib/supabase';

/** QR landing on the customer's phone: enroll with a face, or just pay. */
export default function StartPage() {
  const params = useParams<{ txId: string }>();
  const [info, setInfo] = React.useState<{ amountCents: number; storeName: string } | null>(null);
  const [missing, setMissing] = React.useState(false);

  React.useEffect(() => {
    if (!supabase) {
      setMissing(true);
      return;
    }
    void (async () => {
      try {
        const { data, error } = await supabase.rpc('public_checkout_info', { p_tx: params?.txId });
        const row = Array.isArray(data) ? data[0] : data;
        if (error || !row) return setMissing(true);
        setInfo({ amountCents: row.amount_cents, storeName: row.store_name });
      } catch {
        setMissing(true);
      }
    })();
  }, [params?.txId]);

  if (missing) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-md items-center justify-center px-5 text-center text-sm text-muted-foreground">
        Este cobro ya no está disponible. Pide al cajero que genere uno nuevo.
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-5 py-10">
      <header className="text-center">
        <p className="text-sm text-muted-foreground">{info?.storeName ?? '—'}</p>
        <p className="amount mt-1 text-4xl font-semibold">
          {info ? formatMxn(info.amountCents) : '—'}
        </p>
      </header>

      <Link
        href={`/onboarding/${params?.txId}`}
        className="flex items-start gap-3 rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/50"
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <ScanFace className="size-5" aria-hidden />
        </span>
        <span>
          <span className="block font-medium">Registrarme con mi rostro</span>
          <span className="block text-xs text-muted-foreground">
            La próxima vez solo miras la cámara. Toma un minuto.
          </span>
        </span>
      </Link>

      <Link
        href={`/pago/${params?.txId}`}
        className="flex items-start gap-3 rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/50"
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
          <Smartphone className="size-5" aria-hidden />
        </span>
        <span>
          <span className="block font-medium">Solo pagar</span>
          <span className="block text-xs text-muted-foreground">
            Escribe tu celular y recibe la solicitud. Sin registrar tu rostro.
          </span>
        </span>
      </Link>

      <Card>
        <CardContent className="p-4 text-xs text-muted-foreground">
          El cobro lo autorizas siempre en la app de tu banco. FacePay nunca mueve dinero.
        </CardContent>
      </Card>
    </div>
  );
}
