'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('common');
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="flex min-h-[70dvh] flex-col items-center justify-center px-6 text-center">
      <p className="eyebrow text-primary">Error</p>
      <h1 className="display mt-4 text-3xl">{t('errorTitle')}</h1>
      <p className="mt-3 max-w-md text-muted">{t('errorBody')}</p>
      {error.digest && <p className="mt-2 font-mono text-xs text-muted">ref: {error.digest}</p>}
      <div className="mt-8 flex gap-3">
        <Button onClick={reset}>{t('retry')}</Button>
        <Button asChild variant="outline">
          <Link href="/">{t('goHome')}</Link>
        </Button>
      </div>
    </main>
  );
}
