import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { Skeleton } from '@/components/ui/display';
import { ForgotForm } from '@/components/auth/password-forms';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth' });
  return { title: t('forgotTitle') };
}

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <ForgotForm />
    </Suspense>
  );
}
