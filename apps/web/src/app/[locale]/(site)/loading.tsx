import { Skeleton } from '@/components/ui/display';

/** Shown instantly while the next public page renders, so navigation never feels frozen. */
export default function SiteLoading() {
  return (
    <div role="status" aria-busy="true">
      <section className="border-b border-border">
        <div className="container-page pb-14 pt-16 sm:pb-20 sm:pt-24">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="mt-6 h-12 w-full max-w-xl" />
          <Skeleton className="mt-5 h-5 w-full max-w-lg" />
        </div>
      </section>
      <div className="container-page grid gap-6 py-14 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-64" />
        ))}
      </div>
    </div>
  );
}
