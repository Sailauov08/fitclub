import { expect, test } from '@playwright/test';

test.describe('public website', () => {
  test('home page renders live club data in every language', async ({ page }) => {
    for (const [locale, lang] of [
      ['en', 'en'],
      ['ru', 'ru'],
      ['kk', 'kk'],
    ] as const) {
      const res = await page.goto(`/${locale}`);
      expect(res?.status()).toBe(200);
      await expect(page.locator('html')).toHaveAttribute('lang', lang);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    }
  });
});

test.describe('public navigation', () => {
  test('memberships list real plans with KZT prices', async ({ page }) => {
    await page.goto('/en/memberships');
    await expect(page.getByRole('heading', { level: 1, name: 'Memberships' })).toBeVisible();
    await expect(page.getByText(/₸/).first()).toBeVisible();
  });

  test('the language switcher keeps the current page', async ({ page }) => {
    await page.goto('/en/schedule');
    await page
      .getByRole('button', { name: /language/i })
      .first()
      .click();
    await page.getByRole('menuitem', { name: /Русский/ }).click();
    await expect(page).toHaveURL(/\/ru\/schedule/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  });

  test('the contact form creates a lead', async ({ page }) => {
    await page.goto('/en/contact');
    await page.getByLabel(/^Your name/).fill('Website Visitor');
    await page.getByLabel(/^Phone/).fill('+7 705 123 45 67');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByText('Thank you!')).toBeVisible();
  });

  test('unknown pages return the localized 404', async ({ page }) => {
    const res = await page.goto('/en/definitely-not-a-page');
    expect(res?.status()).toBe(404);
    await expect(page.getByText('Page not found')).toBeVisible();
  });
});

test('every public page renders without a server error', async ({ page }) => {
  const paths = [
    '',
    'about',
    'memberships',
    'classes',
    'classes?category=strength',
    'schedule',
    'trainers',
    'personal-training',
    'facilities',
    'gallery',
    'promotions',
    'blog',
    'faq',
    'contact',
    'locations',
    'privacy',
    'terms',
    'login',
    'register',
    'forgot-password',
  ];
  for (const p of paths) {
    const res = await page.goto(`/en/${p}`);
    expect(res?.status(), `/en/${p}`).toBe(200);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  }
});
