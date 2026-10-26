import { Controller, Delete, Get, HttpCode, Param, Post, Put, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { z, type ZodType } from 'zod';
import {
  announcementInputSchema,
  blogPostInputSchema,
  CONTENT_KEYS,
  contentBlockSchema,
  facilityInputSchema,
  faqInputSchema,
  galleryInputSchema,
  testimonialInputSchema,
} from '@fitclub/shared';
import { CurrentUser, Public, RequirePermissions, type AuthUser } from '../../common/auth-context';
import { badRequest, conflict, notFound } from '../../common/errors';
import { ZBody, ZodPipe } from '../../common/zod';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MAX_UPLOAD_BYTES, sniffImageType, StorageService } from '../media/storage.service';
import { Prisma } from '../../generated/prisma/client';

/** Simple CMS collections share one CRUD shape. */
const COLLECTIONS = {
  faq: { model: 'faqItem', schema: faqInputSchema, order: [{ sortOrder: 'asc' }], published: { isPublished: true } },
  gallery: {
    model: 'galleryItem',
    schema: galleryInputSchema,
    order: [{ sortOrder: 'asc' }],
    published: { isPublished: true },
  },
  testimonials: {
    model: 'testimonial',
    schema: testimonialInputSchema,
    order: [{ sortOrder: 'asc' }],
    published: { isPublished: true },
  },
  facilities: {
    model: 'facility',
    schema: facilityInputSchema,
    order: [{ sortOrder: 'asc' }],
    published: { isPublished: true },
  },
  announcements: {
    model: 'announcement',
    schema: announcementInputSchema,
    order: [{ createdAt: 'desc' }],
    published: { isActive: true },
  },
} as const;
type CollectionName = keyof typeof COLLECTIONS;

const collectionParam = new ZodPipe(z.enum(Object.keys(COLLECTIONS) as [CollectionName, ...CollectionName[]]));

interface Delegate {
  findMany(args: unknown): Promise<unknown[]>;
  create(args: unknown): Promise<{ id: string }>;
  update(args: unknown): Promise<{ id: string }>;
  delete(args: unknown): Promise<unknown>;
}

@ApiTags('content')
@Controller()
export class ContentController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  private delegate(name: CollectionName): Delegate {
    return (this.prisma as unknown as Record<string, Delegate>)[COLLECTIONS[name].model]!;
  }

  private normalize(name: CollectionName, data: Record<string, unknown>) {
    if (name === 'announcements') {
      return {
        ...data,
        startsAt: data.startsAt ? new Date(String(data.startsAt)) : null,
        endsAt: data.endsAt ? new Date(String(data.endsAt)) : null,
      };
    }
    return data;
  }

  // ───────────── Public reads ─────────────

  /** Everything the homepage needs in one request. */
  @Public()
  @Get('content/home')
  async home() {
    const now = new Date();
    const weekAhead = new Date(now.getTime() + 7 * 86_400_000);
    const [
      blocks,
      plans,
      classTypes,
      trainers,
      testimonials,
      facilities,
      faq,
      promotions,
      branches,
      announcements,
      posts,
      stats,
    ] = await Promise.all([
      this.prisma.contentEntry.findMany({
        where: { key: { in: ['home.hero', 'home.intro', 'home.benefits', 'home.cta'] } },
      }),
      this.prisma.membershipPlan.findMany({
        where: { status: 'ACTIVE', isPublic: true },
        orderBy: [{ isFeatured: 'desc' }, { sortOrder: 'asc' }],
        take: 4,
      }),
      this.prisma.classType.findMany({
        where: { isPublic: true, isArchived: false },
        include: { category: true },
        take: 6,
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.trainer.findMany({
        where: { isPublic: true, isActive: true },
        orderBy: { sortOrder: 'asc' },
        take: 4,
        select: { id: true, slug: true, displayName: true, headline: true, photoUrl: true, specializations: true },
      }),
      this.prisma.testimonial.findMany({ where: { isPublished: true }, orderBy: { sortOrder: 'asc' }, take: 6 }),
      this.prisma.facility.findMany({ where: { isPublished: true }, orderBy: { sortOrder: 'asc' }, take: 6 }),
      this.prisma.faqItem.findMany({ where: { isPublished: true }, orderBy: { sortOrder: 'asc' }, take: 6 }),
      this.prisma.promotion.findMany({
        where: { status: 'ACTIVE', isPublic: true, OR: [{ validUntil: null }, { validUntil: { gt: now } }] },
        take: 3,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.branch.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          slug: true,
          name: true,
          city: true,
          address: true,
          phone: true,
          openingHours: true,
          latitude: true,
          longitude: true,
        },
      }),
      this.activeAnnouncements(now),
      this.prisma.blogPost.findMany({
        where: { status: 'PUBLISHED', publishedAt: { lte: now } },
        orderBy: { publishedAt: 'desc' },
        take: 3,
        select: { slug: true, title: true, excerpt: true, coverImage: true, publishedAt: true },
      }),
      // Facts shown on the homepage are counted from live records, never typed into the page.
      Promise.all([
        this.prisma.branch.count({ where: { isActive: true } }),
        this.prisma.classType.count({ where: { isPublic: true, isArchived: false } }),
        this.prisma.trainer.count({ where: { isPublic: true, isActive: true } }),
        this.prisma.classSession.count({ where: { status: 'SCHEDULED', startsAt: { gte: now, lt: weekAhead } } }),
      ]).then(([branchCount, classFormats, coaches, sessionsThisWeek]) => ({
        branches: branchCount,
        classFormats,
        coaches,
        sessionsThisWeek,
      })),
    ]);
    return {
      blocks: Object.fromEntries(blocks.map((b) => [b.key, b.data])),
      plans,
      classTypes,
      trainers,
      testimonials,
      facilities,
      faq,
      promotions: promotions.map(({ code, ...p }) => ({ ...p, code })),
      branches,
      announcements,
      posts,
      stats,
    };
  }

  private activeAnnouncements(now: Date) {
    return this.prisma.announcement.findMany({
      where: {
        isActive: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });
  }

  @Public()
  @Get('content/blocks/:key')
  async block(@Param('key') key: string) {
    const entry = await this.prisma.contentEntry.findUnique({ where: { key } });
    if (!entry) throw notFound('Content');
    return entry.data;
  }

  @Public()
  @Get('content/blog')
  posts() {
    return this.prisma.blogPost.findMany({
      where: { status: 'PUBLISHED', publishedAt: { lte: new Date() } },
      orderBy: { publishedAt: 'desc' },
      select: { id: true, slug: true, title: true, excerpt: true, coverImage: true, tags: true, publishedAt: true },
    });
  }

  @Public()
  @Get('content/blog/:slug')
  async post(@Param('slug') slug: string) {
    const post = await this.prisma.blogPost.findFirst({
      where: { slug, status: 'PUBLISHED', publishedAt: { lte: new Date() } },
      include: { author: { select: { profile: { select: { firstName: true, lastName: true } } } } },
    });
    if (!post) throw notFound('Post');
    return post;
  }

  @Public()
  @Get('content/collections/:name')
  collection(@Param('name', collectionParam) name: CollectionName) {
    if (name === 'announcements') return this.activeAnnouncements(new Date());
    return this.delegate(name).findMany({ where: COLLECTIONS[name].published, orderBy: COLLECTIONS[name].order });
  }

  // ───────────── Admin ─────────────

  @RequirePermissions(['content.manage'])
  @Get('admin/content/blocks')
  async blocks() {
    const entries = await this.prisma.contentEntry.findMany();
    return CONTENT_KEYS.map(
      (key) => entries.find((e) => e.key === key) ?? { key, data: null, version: 0, updatedAt: null },
    );
  }

  @RequirePermissions(['content.manage'])
  @Put('admin/content/blocks/:key')
  async saveBlock(
    @CurrentUser() user: AuthUser,
    @Param('key') key: string,
    @ZBody(contentBlockSchema.extend({ version: z.number().int().min(0) }))
    body: z.infer<typeof contentBlockSchema> & { version: number },
  ) {
    if (!CONTENT_KEYS.includes(key)) throw notFound('Content block');
    const { version, ...data } = body;
    const existing = await this.prisma.contentEntry.findUnique({ where: { key } });
    if (existing && existing.version !== version)
      throw conflict('CONFLICT', 'Someone else edited this block. Reload to see their changes.');
    const entry = existing
      ? await this.prisma.contentEntry.update({
          where: { key },
          data: { data: data as Prisma.InputJsonValue, version: { increment: 1 }, updatedById: user.id },
        })
      : await this.prisma.contentEntry.create({
          data: { key, data: data as Prisma.InputJsonValue, updatedById: user.id },
        });
    await this.audit.log(user, {
      action: 'content.block_update',
      entityType: 'ContentEntry',
      entityId: key,
      metadata: { version: entry.version },
    });
    return entry;
  }

  @RequirePermissions(['content.manage'])
  @Get('admin/content/blog')
  adminPosts() {
    return this.prisma.blogPost.findMany({ orderBy: { updatedAt: 'desc' } });
  }

  @RequirePermissions(['content.manage'])
  @Post('admin/content/blog')
  async createPost(
    @CurrentUser() user: AuthUser,
    @ZBody(blogPostInputSchema) body: z.infer<typeof blogPostInputSchema>,
  ) {
    if (await this.prisma.blogPost.findUnique({ where: { slug: body.slug } }))
      throw conflict('SLUG_TAKEN', 'This slug is already used');
    const post = await this.prisma.blogPost.create({
      data: {
        ...body,
        coverImage: body.coverImage ?? Prisma.JsonNull,
        authorId: user.id,
        publishedAt: body.status === 'PUBLISHED' ? new Date() : null,
      },
    });
    await this.audit.log(user, {
      action: 'blog.create',
      entityType: 'BlogPost',
      entityId: post.id,
      metadata: { status: post.status },
    });
    return post;
  }

  @RequirePermissions(['content.manage'])
  @Put('admin/content/blog/:id')
  async updatePost(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @ZBody(blogPostInputSchema) body: z.infer<typeof blogPostInputSchema>,
  ) {
    const current = await this.prisma.blogPost.findUnique({ where: { id } });
    if (!current) throw notFound('Post');
    if (body.slug !== current.slug && (await this.prisma.blogPost.findUnique({ where: { slug: body.slug } })))
      throw conflict('SLUG_TAKEN', 'This slug is already used');
    const post = await this.prisma.blogPost.update({
      where: { id },
      data: {
        ...body,
        coverImage: body.coverImage ?? Prisma.JsonNull,
        publishedAt: body.status === 'PUBLISHED' ? (current.publishedAt ?? new Date()) : null,
      },
    });
    await this.audit.log(user, {
      action: 'blog.update',
      entityType: 'BlogPost',
      entityId: id,
      metadata: { status: post.status },
    });
    return post;
  }

  @RequirePermissions(['content.manage'])
  @HttpCode(204)
  @Delete('admin/content/blog/:id')
  async deletePost(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.prisma.blogPost.delete({ where: { id } });
    await this.audit.log(user, { action: 'blog.delete', entityType: 'BlogPost', entityId: id });
  }

  @RequirePermissions(['content.manage'])
  @Get('admin/content/collections/:name')
  adminCollection(@Param('name', collectionParam) name: CollectionName) {
    return this.delegate(name).findMany({ orderBy: COLLECTIONS[name].order });
  }

  @RequirePermissions(['content.manage'])
  @Post('admin/content/collections/:name')
  async createItem(
    @CurrentUser() user: AuthUser,
    @Param('name', collectionParam) name: CollectionName,
    @ZBody(z.unknown()) raw: unknown,
  ) {
    const data = (COLLECTIONS[name].schema as ZodType).parse(raw) as Record<string, unknown>;
    const item = await this.delegate(name).create({ data: this.normalize(name, data) });
    await this.audit.log(user, {
      action: `content.${name}.create`,
      entityType: COLLECTIONS[name].model,
      entityId: item.id,
    });
    return item;
  }

  @RequirePermissions(['content.manage'])
  @Put('admin/content/collections/:name/:id')
  async updateItem(
    @CurrentUser() user: AuthUser,
    @Param('name', collectionParam) name: CollectionName,
    @Param('id') id: string,
    @ZBody(z.unknown()) raw: unknown,
  ) {
    const data = (COLLECTIONS[name].schema as ZodType).parse(raw) as Record<string, unknown>;
    const item = await this.delegate(name).update({ where: { id }, data: this.normalize(name, data) });
    await this.audit.log(user, { action: `content.${name}.update`, entityType: COLLECTIONS[name].model, entityId: id });
    return item;
  }

  @RequirePermissions(['content.manage'])
  @HttpCode(204)
  @Delete('admin/content/collections/:name/:id')
  async deleteItem(
    @CurrentUser() user: AuthUser,
    @Param('name', collectionParam) name: CollectionName,
    @Param('id') id: string,
  ) {
    await this.delegate(name).delete({ where: { id } });
    await this.audit.log(user, { action: `content.${name}.delete`, entityType: COLLECTIONS[name].model, entityId: id });
  }

  /** Image upload for CMS content. The file type is detected from its bytes, not the client-provided MIME type. */
  @RequirePermissions(['content.manage', 'trainers.manage', 'classes.manage'], { any: true })
  @Post('admin/media')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  async upload(@CurrentUser() user: AuthUser, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw badRequest('UPLOAD_INVALID', 'No file uploaded');
    const mime = sniffImageType(file.buffer);
    if (!mime) throw badRequest('UPLOAD_INVALID', 'Only JPEG, PNG or WebP images up to 5 MB are allowed');
    const stored = await this.storage.putImage('content', file.buffer, mime);
    const asset = await this.prisma.mediaAsset.create({
      data: {
        storageKey: stored.key,
        url: stored.url,
        mimeType: mime,
        sizeBytes: file.size,
        originalName: file.originalname.slice(0, 200),
        uploadedById: user.id,
      },
    });
    await this.audit.log(user, { action: 'media.upload', entityType: 'MediaAsset', entityId: asset.id });
    return asset;
  }

  @RequirePermissions(['content.manage'])
  @Get('admin/media')
  media() {
    return this.prisma.mediaAsset.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
  }
}
