'use client';

import { Delete } from 'lucide-react';
import { formatMxn, padAppend, padBackspace, padToCents } from '@facepay/shared';
import { cn } from '@/lib/utils';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'del'] as const;
const QUICK = [5000, 10000, 20000, 30000] as const;

interface Props {
  buffer: string;
  onChange: (next: string) => void;
  className?: string;
}

export function AmountPad({ buffer, onChange, className }: Props) {
  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Rápidos
        </span>
        {QUICK.map((cents) => (
          <button
            key={cents}
            type="button"
            onClick={() => onChange(String(cents))}
            className="h-9 rounded-full border border-border px-3.5 text-sm tabular text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {formatMxn(cents)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {KEYS.map((key) => (
          <button
            key={key}
            type="button"
            aria-label={key === 'del' ? 'Borrar' : key}
            onClick={() =>
              onChange(key === 'del' ? padBackspace(buffer) : padAppend(buffer, key))
            }
            className={cn(
              'flex h-16 items-center justify-center rounded-xl border border-border bg-card text-2xl font-medium tabular',
              'transition-colors hover:bg-muted active:scale-[0.98]',
              key === 'del' && 'text-muted-foreground',
            )}
          >
            {key === 'del' ? <Delete className="size-6" aria-hidden /> : key}
          </button>
        ))}
      </div>

      <p className="text-center text-xs text-muted-foreground tabular">
        {padToCents(buffer) > 0 ? formatMxn(padToCents(buffer)) : '—'}
      </p>
    </div>
  );
}
