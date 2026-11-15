import fs from 'node:fs/promises';
import path from 'node:path';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LEGAL_DOC_VERSION, t } from '@facepay/shared';
import { Markdown } from '@/components/markdown';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-static';

const DOCS = {
  about: { titleKey: 'legal.about' },
  terms: { titleKey: 'legal.terms' },
  privacy: { titleKey: 'legal.privacy' },
  'biometric-consent': { titleKey: 'legal.consent' },
} as const;

type Slug = keyof typeof DOCS;

export function generateStaticParams() {
  return Object.keys(DOCS).map((slug) => ({ slug }));
}

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = DOCS[slug as Slug];
  if (!doc) notFound();

  const file = path.join(process.cwd(), 'content', 'legal', `${slug}.md`);
  const source = await fs.readFile(file, 'utf8');

  // The merchant is the data controller, so the published text must have no blanks left.
  const placeholders = [...new Set(source.match(/\{\{[A-Z_]+\}\}/g) ?? [])];

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-6 px-5 py-8">
      <nav className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <Link href="/kiosk" className="inline-flex items-center gap-2 hover:text-foreground">
          <img src="/brand/facepay.svg" alt="" width={22} height={22} className="size-[22px]" />
          FacePay MX
        </Link>
        <span aria-hidden>·</span>
        <Link href="/legal/about" className="hover:text-foreground">
          {t('legal.about')}
        </Link>
        <Link href="/legal/terms" className="hover:text-foreground">
          {t('legal.terms')}
        </Link>
        <Link href="/legal/privacy" className="hover:text-foreground">
          {t('legal.privacy')}
        </Link>
        <Link href="/legal/biometric-consent" className="hover:text-foreground">
          {t('legal.consent')}
        </Link>
      </nav>

      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">{t(doc.titleKey)}</h1>
        <p className="text-sm text-muted-foreground">
          {t('legal.updated')}: {LEGAL_DOC_VERSION}
        </p>
        {placeholders.length > 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
            <p className="font-medium">Borrador: datos del comercio pendientes</p>
            <p className="mt-1 text-xs">
              Este texto no debe publicarse hasta que el comercio proporcione:{' '}
              {placeholders.join(', ')}
            </p>
          </div>
        )}
        <div className="flex gap-2">
          <Badge tone="warning">Borrador</Badge>
          <Badge>v{LEGAL_DOC_VERSION}</Badge>
        </div>
      </header>

      <Markdown source={source} />

      <footer className="mt-8 border-t border-border pt-4 text-xs text-muted-foreground">
        {t('common.disclosure')}
      </footer>
    </div>
  );
}
