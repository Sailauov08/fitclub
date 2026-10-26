import { Controller, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { inviteStaffSchema, staffStatusSchema, updateStaffSchema } from '@fitclub/shared';
import { CurrentUser, RequirePermissions, type AuthUser } from '../../common/auth-context';
import { ZBody } from '../../common/zod';
import { StaffService } from './staff.service';

@ApiTags('admin/staff')
@Controller('admin/staff')
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @RequirePermissions(['staff.read'])
  @Get()
  list() {
    return this.staff.list();
  }

  @RequirePermissions(['staff.read', 'audit.read'])
  @Get(':userId/activity')
  activity(@Param('userId') userId: string) {
    return this.staff.activity(userId);
  }

  @RequirePermissions(['staff.manage'])
  @Post('invitations')
  invite(@CurrentUser() user: AuthUser, @ZBody(inviteStaffSchema) body: z.infer<typeof inviteStaffSchema>) {
    return this.staff.invite(user, body);
  }

  @RequirePermissions(['staff.manage'])
  @HttpCode(204)
  @Post(':userId/resend-invite')
  async resend(@CurrentUser() user: AuthUser, @Param('userId') userId: string) {
    await this.staff.resendInvite(user, userId);
  }

  @RequirePermissions(['staff.manage'])
  @Put(':userId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('userId') userId: string,
    @ZBody(updateStaffSchema) body: z.infer<typeof updateStaffSchema>,
  ) {
    return this.staff.update(user, userId, body);
  }

  @RequirePermissions(['staff.manage'])
  @HttpCode(204)
  @Post(':userId/status')
  async status(
    @CurrentUser() user: AuthUser,
    @Param('userId') userId: string,
    @ZBody(staffStatusSchema) body: z.infer<typeof staffStatusSchema>,
  ) {
    await this.staff.setStatus(user, userId, body.status, body.reason);
  }
}
