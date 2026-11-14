import * as React from 'react';
import { cn } from '@/lib/utils';

type Tone = 'default' | 'success' | 'warning' | 'danger' | 'accent';

const tones: Record<Tone, string> = {
  default: 'border-border bg-muted text-muted-foreground',
  success: 'border-success/30 bg-success/10 text-success',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  danger: 'border-destructive/30 bg-destructive/10 text-destructive',
  accent: 'border-accent/40 bg-accent/15 text-accent-foreground dark:text-accent',
};

export function Badge({
  tone = 'default',
  className,
  ...props
}: React.ComponentProps<'span'> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
