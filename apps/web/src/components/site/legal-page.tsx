import type { Locale } from '@fitclub/shared';
import { publicApi } from '@/lib/server-api';
import { block, Markdown } from './content';
import { PageHero } from './page-hero';

export async function LegalPage({
  blockKey,
  locale,
  fallbackTitle,
}: {
  blockKey: string;
  locale: Locale;
  fallbackTitle: string;
}) {
  const b = block(await publicApi<unknown>(`/content/blocks/${blockKey}`), locale);
  return (
    <>
      <PageHero title={b.text('title', fallbackTitle)} />
      <section className="container-page max-w-3xl py-14">
        <Markdown>{b.text('body')}</Markdown>
      </section>
    </>
  );
}
