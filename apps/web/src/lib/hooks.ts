'use client';

import * as React from 'react';
import type { OnboardingSession, Transaction } from '@facepay/shared';
import { getSession, getTx } from '@/lib/mock';

/** Polls the mock store so cross-tab changes (kiosk ↔ phone) show up quickly. */
export function useTx(id: string | undefined): Transaction | null {
  const [tx, setTx] = React.useState<Transaction | null>(null);

  React.useEffect(() => {
    if (!id) return;
    setTx(getTx(id));
    const timer = setInterval(() => setTx(getTx(id)), 600);
    return () => clearInterval(timer);
  }, [id]);

  return tx;
}

export function useSession(token: string | undefined): OnboardingSession | null {
  const [session, setSession] = React.useState<OnboardingSession | null>(null);

  React.useEffect(() => {
    if (!token) return;
    setSession(getSession(token));
    const timer = setInterval(() => setSession(getSession(token)), 800);
    return () => clearInterval(timer);
  }, [token]);

  return session;
}

/** Ticks once per second; returns epoch ms. */
export function useNow(intervalMs = 1000): number {
  const [nowMs, setNowMs] = React.useState(() => Date.now());
  React.useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return nowMs;
}

export function useMounted(): boolean {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  return mounted;
}
