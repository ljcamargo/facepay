'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, LogIn } from 'lucide-react';
import { t } from '@facepay/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { signInVendor } from '@/lib/db';

/**
 * Vendor login. Replaces the old "pairing code" idea: a cashier signs in with
 * email + password once, the session stays on the tablet, and the staff row
 * decides which store this device belongs to.
 */
export default function KioskSetupPage() {
  const router = useRouter();
  const [email, setEmail] = React.useState('caja@facepay.mx');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signInVendor(email.trim(), password);
      router.replace('/kiosk');
    } catch {
      setError('Correo o contraseña incorrectos.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-10">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <LogIn className="size-7" aria-hidden />
          </div>
          <CardTitle className="text-xl">{t('kiosk.setup.title')}</CardTitle>
          <p className="text-sm text-muted-foreground">
            Entra con la cuenta de la tienda. La sesión queda abierta en esta tablet.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="flex flex-col gap-3">
            <label htmlFor="email" className="text-sm font-medium">
              Correo
            </label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />

            <label htmlFor="password" className="text-sm font-medium">
              Contraseña
            </label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />

            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}

            <Button type="submit" size="lg" disabled={busy || !password}>
              Entrar
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          </form>

          <p className="mt-4 text-xs text-muted-foreground">
            Esta tablet solo ve los movimientos de su tienda. Para cerrar la sesión: Ajustes →
            Desconectar.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
