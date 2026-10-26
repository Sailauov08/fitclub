import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Response, Request } from 'express';
import { ZodError } from 'zod';
import type { ApiErrorBody, ErrorCode } from '@fitclub/shared';
import { Prisma } from '../generated/prisma/client';
import { AppError } from './errors';

const STATUS_CODES: Record<number, ErrorCode> = {
  400: 'VALIDATION_FAILED',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'UPLOAD_INVALID',
  429: 'RATE_LIMITED',
};

/**
 * Converts every error into the public error envelope. Internal details (stack traces,
 * SQL, Prisma messages) are logged but never sent to clients.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const req = host.switchToHttp().getRequest<Request>();
    const { status, body } = this.toBody(exception);
    if (status >= 500) {
      this.logger.error({ err: exception, path: req.url, method: req.method }, 'Unhandled error');
    }
    if (!res.headersSent) res.status(status).json(body);
  }

  private toBody(exception: unknown): { status: number; body: ApiErrorBody } {
    if (exception instanceof AppError) {
      return {
        status: exception.status,
        body: { error: { code: exception.code, message: exception.message, details: exception.details } },
      };
    }
    if (exception instanceof ZodError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        body: {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Request validation failed',
            details: { issues: exception.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) },
          },
        },
      };
    }
    if (exception instanceof ThrottlerException) {
      return { status: 429, body: { error: { code: 'RATE_LIMITED', message: 'Too many requests, please slow down' } } };
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        return {
          status: 409,
          body: { error: { code: 'CONFLICT', message: 'A record with these values already exists' } },
        };
      }
      if (exception.code === 'P2025') {
        return { status: 404, body: { error: { code: 'NOT_FOUND', message: 'Resource not found' } } };
      }
      if (exception.code === 'P2003') {
        return {
          status: 409,
          body: { error: { code: 'CONFLICT', message: 'The record is referenced by other data' } },
        };
      }
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code = STATUS_CODES[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'VALIDATION_FAILED');
      const message = status >= 500 ? 'Internal server error' : exception.message;
      return { status, body: { error: { code, message } } };
    }
    return {
      status: 500,
      body: { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } },
    };
  }
}
