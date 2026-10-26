import type { MetadataRoute } from 'next';
import { LOCALES } from '@fitclub/shared';

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
const API = process.env.API_ORIGIN ?? 'http://localhost:4000';
const STATIC = [
  '',
  '/about',
  '/memberships',
  '/classes',
  '/schedule',
  '/trainers',
  '/personal-training',
  '/facilities',
  '/gallery',
  '/promotions',
  '/blog',
  '/faq',
  '/contact',
  '/locations',
  '/privacy',
  '/terms',
];

async function slugs(path: string): Promise<string[]> {
  try {
    const res = await fetch(`${API}/api${path}`, { next: { revalidate: 3600 } });
    if (!res.ok) return [];
    return ((await res.json()) as { slug: string }[]).map((x) => x.slug);
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [classes, trainers, posts] = await Promise.all([
    slugs('/classes/types'),
    slugs('/trainers'),
    slugs('/content/blog'),
  ]);
  const paths = [
    ...STATIC,
    ...classes.map((s) => `/classes/${s}`),
    ...trainers.map((s) => `/trainers/${s}`),
    ...posts.map((s) => `/blog/${s}`),
  ];
  return paths.map((p) => ({
    url: `${SITE}/ru${p}`,
    changeFrequency: p === '/schedule' ? 'daily' : 'weekly',
    priority: p === '' ? 1 : 0.7,
    alternates: { languages: Object.fromEntries(LOCALES.map((l) => [l, `${SITE}/${l}${p}`])) },
  }));
}
