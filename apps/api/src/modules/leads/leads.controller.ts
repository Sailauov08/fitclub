import { Controller, Get, HttpCode, Param, Post, Put, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { z } from 'zod';
import {
  convertLeadSchema,
  leadActivitySchema,
  leadAssignSchema,
  leadInputSchema,
  leadListQuerySchema,
  leadStatusSchema,
  publicLeadSchema,
} from '@fitclub/shared';
import { CurrentUser, Public, RequirePermissions, type AuthUser } from '../../common/auth-context';
import { ZBody, ZQuery } from '../../common/zod';
import { LeadsService } from './leads.service';

@ApiTags('leads')
@Controller()
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 10 * 60_000 } })
  @HttpCode(202)
  @Post('leads')
  createPublic(@ZBody(publicLeadSchema) body: z.infer<typeof publicLeadSchema>, @Req() req: Request) {
    return this.leads.createPublic(body, req.ip);
  }

  @RequirePermissions(['leads.read'])
  @Get('admin/leads')
  list(@CurrentUser() user: AuthUser, @ZQuery(leadListQuerySchema) q: z.infer<typeof leadListQuerySchema>) {
    return this.leads.list(user, q);
  }

  @RequirePermissions(['leads.read'])
  @Get('admin/leads/assignees')
  assignees() {
    return this.leads.assignableStaff();
  }

  @RequirePermissions(['leads.read'])
  @Get('admin/leads/:id')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.leads.detail(user, id);
  }

  @RequirePermissions(['leads.create'])
  @Post('admin/leads')
  create(@CurrentUser() user: AuthUser, @ZBody(leadInputSchema) body: z.infer<typeof leadInputSchema>) {
    return this.leads.create(user, body);
  }

  @RequirePermissions(['leads.manage'])
  @HttpCode(204)
  @Put('admin/leads/:id/status')
  async status(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @ZBody(leadStatusSchema) body: z.infer<typeof leadStatusSchema>,
  ) {
    await this.leads.setStatus(user, id, body);
  }

  @RequirePermissions(['leads.assign'])
  @HttpCode(204)
  @Put('admin/leads/:id/assignee')
  async assign(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @ZBody(leadAssignSchema) body: z.infer<typeof leadAssignSchema>,
  ) {
    await this.leads.assign(user, id, body.assignedToId);
  }

  @RequirePermissions(['leads.manage'])
  @Post('admin/leads/:id/activities')
  activity(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @ZBody(leadActivitySchema) body: z.infer<typeof leadActivitySchema>,
  ) {
    return this.leads.addActivity(user, id, body);
  }

  @RequirePermissions(['leads.manage'])
  @HttpCode(204)
  @Post('admin/leads/:id/activities/:activityId/complete')
  async complete(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('activityId') activityId: string) {
    await this.leads.completeTask(user, id, activityId);
  }

  @RequirePermissions(['leads.manage', 'members.write'])
  @Post('admin/leads/:id/convert')
  convert(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @ZBody(convertLeadSchema) body: z.infer<typeof convertLeadSchema>,
  ) {
    return this.leads.convert(user, id, body);
  }
}
