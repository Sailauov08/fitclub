import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/site/brand';

export default async function NotFound() {
  const t = await getTranslations('common');
  return (
    <main className="grain flex min-h-dvh flex-col items-center justify-center bg-ink px-6 text-center text-bone">
      <Logo inverse />
      <p className="display mt-16 text-[7rem] leading-none text-ember sm:text-[10rem]">404</p>
      <h1 className="mt-6 text-2xl font-semibold">{t('notFoundTitle')}</h1>
      <p className="mt-3 max-w-md text-bone/65">{t('notFoundBody')}</p>
      <Button asChild size="lg" variant="inverse" className="mt-10">
        <Link href="/">{t('goHome')}</Link>
      </Button>
    </main>
  );
}
