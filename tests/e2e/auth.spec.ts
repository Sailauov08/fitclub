import { expect, test } from '@playwright/test';
import { login, register, uniqueEmail, PASSWORD } from './helpers';

test.describe('authentication', () => {
  test('a visitor registers, signs out and signs back in', async ({ page }) => {
    const email = uniqueEmail('register');
    await register(page, email);
    await expect(page.getByRole('heading', { name: /Hello, Erlan/ })).toBeVisible();

    await page.getByRole('button', { name: 'Sign out' }).first().click();
    await page.waitForURL((url) => !url.pathname.includes('/account'));
    await page.goto('/en/account');
    await expect(page).toHaveURL(/\/en\/login\?next=/);

    await login(page, email);
    await expect(page).toHaveURL(/\/en\/account/);
  });

  test('wrong password is rejected without revealing whether the account exists', async ({ page }) => {
    await page.goto('/en/login');
    await page.getByLabel('E-mail').fill('member@fitclub.test');
    await page.getByLabel('Password', { exact: true }).fill(`${PASSWORD}-wrong`);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(
      page
        .getByRole('alert')
        .filter({ hasText: /incorrect|invalid/i })
        .first(),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/en\/login/);
  });

  test('registration validates input on the client', async ({ page }) => {
    await page.goto('/en/register');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByRole('alert').first()).toBeVisible();
    await expect(page).toHaveURL(/\/en\/register/);
  });

  test('protected areas redirect anonymous visitors to sign in', async ({ page }) => {
    await page.goto('/en/admin/members');
    await expect(page).toHaveURL(/\/en\/login\?next=/);
  });
});
