import { execSync } from 'node:child_process';
import { config } from 'dotenv';

/** Applies migrations to the dedicated test database once per run. */
export default function globalSetup() {
  config();
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is not set (see apps/api/.env.example)');
  if (url === process.env.DATABASE_URL)
    throw new Error('TEST_DATABASE_URL must differ from DATABASE_URL — tests wipe it');
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url } });
}
