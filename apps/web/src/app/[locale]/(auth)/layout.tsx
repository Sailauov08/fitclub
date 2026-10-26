import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Logo, DemoTag } from '@/components/site/brand';
import { LocaleSwitcher } from '@/components/site/locale-switcher';

export const metadata = { robots: { index: false } };

const IMAGE = 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=1400&q=70';

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations('auth');
  const common = await getTranslations('common');
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.05fr]">
      <aside className="relative hidden overflow-hidden bg-ink text-bone lg:block">
        <Image src={IMAGE} alt="" fill priority sizes="50vw" className="object-cover opacity-55" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/50 to-ink/30" />
        <DemoTag label={common('demoPhoto')} />
        <div className="relative flex h-full flex-col justify-between p-12">
          <Link href="/" aria-label="FITCLUB">
            <Logo inverse />
          </Link>
          <div>
            <p className="display max-w-md text-5xl">{t('asideTitle')}</p>
            <p className="mt-5 max-w-sm text-bone/70">{t('asideBody')}</p>
          </div>
        </div>
      </aside>
      <main className="flex flex-col">
        <div className="flex items-center justify-between p-5 sm:p-8">
          <Link href="/" className="lg:invisible" aria-label="FITCLUB">
            <Logo />
          </Link>
          <LocaleSwitcher />
        </div>
        <div className="flex flex-1 items-center justify-center px-5 pb-16 sm:px-8">
          <div className="w-full max-w-md">{children}</div>
        </div>
      </main>
    </div>
  );
}
