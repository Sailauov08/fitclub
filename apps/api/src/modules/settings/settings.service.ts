import { Injectable } from '@nestjs/common';
import { clubSettingsSchema, DEFAULT_CLUB_SETTINGS, type ClubSettings } from '@fitclub/shared';
import { PrismaService } from '../../prisma/prisma.service';

const CACHE_MS = 30_000;

/** Club-wide settings (single club per deployment, many branches). Cached briefly in memory. */
@Injectable()
export class SettingsService {
  private cache: { value: ClubSettings; clubId: string; at: number } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async getClub() {
    const club = await this.prisma.club.findFirst({ orderBy: { createdAt: 'asc' } });
    if (club) return club;
    return this.prisma.club.create({ data: { name: DEFAULT_CLUB_SETTINGS.name, settings: DEFAULT_CLUB_SETTINGS } });
  }

  async get(): Promise<ClubSettings> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.value;
    const club = await this.getClub();
    // Merge with defaults so newly added settings keys work on older databases.
    const raw = (club.settings ?? {}) as Partial<ClubSettings>;
    const merged = {
      ...DEFAULT_CLUB_SETTINGS,
      ...raw,
      contact: { ...DEFAULT_CLUB_SETTINGS.contact, ...raw.contact },
      branding: { ...DEFAULT_CLUB_SETTINGS.branding, ...raw.branding },
      bookingPolicy: { ...DEFAULT_CLUB_SETTINGS.bookingPolicy, ...raw.bookingPolicy },
      membershipPolicy: { ...DEFAULT_CLUB_SETTINGS.membershipPolicy, ...raw.membershipPolicy },
      notifications: { ...DEFAULT_CLUB_SETTINGS.notifications, ...raw.notifications },
      localization: { ...DEFAULT_CLUB_SETTINGS.localization, ...raw.localization },
      security: { ...DEFAULT_CLUB_SETTINGS.security, ...raw.security },
    };
    const parsed = clubSettingsSchema.safeParse(merged);
    const value = parsed.success ? parsed.data : DEFAULT_CLUB_SETTINGS;
    this.cache = { value, clubId: club.id, at: Date.now() };
    return value;
  }

  async update(next: ClubSettings): Promise<ClubSettings> {
    const club = await this.getClub();
    await this.prisma.club.update({ where: { id: club.id }, data: { name: next.name, settings: next } });
    this.cache = null;
    return this.get();
  }

  invalidate() {
    this.cache = null;
  }
}
