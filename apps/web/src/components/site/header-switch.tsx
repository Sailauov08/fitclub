'use client';

import { usePathname } from '@/i18n/navigation';
import { SiteHeader } from './header';

/** Pages with a full-bleed dark hero get the transparent, light-on-dark header. */
const OVERLAY = [/^\/$/, /^\/about$/, /^\/personal-training$/, /^\/classes\/[^/]+$/, /^\/trainers\/[^/]+$/];

export function SiteHeaderSwitch() {
  const pathname = usePathname();
  return <SiteHeader overlay={OVERLAY.some((r) => r.test(pathname))} />;
}
