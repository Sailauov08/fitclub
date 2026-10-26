#!/usr/bin/env node
/**
 * End-to-end test runner. Prepares an isolated stack and then runs Playwright:
 *
 *   1. recreates the `public` schema of a dedicated *_e2e database, applies migrations, seeds demo data,
 *   2. builds shared + API + web (web into .next-e2e so it never clobbers your dev build),
 *   3. runs `playwright test`, which starts the API on :4100 and the web app on :3100.
 *
 *   node scripts/e2e.mjs                 # full run
 *   node scripts/e2e.mjs --skip-build    # reuse the previous e2e build
 *   node scripts/e2e.mjs -- --headed     # anything after `--` goes to Playwright
 *
 * E2E_DATABASE_URL overrides the database (default: fitclub_e2e on the local dev cluster).
 * The database name must end in `_e2e`: its schema is dropped on every run.
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'apps/api/package.json'));
const { Client } = require('pg');

const args = process.argv.slice(2);
const sep = args.indexOf('--');
const own = sep === -1 ? args : args.slice(0, sep);
const passthrough = sep === -1 ? [] : args.slice(sep + 1);

const databaseUrl =
  process.env.E2E_DATABASE_URL ?? 'postgresql://fitclub:fitclub_dev@127.0.0.1:54329/fitclub_e2e?schema=public';
const dbName = new URL(databaseUrl).pathname.slice(1);
if (!/_e2e$/.test(dbName)) {
  console.error(`Refusing to use "${dbName}": the e2e database name must end in "_e2e" because its schema is wiped.`);
  process.exit(1);
}

// npm/npx are .cmd shims on Windows and need a shell, which would split unquoted args on | & < >.
const quote = (a) => (process.platform === 'win32' && /[\s|&<>^"]/.test(a) ? `"${a.replace(/"/g, '""')}"` : a);
const run = (cmd, cmdArgs, opts = {}) => {
  const r = spawnSync(cmd, cmdArgs.map(quote), {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    cwd: root,
    ...opts,
    env: { ...process.env, ...opts.env },
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

async function resetDatabase() {
  const admin = new URL(databaseUrl);
  admin.pathname = '/postgres';
  admin.search = '';
  const c = new Client({ connectionString: admin.toString() });
  await c.connect();
  const exists = await c.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
  if (exists.rowCount === 0) await c.query(`CREATE DATABASE "${dbName}"`);
  await c.end();

  const db = new Client({ connectionString: databaseUrl.replace(/\?.*$/, '') });
  await db.connect();
  await db.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
  await db.end();
}

// Throwaway values for a throwaway database; generated per run so nothing here is reusable.
const secrets = {
  E2E_DEMO_PASSWORD: process.env.E2E_DEMO_PASSWORD ?? `E2e-${randomBytes(6).toString('base64url')}-9`,
  E2E_QR_SECRET: randomBytes(32).toString('base64url'),
  E2E_WEBHOOK_SECRET: randomBytes(24).toString('base64url'),
};

console.log(`▸ preparing ${dbName}`);
await resetDatabase();
const apiEnv = { DATABASE_URL: databaseUrl, NODE_ENV: 'development', SEED_DEMO_PASSWORD: secrets.E2E_DEMO_PASSWORD };
run('npx', ['prisma', 'migrate', 'deploy'], { cwd: join(root, 'apps/api'), env: apiEnv });
run('npx', ['tsx', 'prisma/seed.ts'], { cwd: join(root, 'apps/api'), env: apiEnv });

if (!own.includes('--skip-build')) {
  console.log('▸ building');
  run('npm', ['run', 'build', '-w', '@fitclub/shared']);
  run('npm', ['run', 'build', '-w', '@fitclub/api']);
  run('npm', ['run', 'build', '-w', '@fitclub/web'], {
    env: {
      NEXT_DIST_DIR: '.next-e2e',
      API_ORIGIN: 'http://127.0.0.1:4100',
      NEXT_PUBLIC_SITE_URL: 'http://localhost:3100',
    },
  });
}

console.log('▸ playwright');
run('npx', ['playwright', 'test', ...passthrough], {
  env: {
    ...secrets,
    E2E_DATABASE_URL: databaseUrl,
    PW_CHANNEL: process.env.PW_CHANNEL ?? (process.env.CI ? '' : 'chrome'),
  },
});
