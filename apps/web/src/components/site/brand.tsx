import { cn } from '@/lib/utils';

/** Wordmark: FITCLUB set in the display face with an ember square as the full stop. */
export function Logo({ className, inverse }: { className?: string; inverse?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-baseline gap-[3px] font-display text-[1.15rem] font-bold tracking-[-0.03em]',
        inverse ? 'text-bone' : 'text-foreground',
        className,
      )}
    >
      FITCLUB
      <span aria-hidden className="inline-block size-[0.42em] translate-y-[-0.02em] rounded-[1px] bg-ember" />
    </span>
  );
}

/** Small corner tag marking stock imagery so it is never mistaken for the real facility. */
export function DemoTag({ label, className }: { label: string; className?: string }) {
  return (
    <span
      className={cn(
        'pointer-events-none absolute bottom-2 right-2 rounded bg-ink/70 px-1.5 py-0.5 text-[0.6rem] font-medium uppercase tracking-wider text-bone/90 backdrop-blur-sm',
        className,
      )}
    >
      {label}
    </span>
  );
}

export function SectionHeading({
  index,
  eyebrow,
  title,
  lead,
  inverse,
  className,
  align = 'left',
}: {
  index?: string;
  eyebrow?: string;
  title: React.ReactNode;
  lead?: React.ReactNode;
  inverse?: boolean;
  className?: string;
  align?: 'left' | 'center';
}) {
  return (
    <div className={cn('max-w-3xl', align === 'center' && 'mx-auto text-center', className)}>
      {(index || eyebrow) && (
        <div
          className={cn(
            'eyebrow mb-4 flex items-center gap-3',
            align === 'center' && 'justify-center',
            inverse ? 'text-bone/60' : 'text-muted',
          )}
        >
          {index && <span className="text-ember">{index}</span>}
          {index && eyebrow && <span className={cn('h-px w-8', inverse ? 'bg-bone/30' : 'bg-border-strong')} />}
          {eyebrow && <span>{eyebrow}</span>}
        </div>
      )}
      <h2
        className={cn(
          'display text-[2rem] sm:text-[2.6rem] lg:text-[3.1rem]',
          inverse ? 'text-bone' : 'text-foreground',
        )}
      >
        {title}
      </h2>
      {lead && (
        <p className={cn('mt-5 text-base leading-relaxed sm:text-lg', inverse ? 'text-bone/70' : 'text-muted')}>
          {lead}
        </p>
      )}
    </div>
  );
}
