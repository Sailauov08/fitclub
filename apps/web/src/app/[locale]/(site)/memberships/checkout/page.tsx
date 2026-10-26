import { Suspense } from 'react';
import { CheckoutPage } from './client';

export const metadata = { robots: { index: false } };

export default function Page() {
  return (
    <Suspense>
      <CheckoutPage />
    </Suspense>
  );
}
