import { Suspense } from 'react';
import { CheckoutResultPage } from './client';

export const metadata = { robots: { index: false } };

export default function Page() {
  return (
    <Suspense>
      <CheckoutResultPage />
    </Suspense>
  );
}
