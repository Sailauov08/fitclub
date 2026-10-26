import { config } from 'dotenv';

config({ quiet: true });
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Migrations need a direct (non-pooled) connection; Neon's pooled URL is for the running app.
    // DATABASE_URL_UNPOOLED is the name the Vercel ↔ Neon integration uses.
    url: process.env.DIRECT_URL || process.env.DATABASE_URL_UNPOOLED || env('DATABASE_URL'),
  },
});
