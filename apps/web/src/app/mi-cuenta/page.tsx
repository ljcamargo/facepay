'use client';

import * as React from 'react';
import Link from 'next/link';
import { RefreshCw } from 'lucide-react';
import { maskPhone, t } from '@facepay/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { deleteFace, getAccount } from '@/lib/mock';
import { hasSupabase } from '@/lib/supabase';
import {
  deleteMyAccount,
  ensureSession,
  getMyProfile,
  listMyConsents,
  listMyTemplates,
  revokeMyFace,
  type MyConsent,
  type MyProfile,
  type MyTemplate,
} from '@/lib/db';
import { useMounted } from '@/lib/hooks';

interface Ready {
  source: 'real' | 'demo';
  phone: string | null;
  name: string | null;
  accountStatus: string;
  consents: MyConsent[];
  templates: MyTemplate[];
}

type State =
  | { status: 'loading' }
  | { status: 'error' }
  | ({ status: 'ready' } & Ready);

export default function MiCuentaPage() {
  const mounted = useMounted();
  const [state, setState] = React.useState<State>({ status: 'loading' });
  const [confirming, setConfirming] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    setState({ status: 'loading' });
    if (!hasSupabase) {
      const account = getAccount();
      setState({
        status: 'ready',
        source: 'demo',
        phone: account?.phoneE164 ?? null,
        name: account?.displayName ?? null,
        accountStatus: account ? 'active' : 'empty',
        consents: (account?.consents ?? []).map((c) => ({
          slug: c.slug,
          version: c.version,
          acceptedAt: c.acceptedAt,
        })),
        templates: (account?.templates ?? []).map((tpl) => ({
          id: tpl.id,
          model: tpl.model,
          scope: tpl.scope,
          createdAt: tpl.createdAt,
        })),
      });
      return;
    }

    try {
      await ensureSession();
      const [profile, consents, templates] = await Promise.all([
        getMyProfile(),
        listMyConsents(),
        listMyTemplates(),
      ]);
      setState({
        status: 'ready',
        source: 'real',
        phone: profile?.phoneE164 ?? null,
        name: profile?.displayName ?? null,
        accountStatus: profile?.status ?? 'active',
        consents,
        templates,
      });
    } catch {
      setState({ status: 'error' });
    }
  }, []);

  React.useEffect(() => {
    if (mounted) void load();
  }, [mounted, load]);

  async function revokeFace() {
    setBusy(true);
    setNotice(null);
    try {
      if (state.status !== 'ready') return;
      if (state.source === 'real') await revokeMyFace();
      else deleteFace();
      setNotice(t('miCuenta.deleted'));
      await load();
    } catch {
      setNotice(t('miCuenta.error'));
    } finally {
      setBusy(false);
    }
  }

  async function removeAccount() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      if (state.status !== 'ready') return;
      if (state.source === 'real') await deleteMyAccount();
      else deleteFace();
      setNotice(t('miCuenta.accountDeleted'));
      setConfirming(false);
      await load();
    } catch {
      setNotice(t('miCuenta.error'));
    } finally {
      setBusy(false);
    }
  }

  if (!mounted || state.status === 'loading') {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-md items-center justify-center px-5">
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 px-5 text-center">
        <p className="text-lg font-medium">{t('miCuenta.error')}</p>
        <Button variant="outline" onClick={() => void load()}>
          <RefreshCw className="size-4" aria-hidden /> {t('common.retry')}
        </Button>
        <Link href="/kiosk" className="text-sm text-primary underline-offset-4 hover:underline">
          {t('common.back')}
        </Link>
      </div>
    );
  }

  const empty = !state.phone && state.templates.length === 0 && state.consents.length === 0;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-5 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t('miCuenta.title')}</h1>
        <Link href="/kiosk" className="text-sm text-muted-foreground hover:text-foreground">
          {t('common.close')}
        </Link>
      </div>

      <div className="flex items-center gap-2">
        <Badge tone={state.source === 'real' ? 'success' : 'warning'}>
          {state.source === 'real' ? t('miCuenta.realBadge') : t('miCuenta.demoBadge')}
        </Badge>
        {state.accountStatus !== 'empty' && <Badge>{state.accountStatus}</Badge>}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {state.name ?? '—'} · {state.phone ? maskPhone(state.phone) : t('miCuenta.noPhone')}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <p className="text-muted-foreground">{t('miCuenta.sessionHint')}</p>

          <div>
            <p className="font-medium">
              {t('miCuenta.templates')} ({state.templates.length})
            </p>
            {state.templates.length === 0 ? (
              <p className="text-muted-foreground">{t('miCuenta.none')}</p>
            ) : (
              <ul className="mt-1 flex flex-col gap-0.5 text-muted-foreground">
                {state.templates.map((tpl) => (
                  <li key={tpl.id}>
                    {tpl.model} ·{' '}
                    {tpl.scope === 'global' ? 'todas las tiendas' : 'solo esta tienda'}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="font-medium">
              {t('miCuenta.consents')} ({state.consents.length})
            </p>
            {state.consents.length === 0 ? (
              <p className="text-muted-foreground">{t('miCuenta.none')}</p>
            ) : (
              <ul className="mt-1 flex flex-col gap-0.5 text-muted-foreground">
                {state.consents.map((c) => (
                  <li key={`${c.slug}-${c.version}-${c.acceptedAt}`}>
                    {c.slug} v{c.version}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {state.source === 'real' && !empty && (
            <p className="text-xs text-muted-foreground">{t('miCuenta.realNotice')}</p>
          )}
        </CardContent>
      </Card>

      <Button
        variant="destructive"
        onClick={() => void revokeFace()}
        disabled={busy || state.templates.length === 0}
      >
        {t('miCuenta.delete')}
      </Button>

      <Button variant="outline" onClick={() => void removeAccount()} disabled={busy}>
        {confirming ? t('miCuenta.confirm') : t('miCuenta.deleteAccount')}
      </Button>
      {confirming && (
        <p className="text-xs text-destructive">{t('miCuenta.deleteAccountConfirm')}</p>
      )}

      {notice && <p className="text-sm text-success">{notice}</p>}
      <p className="text-xs text-muted-foreground">{t('miCuenta.deleteConfirm')}</p>

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
