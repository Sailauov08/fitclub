// Imported first by serverless.e2e-spec.ts: switches on the Vercel-style configuration before the
// application modules (and their validated env) are loaded.
process.env.STORAGE_DRIVER = 'database';
process.env.CRON_SECRET = 'test-cron-secret-value';
process.env.CLIENT_IP_HEADER = 'x-vercel-forwarded-for';
