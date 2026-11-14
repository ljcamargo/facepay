'use client';

import * as React from 'react';
import Link from 'next/link';
import { t } from '@facepay/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { deleteFace, getAccount } from '@/lib/mock';
import { useMounted } from '@/lib/hooks';

export default function MiCuentaPage() {
  const mounted = useMounted();
  const [account, setAccount] = React.useState<ReturnType<typeof getAccount>>(null);
  const [deleted, setDeleted] = React.useState(false);

  React.useEffect(() => {
    if (mounted) setAccount(getAccount());
  }, [mounted]);

  if (!mounted) return <div className="min-h-dvh" />;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-5 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t('miCuenta.title')}</h1>
        <Link href="/kiosk" className="text-sm text-muted-foreground hover:text-foreground">
          {t('common.close')}
        </Link>
      </div>

      {!account ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            {t('miCuenta.none')}
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{account.displayName} · •••• {account.phoneE164.slice(-4)}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <p className="text-muted-foreground">{t('miCuenta.sessionHint')}</p>
              <div>
                <p className="font-medium">{t('miCuenta.templates')}</p>
                {account.templates.length === 0 ? (
                  <p className="text-muted-foreground">{t('miCuenta.none')}</p>
                ) : (
                  <ul className="mt-1 flex flex-col gap-0.5 text-muted-foreground">
                    {account.templates.map((tpl) => (
                      <li key={tpl.id}>
                        {tpl.model} · {tpl.scope === 'global' ? 'todas las tiendas' : 'solo esta tienda'}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="font-medium">{t('miCuenta.consents')}</p>
                <ul className="mt-1 flex flex-col gap-0.5 text-muted-foreground">
                  {account.consents.length === 0 ? (
                    <li>{t('miCuenta.none')}</li>
                  ) : (
                    account.consents.map((c) => (
                      <li key={`${c.slug}-${c.version}`}>
                        {c.slug} v{c.version}
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </CardContent>
          </Card>

          <Button
            variant="destructive"
            onClick={() => {
              deleteFace();
              setAccount(getAccount());
              setDeleted(true);
            }}
            disabled={account.templates.length === 0}
          >
            {t('miCuenta.delete')}
          </Button>
          <p className="text-xs text-muted-foreground">{t('miCuenta.deleteConfirm')}</p>
          {deleted && <p className="text-sm text-success">{t('miCuenta.deleted')}</p>}
        </>
      )}

      <div className="mt-auto flex flex-wrap gap-3 text-xs text-muted-foreground">
        <Link href="/legal/privacy" className="hover:text-foreground">
          {t('legal.privacy')}
        </Link>
        <Link href="/legal/terms" className="hover:text-foreground">
          {t('legal.terms')}
        </Link>
        <Link href="/legal/about" className="hover:text-foreground">
          {t('legal.about')}
        </Link>
      </div>
    </div>
  );
}
