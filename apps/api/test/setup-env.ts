// Runs before every test file, before any application module is imported.
import { config } from 'dotenv';

config({ quiet: true });
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
process.env.JOBS_ENABLED = 'false';
process.env.LOG_LEVEL = 'silent';
process.env.EMAIL_DEV_LOG = 'false';
process.env.SMTP_HOST = '';
process.env.PAYMENTS_SANDBOX_ENABLED = 'true';
process.env.SANDBOX_WEBHOOK_SECRET = process.env.SANDBOX_WEBHOOK_SECRET || 'test-sandbox-secret-value';
process.env.QR_SIGNING_SECRET = process.env.QR_SIGNING_SECRET || 'test-qr-signing-secret-at-least-32-chars';
