import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { isLocale, localeSchema, notificationPrefsSchema, updateProfileSchema, zonedDateTime } from '@fitclub/shared';
import { CurrentUser, type AuthUser } from '../../common/auth-context';
import { badRequest } from '../../common/errors';
import { ZBody } from '../../common/zod';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MAX_UPLOAD_BYTES, sniffImageType, StorageService } from '../media/storage.service';

@ApiTags('profile')
@Controller('me')
export class ProfileController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly storage: StorageService,
  ) {}

  @Patch('profile')
  async update(@CurrentUser() user: AuthUser, @ZBody(updateProfileSchema) body: z.infer<typeof updateProfileSchema>) {
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        locale: body.locale,
        profile: {
          update: {
            firstName: body.firstName,
            lastName: body.lastName,
            phone: body.phone,
            birthDate: body.birthDate ? zonedDateTime(body.birthDate, 12 * 60, 'UTC') : null,
          },
        },
      },
    });
    return { ok: true };
  }

  @HttpCode(204)
  @Put('locale')
  async locale(
    @CurrentUser() user: AuthUser,
    @ZBody(z.object({ locale: localeSchema })) body: { locale: 'kk' | 'ru' | 'en' },
  ) {
    await this.prisma.user.update({ where: { id: user.id }, data: { locale: body.locale } });
  }

  @Put('notification-preferences')
  async prefs(
    @CurrentUser() user: AuthUser,
    @ZBody(notificationPrefsSchema) body: z.infer<typeof notificationPrefsSchema>,
  ) {
    await this.prisma.profile.update({
      where: { userId: user.id },
      data: { notificationPrefs: body, marketingOptIn: body.marketing.email || body.marketing.inApp },
    });
    return body;
  }

  @Post('avatar')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  async avatar(@CurrentUser() user: AuthUser, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw badRequest('UPLOAD_INVALID', 'No file uploaded');
    const mime = sniffImageType(file.buffer);
    if (!mime) throw badRequest('UPLOAD_INVALID', 'Only JPEG, PNG or WebP images are allowed');
    const stored = await this.storage.putImage('avatars', file.buffer, mime);
    await this.prisma.$transaction([
      this.prisma.mediaAsset.create({
        data: {
          storageKey: stored.key,
          url: stored.url,
          mimeType: mime,
          sizeBytes: file.size,
          originalName: file.originalname.slice(0, 200),
          uploadedById: user.id,
        },
      }),
      this.prisma.profile.update({ where: { userId: user.id }, data: { avatarUrl: stored.url } }),
    ]);
    return { avatarUrl: stored.url };
  }

  /** Rendered in the language the visitor is browsing in (`?locale=`), falling back to the profile language. */
  @Get('notifications')
  list(@CurrentUser() user: AuthUser, @Query('locale') locale?: string) {
    return this.notifications.list(user.id, isLocale(locale) ? locale : user.locale);
  }

  @HttpCode(204)
  @Post('notifications/read')
  async read(@CurrentUser() user: AuthUser, @Body() body: { ids?: unknown }) {
    const parsed = z.object({ ids: z.union([z.literal('all'), z.array(z.string().max(64)).max(200)]) }).parse(body);
    await this.notifications.markRead(user.id, parsed.ids);
  }
}
