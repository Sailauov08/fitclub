import { defineConfig, devices } from '@playwright/test';

/**
 * Run through `npm run test:e2e` (scripts/e2e.mjs), which prepares the database, builds the apps
 * and provides the per-run secrets used below.
 */
const API_PORT = 4100;
const WEB_PORT = 3100;
const required = (name: string) => {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set — run the suite with \`npm run test:e2e\``);
  return v;
};

export default defineConfig({
  testDir: 'tests/e2e',
  // Tests share one seeded database; they are written to be order-independent but run serially
  // so capacity/attendance assertions are deterministic.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    locale: 'en-US',
    timezoneId: 'Asia/Almaty',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: process.env.PW_CHANNEL || undefined } }],
  webServer: [
    {
      command: 'node apps/api/dist/main.js',
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        NODE_ENV: 'test',
        PORT: String(API_PORT),
        LOG_LEVEL: 'warn',
        DATABASE_URL: required('E2E_DATABASE_URL'),
        WEB_ORIGIN: `http://localhost:${WEB_PORT}`,
        PUBLIC_WEB_URL: `http://localhost:${WEB_PORT}`,
        COOKIE_SECURE: 'false',
        QR_SIGNING_SECRET: required('E2E_QR_SECRET'),
        PAYMENTS_SANDBOX_ENABLED: 'true',
        SANDBOX_WEBHOOK_SECRET: required('E2E_WEBHOOK_SECRET'),
        EMAIL_DEV_LOG: 'false',
        JOBS_ENABLED: 'false',
        UPLOAD_DIR: 'test-results/uploads',
      },
    },
    {
      command: `npx next start --port ${WEB_PORT}`,
      cwd: 'apps/web',
      url: `http://localhost:${WEB_PORT}/en`,
      reuseExistingServer: false,
      timeout: 90_000,
      env: { NEXT_DIST_DIR: '.next-e2e', API_ORIGIN: `http://127.0.0.1:${API_PORT}` },
    },
  ],
});
