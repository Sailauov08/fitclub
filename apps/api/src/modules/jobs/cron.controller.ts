import { Controller, Get, Headers, HttpStatus } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { env } from '../../config/env';
import { Public } from '../../common/auth-context';
import { safeEqual } from '../../common/crypto';
import { AppError } from '../../common/errors';
import { JobsService } from './jobs.service';

/** Entry point for Vercel Cron (see apps/api/vercel.json). Authenticated by the CRON_SECRET bearer token. */
@ApiExcludeController()
@SkipThrottle()
@Public()
@Controller('cron')
export class CronController {
  constructor(private readonly jobs: JobsService) {}

  @Get('daily')
  daily(@Headers('authorization') authorization?: string) {
    if (!env.CRON_SECRET || !authorization || !safeEqual(authorization, `Bearer ${env.CRON_SECRET}`)) {
      throw new AppError('UNAUTHENTICATED', HttpStatus.UNAUTHORIZED, 'Invalid cron credentials');
    }
    return this.jobs.runAll();
  }
}
