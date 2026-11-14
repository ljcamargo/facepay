import Link from 'next/link';
import { t } from '@facepay/shared';

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm font-medium text-muted-foreground">404</p>
      <h1 className="text-2xl font-semibold">{t('notFound.title')}</h1>
      <Link href="/kiosk" className="text-sm text-primary underline-offset-4 hover:underline">
        {t('common.back')}
      </Link>
    </div>
  );
}
