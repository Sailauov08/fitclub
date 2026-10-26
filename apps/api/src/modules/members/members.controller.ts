import { Controller, Get, Header, HttpCode, Param, Patch, Post, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { createMemberSchema, memberNoteSchema, staffStatusSchema, updateMemberSchema } from '@fitclub/shared';
import { CurrentUser, RequirePermissions, type AuthUser } from '../../common/auth-context';
import { ZBody, ZQuery } from '../../common/zod';
import { memberListQuerySchema, MembersService, type MemberListQuery } from './members.service';

@ApiTags('admin/members')
@Controller('admin/members')
export class AdminMembersController {
  constructor(private readonly members: MembersService) {}

  @RequirePermissions(['members.read', 'members.read_assigned'], { any: true })
  @Get()
  list(@CurrentUser() user: AuthUser, @ZQuery(memberListQuerySchema) q: MemberListQuery) {
    return this.members.list(user, q);
  }

  @RequirePermissions(['members.export'])
  @Get('export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async export(
    @CurrentUser() user: AuthUser,
    @ZQuery(memberListQuerySchema) q: MemberListQuery,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="fitclub-members-${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    return this.members.exportCsv(user, q);
  }

  @RequirePermissions(['members.read', 'members.read_assigned'], { any: true })
  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.members.detail(user, id);
  }

  @RequirePermissions(['members.write'])
  @Post()
  create(@CurrentUser() user: AuthUser, @ZBody(createMemberSchema) body: z.infer<typeof createMemberSchema>) {
    return this.members.create(user, body);
  }

  @RequirePermissions(['members.write'])
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @ZBody(updateMemberSchema) body: z.infer<typeof updateMemberSchema>,
  ) {
    return this.members.update(user, id, body);
  }

  @RequirePermissions(['members.write', 'memberships.manage'])
  @HttpCode(204)
  @Post(':id/status')
  async status(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @ZBody(staffStatusSchema) body: z.infer<typeof staffStatusSchema>,
  ) {
    await this.members.setAccountStatus(user, id, body.status, body.reason);
  }

  @RequirePermissions(['members.notes'])
  @Post(':id/notes')
  note(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @ZBody(memberNoteSchema) body: z.infer<typeof memberNoteSchema>,
  ) {
    return this.members.addNote(user, id, body.body);
  }
}
