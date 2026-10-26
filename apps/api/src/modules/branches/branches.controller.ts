import { Controller, Get, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { branchInputSchema, roomInputSchema, dateKeySchema, addDaysToKey, zonedDateTime } from '@fitclub/shared';
import { CurrentUser, Public, RequirePermissions, assertBranchAccess, type AuthUser } from '../../common/auth-context';
import { conflict, notFound } from '../../common/errors';
import { todayKey } from '../../common/dates';
import { ZBody, ZQuery } from '../../common/zod';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

const publicBranchSelect = {
  id: true,
  slug: true,
  name: true,
  city: true,
  address: true,
  description: true,
  phone: true,
  email: true,
  latitude: true,
  longitude: true,
  openingHours: true,
  imageUrl: true,
} as const;

@ApiTags('branches')
@Controller()
export class BranchesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Public()
  @Get('branches')
  list() {
    return this.prisma.branch.findMany({
      where: { isActive: true },
      select: publicBranchSelect,
      orderBy: { sortOrder: 'asc' },
    });
  }

  @Public()
  @Get('branches/:slug')
  async get(@Param('slug') slug: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { slug, isActive: true },
      select: {
        ...publicBranchSelect,
        rooms: { where: { isActive: true }, select: { id: true, name: true, capacity: true, equipment: true } },
      },
    });
    if (!branch) throw notFound('Branch');
    return branch;
  }

  @RequirePermissions(['dashboard.view'])
  @Get('admin/branches')
  adminList() {
    return this.prisma.branch.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { rooms: { orderBy: { createdAt: 'asc' } }, _count: { select: { members: true, staff: true } } },
    });
  }

  @RequirePermissions(['branches.manage'])
  @Post('admin/branches')
  async create(@CurrentUser() user: AuthUser, @ZBody(branchInputSchema) body: z.infer<typeof branchInputSchema>) {
    if (await this.prisma.branch.findUnique({ where: { slug: body.slug } }))
      throw conflict('SLUG_TAKEN', 'This slug is already used');
    const club = await this.prisma.club.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });
    const branch = await this.prisma.branch.create({ data: { ...body, clubId: club.id } });
    await this.audit.log(user, { action: 'branch.create', entityType: 'Branch', entityId: branch.id });
    return branch;
  }

  @RequirePermissions(['branches.manage'])
  @Put('admin/branches/:id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @ZBody(branchInputSchema) body: z.infer<typeof branchInputSchema>,
  ) {
    const clash = await this.prisma.branch.findFirst({ where: { slug: body.slug, id: { not: id } } });
    if (clash) throw conflict('SLUG_TAKEN', 'This slug is already used');
    const branch = await this.prisma.branch.update({ where: { id }, data: body });
    await this.audit.log(user, { action: 'branch.update', entityType: 'Branch', entityId: id });
    return branch;
  }

  @RequirePermissions(['branches.manage'])
  @Post('admin/rooms')
  async createRoom(@CurrentUser() user: AuthUser, @ZBody(roomInputSchema) body: z.infer<typeof roomInputSchema>) {
    const room = await this.prisma.room.create({ data: body });
    await this.audit.log(user, {
      action: 'room.create',
      entityType: 'Room',
      entityId: room.id,
      branchId: room.branchId,
    });
    return room;
  }

  @RequirePermissions(['branches.manage'])
  @Put('admin/rooms/:id')
  async updateRoom(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @ZBody(roomInputSchema) body: z.infer<typeof roomInputSchema>,
  ) {
    const current = await this.prisma.room.findUnique({ where: { id } });
    if (!current) throw notFound('Room');
    if (body.branchId !== current.branchId) throw conflict('CONFLICT', 'Rooms cannot move between branches');
    const over = await this.prisma.classSession.findFirst({
      where: { roomId: id, status: 'SCHEDULED', startsAt: { gte: new Date() }, capacity: { gt: body.capacity } },
    });
    if (over)
      throw conflict('CONFLICT', 'Upcoming sessions in this room exceed the new capacity — reduce them first', {
        sessionId: over.id,
      });
    const room = await this.prisma.room.update({ where: { id }, data: body });
    await this.audit.log(user, { action: 'room.update', entityType: 'Room', entityId: id, branchId: room.branchId });
    return room;
  }

  /** Room occupancy for a day: scheduled sessions per room, to spot free slots and conflicts. */
  @RequirePermissions(['schedule.read'])
  @Get('admin/rooms/:id/schedule')
  async roomSchedule(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @ZQuery(z.object({ date: dateKeySchema.optional() })) q: { date?: string },
  ) {
    const room = await this.prisma.room.findUnique({ where: { id } });
    if (!room) throw notFound('Room');
    assertBranchAccess(user, room.branchId);
    const from = q.date ?? todayKey();
    return this.prisma.classSession.findMany({
      where: {
        roomId: id,
        status: { not: 'CANCELLED' },
        startsAt: { gte: zonedDateTime(from), lt: zonedDateTime(addDaysToKey(from, 7)) },
      },
      include: { classType: { select: { name: true } }, trainer: { select: { displayName: true } } },
      orderBy: { startsAt: 'asc' },
    });
  }
}
