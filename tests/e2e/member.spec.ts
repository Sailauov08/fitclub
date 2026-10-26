import { expect, test } from '@playwright/test';
import { apiCall, login, register, uniqueEmail } from './helpers';

interface Plan {
  id: string;
  code: string;
  requiresStudentId: boolean;
  includesClasses: boolean;
  price: number;
}

test.describe('member journey', () => {
  test('buys a membership through the sandbox checkout and sees it active', async ({ page }) => {
    await register(page, uniqueEmail('buyer'));
    const plans = await apiCall<Plan[]>(page, 'GET', '/plans');
    const plan = plans.find((p) => !p.requiresStudentId && p.includesClasses && p.price > 0);
    expect(plan, 'seed has a purchasable plan').toBeTruthy();

    await page.goto(`/en/memberships/checkout?plan=${plan!.id}`);
    await page.getByRole('button', { name: /^Pay / }).click();

    await page.waitForURL(/\/checkout\/sandbox/);
    await expect(page.getByText('Sandbox mode.')).toBeVisible();
    await page.getByRole('button', { name: 'Simulate successful payment' }).click();

    await page.waitForURL(/\/checkout\/result/);
    await expect(page.getByRole('heading', { name: 'Payment received' })).toBeVisible();
    await expect(page.getByText('Test payment').first()).toBeVisible();

    await page.goto('/en/account/membership');
    await expect(page.getByText('Active').first()).toBeVisible();

    await page.goto('/en/account/payments');
    await expect(page.getByText('Paid').first()).toBeVisible();
  });

  test('a seeded member books a class and cancels it from the dashboard', async ({ page }) => {
    await login(page, 'member@fitclub.test');
    await expect(page).toHaveURL(/\/en\/account/);

    await page.goto('/en/schedule');
    // Next week is fully open for booking and never inside the late-cancel window.
    await page.getByRole('button', { name: 'Next week' }).click();
    const row = page
      .locator('li')
      .filter({ has: page.getByRole('button', { name: 'Book', exact: true }) })
      .first();
    const className = (await row.locator('.min-w-0 > p.font-semibold').innerText()).trim();
    await row.getByRole('button', { name: 'Book', exact: true }).click();
    await expect(page.getByText("You're booked!")).toBeVisible();

    await page.goto('/en/account/bookings');
    const booking = page
      .getByRole('listitem')
      .filter({ hasText: className })
      .filter({ has: page.getByRole('button', { name: 'Cancel' }) })
      .first();
    await expect(booking).toBeVisible();
    await booking.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText(/^Booking cancelled/).first()).toBeVisible();
  });

  test('member dashboard shows membership, QR pass and notifications', async ({ page }) => {
    await login(page, 'member@fitclub.test');
    await page.goto('/en/account');
    await expect(page.getByRole('heading', { name: /Hello/ })).toBeVisible();
    await page.getByRole('button', { name: 'Check-in QR' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Your check-in pass')).toBeVisible();
    await expect(dialog.locator('svg, img, canvas').first()).toBeVisible();
  });
});
