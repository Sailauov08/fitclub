import { Controller, Delete, Get, HttpCode, Param, Post, Query, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '@fitclub/shared';
import { z } from 'zod';
import { CurrentUser, Public, type AuthUser } from '../../common/auth-context';
import { ZBody, ZodPipe } from '../../common/zod';
import { AuthService } from './auth.service';

const meta = (req: Request) => ({ ip: req.ip, userAgent: req.headers['user-agent'] });
const MINUTE = 60_000;

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60 * MINUTE } })
  @Post('register')
  async register(
    @ZBody(registerSchema) body: z.infer<typeof registerSchema>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.auth.register(body, meta(req), res);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: MINUTE } })
  @HttpCode(200)
  @Post('login')
  async login(
    @ZBody(loginSchema) body: z.infer<typeof loginSchema>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.auth.login(body.email, body.password, meta(req), res);
  }

  @Public()
  @HttpCode(204)
  @Post('logout')
  async logout(@CurrentUser() user: AuthUser | undefined, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(user, res);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 15 * MINUTE } })
  @HttpCode(202)
  @Post('forgot-password')
  async forgot(@ZBody(forgotPasswordSchema) body: z.infer<typeof forgotPasswordSchema>) {
    await this.auth.forgotPassword(body.email);
    return { ok: true };
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 15 * MINUTE } })
  @Get('token-info')
  tokenInfo(@Query('token', new ZodPipe(z.string().min(20).max(200))) token: string) {
    return this.auth.tokenInfo(token);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 15 * MINUTE } })
  @HttpCode(204)
  @Post('reset-password')
  async reset(@ZBody(resetPasswordSchema) body: z.infer<typeof resetPasswordSchema>, @Req() req: Request) {
    await this.auth.resetPassword(body.token, body.password, meta(req));
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 15 * MINUTE } })
  @HttpCode(204)
  @Post('verify-email')
  async verify(@ZBody(verifyEmailSchema) body: z.infer<typeof verifyEmailSchema>) {
    await this.auth.verifyEmail(body.token);
  }

  @Throttle({ default: { limit: 3, ttl: 15 * MINUTE } })
  @HttpCode(204)
  @Post('resend-verification')
  async resend(@CurrentUser() user: AuthUser) {
    if (!user.emailVerified) await this.auth.sendVerification(user.id, user.email, user.locale);
  }

  @Throttle({ default: { limit: 5, ttl: 15 * MINUTE } })
  @HttpCode(204)
  @Post('change-password')
  async changePassword(
    @CurrentUser() user: AuthUser,
    @ZBody(changePasswordSchema) body: z.infer<typeof changePasswordSchema>,
  ) {
    await this.auth.changePassword(user, body.currentPassword, body.newPassword);
  }

  @Get('sessions')
  sessions(@CurrentUser() user: AuthUser) {
    return this.auth.listSessions(user);
  }

  @HttpCode(204)
  @Delete('sessions/:id')
  async revoke(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.auth.revokeSession(user, id);
  }
}
