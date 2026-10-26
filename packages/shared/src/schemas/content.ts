import { z } from 'zod';
import { CONTENT_STATUSES } from '../enums';
import { localeSchema, localizedTextSchema, requiredLocalizedTextSchema } from '../i18n';
import { DEFAULT_BOOKING_POLICY } from '../domain/booking';
import { idSchema, slugSchema, urlSchema } from './common';

export const imageRefSchema = z.object({
  url: urlSchema,
  alt: localizedTextSchema,
  /** Stock/demo imagery is labelled on the site so it is never mistaken for the real facility. */
  isDemo: z.boolean().default(false),
  credit: z.string().trim().max(200).optional(),
});
export type ImageRef = z.infer<typeof imageRefSchema>;

export const contentItemSchema = z.object({
  title: localizedTextSchema,
  body: localizedTextSchema,
  icon: z.string().trim().max(40).optional(),
});

/** A CMS block: named localized text fields, optional images and an optional repeatable list. */
export const contentBlockSchema = z.object({
  fields: z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9]*$/), localizedTextSchema),
  images: z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9]*$/), imageRefSchema).default({}),
  items: z.array(contentItemSchema).max(24).default([]),
});
export type ContentBlock = z.infer<typeof contentBlockSchema>;

export type ContentFieldKind = 'text' | 'textarea' | 'markdown';
export interface ContentBlockDescriptor {
  key: string;
  fields: { name: string; kind: ContentFieldKind }[];
  images: string[];
  items: boolean;
}

/** Editable blocks and the fields the admin editor shows for each. */
export const CONTENT_BLOCKS: readonly ContentBlockDescriptor[] = [
  {
    key: 'home.hero',
    fields: [
      { name: 'eyebrow', kind: 'text' },
      { name: 'title', kind: 'text' },
      { name: 'subtitle', kind: 'textarea' },
      { name: 'primaryCta', kind: 'text' },
      { name: 'secondaryCta', kind: 'text' },
    ],
    images: ['background'],
    items: false,
  },
  {
    key: 'home.intro',
    fields: [
      { name: 'title', kind: 'text' },
      { name: 'body', kind: 'textarea' },
    ],
    images: ['image'],
    items: true,
  },
  {
    key: 'home.benefits',
    fields: [
      { name: 'title', kind: 'text' },
      { name: 'subtitle', kind: 'textarea' },
    ],
    images: [],
    items: true,
  },
  {
    key: 'home.cta',
    fields: [
      { name: 'title', kind: 'text' },
      { name: 'body', kind: 'textarea' },
    ],
    images: ['image'],
    items: false,
  },
  {
    key: 'about',
    fields: [
      { name: 'title', kind: 'text' },
      { name: 'lead', kind: 'textarea' },
      { name: 'body', kind: 'markdown' },
    ],
    images: ['image'],
    items: true,
  },
  {
    key: 'personal-training',
    fields: [
      { name: 'title', kind: 'text' },
      { name: 'lead', kind: 'textarea' },
      { name: 'body', kind: 'markdown' },
    ],
    images: ['image'],
    items: true,
  },
  {
    key: 'facilities',
    fields: [
      { name: 'title', kind: 'text' },
      { name: 'lead', kind: 'textarea' },
    ],
    images: [],
    items: false,
  },
  {
    key: 'legal.privacy',
    fields: [
      { name: 'title', kind: 'text' },
      { name: 'body', kind: 'markdown' },
    ],
    images: [],
    items: false,
  },
  {
    key: 'legal.terms',
    fields: [
      { name: 'title', kind: 'text' },
      { name: 'body', kind: 'markdown' },
    ],
    images: [],
    items: false,
  },
];
export const CONTENT_KEYS = CONTENT_BLOCKS.map((b) => b.key);

export const blogPostInputSchema = z.object({
  slug: slugSchema,
  title: requiredLocalizedTextSchema,
  excerpt: localizedTextSchema,
  body: localizedTextSchema,
  coverImage: imageRefSchema.nullable(),
  tags: z.array(z.string().trim().min(1).max(30)).max(8).default([]),
  status: z.enum(CONTENT_STATUSES),
});
export type BlogPostInput = z.infer<typeof blogPostInputSchema>;

export const faqInputSchema = z.object({
  question: requiredLocalizedTextSchema,
  answer: requiredLocalizedTextSchema,
  category: z.enum(['membership', 'classes', 'club', 'payments']),
  sortOrder: z.coerce.number().int().min(0).max(1000).default(100),
  isPublished: z.boolean().default(true),
});

export const galleryInputSchema = z.object({
  image: imageRefSchema,
  caption: localizedTextSchema,
  category: z.enum(['gym', 'studio', 'pool', 'recovery', 'community']),
  branchId: idSchema.nullable(),
  sortOrder: z.coerce.number().int().min(0).max(1000).default(100),
  isPublished: z.boolean().default(true),
});

export const testimonialInputSchema = z.object({
  authorName: z.string().trim().min(2).max(80),
  authorDetail: localizedTextSchema,
  quote: requiredLocalizedTextSchema,
  rating: z.coerce.number().int().min(1).max(5),
  isPublished: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(1000).default(100),
});

export const facilityInputSchema = z.object({
  slug: slugSchema,
  name: requiredLocalizedTextSchema,
  description: localizedTextSchema,
  icon: z.string().trim().max(40),
  image: imageRefSchema.nullable(),
  branchIds: z.array(idSchema).default([]),
  sortOrder: z.coerce.number().int().min(0).max(1000).default(100),
  isPublished: z.boolean().default(true),
});

export const announcementInputSchema = z.object({
  message: requiredLocalizedTextSchema,
  linkUrl: urlSchema.nullable(),
  startsAt: z.iso.datetime({ offset: true }).nullable(),
  endsAt: z.iso.datetime({ offset: true }).nullable(),
  isActive: z.boolean(),
});

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, { message: 'v.color' });

export const clubSettingsSchema = z.object({
  name: z.string().trim().min(2).max(80),
  legalName: z.string().trim().max(160),
  tagline: localizedTextSchema,
  contact: z.object({
    phone: z.string().trim().max(32),
    email: z.string().trim().max(254),
    whatsapp: z.string().trim().max(32).optional().default(''),
    instagram: z.string().trim().max(120).optional().default(''),
    telegram: z.string().trim().max(120).optional().default(''),
  }),
  branding: z.object({ accentColor: hexColor, logoUrl: urlSchema.nullable() }),
  bookingPolicy: z.object({
    opensHoursBefore: z.coerce
      .number()
      .int()
      .min(1)
      .max(24 * 60),
    cutoffMinutes: z.coerce
      .number()
      .int()
      .min(0)
      .max(24 * 60),
    freeCancellationHours: z.coerce.number().int().min(0).max(168),
    maxActiveBookings: z.coerce.number().int().min(1).max(100),
    waitlistEnabled: z.boolean(),
    maxWaitlistSize: z.coerce.number().int().min(0).max(100),
  }),
  membershipPolicy: z.object({
    minFreezeDays: z.coerce.number().int().min(1).max(90),
    maxFreezeAdvanceDays: z.coerce.number().int().min(0).max(90),
    memberSelfFreeze: z.boolean(),
    expiryReminderDays: z.array(z.coerce.number().int().min(1).max(60)).max(5),
  }),
  notifications: z.object({
    classReminderHours: z.coerce.number().int().min(1).max(72),
    adminAlertEmail: z.string().trim().max(254).optional().default(''),
  }),
  localization: z.object({ defaultLocale: localeSchema }),
  security: z.object({
    sessionTtlDays: z.coerce.number().int().min(1).max(90),
    maxFailedLogins: z.coerce.number().int().min(3).max(20),
    lockoutMinutes: z.coerce.number().int().min(1).max(1440),
  }),
});
export type ClubSettings = z.infer<typeof clubSettingsSchema>;

export const DEFAULT_CLUB_SETTINGS: ClubSettings = {
  name: 'FITCLUB',
  legalName: '',
  tagline: { kk: '', ru: '', en: '' },
  contact: { phone: '', email: '', whatsapp: '', instagram: '', telegram: '' },
  branding: { accentColor: '#E8562A', logoUrl: null },
  bookingPolicy: { ...DEFAULT_BOOKING_POLICY },
  membershipPolicy: { minFreezeDays: 7, maxFreezeAdvanceDays: 30, memberSelfFreeze: true, expiryReminderDays: [7, 1] },
  notifications: { classReminderHours: 3, adminAlertEmail: '' },
  localization: { defaultLocale: 'ru' },
  security: { sessionTtlDays: 14, maxFailedLogins: 5, lockoutMinutes: 15 },
};
