import Image from 'next/image';
import {
  Award,
  CalendarCheck,
  Dumbbell,
  Flame,
  HeartPulse,
  Lock,
  MapPin,
  Snowflake,
  Sparkles,
  TrendingUp,
  Users,
  Waves,
  type LucideIcon,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { pickLocale, type ContentBlock, type ImageRef, type Locale } from '@fitclub/shared';
import { cn } from '@/lib/utils';
import { DemoTag } from './brand';

const ICONS: Record<string, LucideIcon> = {
  award: Award,
  'calendar-check': CalendarCheck,
  dumbbell: Dumbbell,
  flame: Flame,
  'heart-pulse': HeartPulse,
  lock: Lock,
  'map-pin': MapPin,
  snowflake: Snowflake,
  'trending-up': TrendingUp,
  users: Users,
  waves: Waves,
};

export function ContentIcon({ name, className }: { name?: string; className?: string }) {
  const Icon = (name && ICONS[name]) || Sparkles;
  return <Icon className={className} aria-hidden />;
}

/** Typed access to a CMS block with graceful fallbacks when a field has not been filled in yet. */
export function block(raw: unknown, locale: Locale) {
  const b = (raw ?? { fields: {}, images: {}, items: [] }) as ContentBlock;
  return {
    text: (name: string, fallback = '') => pickLocale(b.fields?.[name], locale) || fallback,
    image: (name: string): ImageRef | null => b.images?.[name] ?? null,
    items: (b.items ?? []).map((i) => ({
      title: pickLocale(i.title, locale),
      body: pickLocale(i.body, locale),
      icon: i.icon,
    })),
  };
}

export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn('prose-fit', className)}>
      {/* react-markdown escapes raw HTML by default, so CMS content cannot inject scripts. */}
      <ReactMarkdown>{children}</ReactMarkdown>
    </div>
  );
}

/** Responsive image that always shows the "Demo photo" tag for stock imagery. */
export function CmsImage({
  image,
  url,
  alt,
  isDemo,
  locale,
  demoLabel,
  className,
  sizes = '(min-width: 1024px) 50vw, 100vw',
  priority,
}: {
  image?: ImageRef | null;
  url?: string | null;
  alt?: string;
  isDemo?: boolean;
  locale: Locale;
  demoLabel: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
}) {
  const src = image?.url ?? url;
  if (!src) return <div className={cn('bg-surface-2', className)} />;
  const demo = image?.isDemo ?? isDemo ?? src.includes('images.unsplash.com');
  return (
    <div className={cn('relative overflow-hidden bg-surface-2', className)}>
      <Image
        src={src}
        alt={alt ?? (image ? pickLocale(image.alt, locale) : '')}
        fill
        sizes={sizes}
        priority={priority}
        className="object-cover"
      />
      {demo && <DemoTag label={demoLabel} />}
    </div>
  );
}
