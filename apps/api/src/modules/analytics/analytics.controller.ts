import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { dateKeySchema, queryBoolean } from '@fitclub/shared';
import { CurrentUser, RequirePermissions, type AuthUser } from '../../common/auth-context';
import { ZQuery } from '../../common/zod';
import { AnalyticsService } from './analytics.service';

const rangeQuery = z.object({
  from: dateKeySchema.optional(),
  to: dateKeySchema.optional(),
  includeTest: queryBoolean.optional(),
  branchId: z.string().max(64).optional(),
});

@ApiTags('admin/analytics')
@Controller('admin/analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @RequirePermissions(['dashboard.view'])
  @Get('overview')
  overview(@CurrentUser() user: AuthUser, @ZQuery(rangeQuery) q: z.infer<typeof rangeQuery>) {
    return this.analytics.overview(user, q);
  }

  @RequirePermissions(['analytics.view'])
  @Get('reports')
  reports(@CurrentUser() user: AuthUser, @ZQuery(rangeQuery) q: z.infer<typeof rangeQuery>) {
    return this.analytics.reports(user, q);
  }
}
