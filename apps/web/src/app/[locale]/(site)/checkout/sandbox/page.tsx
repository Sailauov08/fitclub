import { Suspense } from 'react';
import { SandboxCheckoutPage } from './client';

export const metadata = { robots: { index: false } };

export default function Page() {
  return (
    <Suspense>
      <SandboxCheckoutPage />
    </Suspense>
  );
}
