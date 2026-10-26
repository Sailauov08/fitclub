#!/usr/bin/env node
/** Renders docs/assets/banner.html to docs/assets/banner.png (run after `node scripts/screenshots.mjs`). */
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome' });
const page = await browser.newPage({ viewport: { width: 1600, height: 640 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(join(root, 'docs/assets/banner.html')).href, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: join(root, 'docs/assets/banner.png') });
await browser.close();
console.log('docs/assets/banner.png');
