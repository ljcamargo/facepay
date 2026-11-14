'use client';

import { useNow } from '@/lib/hooks';
import { countdown } from '@/lib/utils';
import { cn } from '@/lib/utils';

export function Countdown({
  expiresAt,
  label,
  className,
}: {
  expiresAt: string | null;
  label?: string;
  className?: string;
}) {
  const now = useNow(1000);
  if (!expiresAt) return null;
  const left = Math.max(0, Math.round((new Date(expiresAt).getTime() - now) / 1000));
  return (
    <span className={cn('tabular text-sm text-muted-foreground', className)}>
      {label ? `${label} ` : ''}
      {countdown(left)}
    </span>
  );
}
