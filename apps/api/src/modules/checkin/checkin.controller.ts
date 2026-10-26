import { Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { checkInListQuerySchema, checkInOverrideSchema, checkInSchema } from '@fitclub/shared';
import { CurrentUser, MemberOnly, RequirePermissions, requireMemberId, type AuthUser } from '../../common/auth-context';
import { ZBody, ZodPipe, ZQuery } from '../../common/zod';
import { CheckInService } from './checkin.service';

@ApiTags('me/checkin')
@MemberOnly()
@Controller('me')
export class MyCheckInController {
  constructor(private readonly checkins: CheckInService) {}

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('checkin-token')
  token(@CurrentUser() user: AuthUser) {
    return this.checkins.issueToken(requireMemberId(user));
  }

  @Get('visits')
  visits(@CurrentUser() user: AuthUser) {
    return this.checkins.list(
      { ...user, staffBranchId: null },
      { page: 1, pageSize: 50, memberId: requireMemberId(user), status: 'ACCEPTED' },
    );
  }
}

@ApiTags('admin/checkin')
@Controller('admin/checkins')
export class AdminCheckInController {
  constructor(private readonly checkins: CheckInService) {}

  @RequirePermissions(['checkin.perform'])
  @Get('lookup')
  lookup(
    @Query('q', new ZodPipe(z.string().trim().max(120))) q: string,
    @Query('branchId', new ZodPipe(z.string().min(1).max(64))) branchId: string,
  ) {
    return this.checkins.lookup(q, branchId);
  }

  @RequirePermissions(['checkin.perform'])
  @HttpCode(200)
  @Post()
  checkIn(@CurrentUser() user: AuthUser, @ZBody(checkInSchema) body: z.infer<typeof checkInSchema>) {
    return this.checkins.checkIn(user, body as { qrToken?: string; memberId?: string; branchId: string });
  }

  @RequirePermissions(['checkin.override'])
  @HttpCode(200)
  @Post('override')
  override(@CurrentUser() user: AuthUser, @ZBody(checkInOverrideSchema) body: z.infer<typeof checkInOverrideSchema>) {
    return this.checkins.override(user, body);
  }

  @RequirePermissions(['checkin.read'])
  @Get()
  list(@CurrentUser() user: AuthUser, @ZQuery(checkInListQuerySchema) q: z.infer<typeof checkInListQuerySchema>) {
    return this.checkins.list(user, q);
  }

  @RequirePermissions(['members.write'])
  @HttpCode(204)
  @Post('revoke-qr/:memberId')
  async revoke(@CurrentUser() user: AuthUser, @Param('memberId') memberId: string) {
    await this.checkins.revokeTokens(user, memberId);
  }
}
