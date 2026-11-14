import { t } from '@facepay/shared';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * Visible reminder that this build runs on fixtures. Phase 2 removes it from
 * production builds (MOCK_MODE=false).
 */
export function MockBadge({ className }: { className?: string }) {
  return (
    <Badge tone="warning" className={cn('font-mono tracking-wide', className)} title={t('common.mockHint')}>
      {t('common.mockBadge')}
    </Badge>
  );
}
