import { HttpStatus } from '@nestjs/common';
import type { ErrorCode } from '@fitclub/shared';

/** Business error with a stable code; rendered by AllExceptionsFilter as { error: { code, message, details } }. */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: number,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Resource') => new AppError('NOT_FOUND', HttpStatus.NOT_FOUND, `${what} not found`);
export const forbidden = (message = 'You do not have access to this resource') =>
  new AppError('FORBIDDEN', HttpStatus.FORBIDDEN, message);
export const conflict = (code: ErrorCode, message: string, details?: Record<string, unknown>) =>
  new AppError(code, HttpStatus.CONFLICT, message, details);
export const badRequest = (code: ErrorCode, message: string, details?: Record<string, unknown>) =>
  new AppError(code, HttpStatus.BAD_REQUEST, message, details);
export const unprocessable = (code: ErrorCode, message: string, details?: Record<string, unknown>) =>
  new AppError(code, HttpStatus.UNPROCESSABLE_ENTITY, message, details);
