'use client';

import * as React from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import { t } from '@facepay/shared';

const options = [
  { value: 'light', labelKey: 'theme.light' as const, Icon: Sun },
  { value: 'dark', labelKey: 'theme.dark' as const, Icon: Moon },
  { value: 'system', labelKey: 'theme.auto' as const, Icon: Monitor },
];

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  return (
    <div
      role="radiogroup"
      aria-label={t('theme.label')}
      className="inline-flex items-center gap-1 rounded-full border border-border bg-card p-1"
    >
      {options.map(({ value, labelKey, Icon }) => {
        const active = mounted && theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            title={t(labelKey)}
            onClick={() => setTheme(value)}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-colors',
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted',
            )}
          >
            <Icon className="size-4" aria-hidden />
            {!compact && <span className="hidden sm:inline">{t(labelKey)}</span>}
          </button>
        );
      })}
    </div>
  );
}
