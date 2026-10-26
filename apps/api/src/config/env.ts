import { config } from 'dotenv';

config({ quiet: true });
import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0', ''])
  .optional()
  .transform((v) => v === 'true' || v === '1');

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().default(4000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
    PUBLIC_WEB_URL: z.string().url().default('http://localhost:3000'),
    COOKIE_SECURE: bool,
    /** Number of reverse proxies in front of the API (Next.js rewrite, load balancer). */
    TRUST_PROXY: z.coerce.number().int().min(0).default(1),
    QR_SIGNING_SECRET: z.string().min(32, 'QR_SIGNING_SECRET must be at least 32 characters'),
    PAYMENTS_SANDBOX_ENABLED: bool,
    SANDBOX_WEBHOOK_SECRET: z.string().optional().default(''),
    EMAIL_FROM: z.string().default('FITCLUB <no-reply@example.com>'),
    SMTP_HOST: z.string().optional().default(''),
    SMTP_PORT: z.coerce.number().int().default(587),
    SMTP_USER: z.string().optional().default(''),
    SMTP_PASSWORD: z.string().optional().default(''),
    EMAIL_DEV_LOG: bool,
    /** `local` writes to UPLOAD_DIR; `database` stores images in PostgreSQL (serverless hosts have no writable disk). */
    STORAGE_DRIVER: z.enum(['local', 'database']).default('local'),
    UPLOAD_DIR: z.string().default('uploads'),
    JOBS_ENABLED: bool,
    SWAGGER_ENABLED: bool,
    /** Public portfolio demo: allows the labelled sandbox payment adapter in production. */
    DEMO_MODE: bool,
    /** Bearer secret Vercel Cron sends to /api/cron/*. Empty disables the cron endpoints. */
    CRON_SECRET: z.string().optional().default(''),
    /** Header carrying the real client IP when behind a proxy chain (e.g. x-vercel-forwarded-for). */
    CLIENT_IP_HEADER: z.string().optional().default(''),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production') {
      if (env.PAYMENTS_SANDBOX_ENABLED && !env.DEMO_MODE) {
        ctx.addIssue({
          code: 'custom',
          path: ['PAYMENTS_SANDBOX_ENABLED'],
          message: 'The sandbox payment adapter cannot run in production',
        });
      }
      if (!env.COOKIE_SECURE) {
        ctx.addIssue({ code: 'custom', path: ['COOKIE_SECURE'], message: 'COOKIE_SECURE must be true in production' });
      }
      if (env.EMAIL_DEV_LOG) {
        ctx.addIssue({
          code: 'custom',
          path: ['EMAIL_DEV_LOG'],
          message: 'EMAIL_DEV_LOG would log secrets in production',
        });
      }
    }
    if (env.PAYMENTS_SANDBOX_ENABLED && env.SANDBOX_WEBHOOK_SECRET.length < 16) {
      ctx.addIssue({
        code: 'custom',
        path: ['SANDBOX_WEBHOOK_SECRET'],
        message: 'Set SANDBOX_WEBHOOK_SECRET (16+ chars) to use the sandbox',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    // Fail fast with a readable message instead of a half-configured server.
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

export const env: Env = loadEnv();

export const isProduction = env.NODE_ENV === 'production';
export const emailConfigured = Boolean(env.SMTP_HOST);
