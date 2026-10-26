#!/usr/bin/env node
/**
 * Captures the README screenshots into docs/screenshots from a locally running stack.
 *
 *   node scripts/screenshots.mjs                      # web on http://localhost:3000
 *   SHOTS_BASE=http://localhost:3200 node scripts/screenshots.mjs
 *
 * Signs in with the seeded demo accounts using SEED_DEMO_PASSWORD from apps/api/.env, so only
 * run it against a local database seeded with `npm run db:seed`.
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const base = process.env.SHOTS_BASE ?? 'http://localhost:3000';
const out = join(root, 'docs/screenshots');
mkdirSync(out, { recursive: true });

const password = /^SEED_DEMO_PASSWORD=(.+)$/m.exec(readFileSync(join(root, 'apps/api/.env'), 'utf8'))?.[1]?.trim();
if (!password) throw new Error('SEED_DEMO_PASSWORD is not set in apps/api/.env');
const host = new URL(base).hostname;
if (!['localhost', '127.0.0.1'].includes(host))
  throw new Error('Screenshots sign in with demo credentials: local hosts only');

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome' });

async function context({ mobile = false, dark = false } = {}) {
  const ctx = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    deviceScaleFactor: mobile ? 2 : 1,
    isMobile: mobile,
    hasTouch: mobile,
    colorScheme: dark ? 'dark' : 'light',
    reducedMotion: 'reduce',
    timezoneId: 'Asia/Almaty',
  });
  if (dark) await ctx.addInitScript(() => localStorage.setItem('fc-theme', 'dark'));
  return ctx;
}

async function shot(page, path, name, { full = false, wait } = {}) {
  await page.goto(base + path, { waitUntil: 'networkidle' });
  if (wait) await page.locator(wait).first().waitFor({ timeout: 15_000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(out, `${name}.jpg`), type: 'jpeg', quality: 82, fullPage: full });
  console.log('  ✓', name);
}

async function login(page, email) {
  await page.goto(`${base}/en/login`, { waitUntil: 'networkidle' });
  await page.getByLabel(/^E-mail\*?$/).fill(email);
  await page.getByLabel(/^Password\*?$/).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => !url.pathname.endsWith('/login'));
}

console.log(`Capturing from ${base}`);

// Public website
{
  const page = await (await context()).newPage();
  await shot(page, '/kk', 'home-kk');
  await shot(page, '/en/memberships', 'memberships-en');
  await shot(page, '/ru/schedule', 'schedule-ru', { wait: 'li button' });
  await shot(page, '/en/trainers/arman-seitkali', 'trainer-en');
  await shot(page, '/en/locations', 'locations-en');
  await page.context().close();
}
{
  const page = await (await context({ dark: true })).newPage();
  await shot(page, '/en/memberships', 'memberships-dark');
  await shot(page, '/en/classes', 'classes-dark');
  await page.context().close();
}

// Member portal
{
  const page = await (await context()).newPage();
  await login(page, 'member@fitclub.test');
  await shot(page, '/en/account', 'account-overview', { wait: 'h1' });
  await shot(page, '/en/account/membership', 'account-membership', { wait: 'h1' });
  await page.context().close();
}

// Administration
{
  const page = await (await context()).newPage();
  await login(page, 'owner@fitclub.test');
  await shot(page, '/en/admin', 'admin-overview', { wait: '.recharts-surface' });
  await shot(page, '/en/admin/analytics', 'admin-analytics', { wait: '.recharts-surface' });
  await shot(page, '/en/admin/schedule', 'admin-schedule', { wait: 'a[href*="/admin/schedule/"]' });
  await shot(page, '/en/admin/members', 'admin-members', { wait: 'table' });
  await shot(page, '/en/admin/checkin', 'admin-checkin', { wait: 'h1' });
  await shot(page, '/en/admin/leads', 'admin-leads', { wait: 'h1' });
  await page.context().close();
}

// Mobile
{
  const page = await (await context({ mobile: true })).newPage();
  await shot(page, '/kk', 'mobile-home');
  await shot(page, '/kk/schedule', 'mobile-schedule', { wait: 'li button' });
  await login(page, 'member@fitclub.test');
  await shot(page, '/kk/account', 'mobile-account', { wait: 'h1' });
  await page.context().close();
}

await browser.close();
console.log(`Saved to ${out}`);
