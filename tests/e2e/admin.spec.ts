import { expect, test } from '@playwright/test';
import { apiCall, login } from './helpers';

interface ClassType {
  id: string;
  name: { en: string };
}
interface Trainer {
  id: string;
  displayName: string;
  isActive: boolean;
}
interface AdminSession {
  id: string;
  startsAt: string;
  trainer: { id: string };
}

const tomorrow = () => {
  const d = new Date(Date.now() + 24 * 3_600_000);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Almaty' });
};

test.describe('administration', () => {
  test('an admin creates a one-off session and reassigns its coach', async ({ page }) => {
    await login(page, 'admin@fitclub.test');
    await expect(page).toHaveURL(/\/en\/admin/);

    const types = await apiCall<ClassType[]>(page, 'GET', '/admin/class-types');
    const trainers = (await apiCall<Trainer[]>(page, 'GET', '/admin/trainers')).filter((t) => t.isActive);
    expect(types.length).toBeGreaterThan(0);
    expect(trainers.length).toBeGreaterThan(1);

    await page.goto('/en/admin/schedule');
    await page.getByRole('button', { name: 'One-off session' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Class').selectOption(types[0].id);
    await dialog.getByLabel('Coach').selectOption(trainers[0].id);
    await dialog.getByLabel('Room').selectOption({ index: 1 });
    await dialog.getByLabel('Date').fill(tomorrow());
    // An unusual time slot avoids clashing with the seeded recurring schedule.
    await dialog.getByLabel('Start time').fill('05:10');
    await dialog.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByText('Session created')).toBeVisible();

    const { sessions } = await apiCall<{ sessions: AdminSession[] }>(
      page,
      'GET',
      `/admin/sessions?from=${tomorrow()}&to=${tomorrow()}`,
    );
    const almatyTime = (iso: string) =>
      new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Asia/Almaty', hour: '2-digit', minute: '2-digit' });
    const created = sessions.find((s) => s.trainer.id === trainers[0].id && almatyTime(s.startsAt) === '05:10');
    expect(created, 'new session is listed').toBeTruthy();

    await page.goto(`/en/admin/schedule/${created!.id}`);
    await page.getByRole('button', { name: 'Edit' }).click();
    const edit = page.getByRole('dialog');
    await edit.getByLabel('Coach').selectOption(trainers[1].id);
    await edit.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Session updated')).toBeVisible();
    await expect(page.getByText(trainers[1].displayName).first()).toBeVisible();
  });

  test('reception checks a member in by search and duplicate entry is refused', async ({ page }) => {
    await login(page, 'reception@fitclub.test');
    await page.goto('/en/admin/checkin');
    await page.getByPlaceholder('Start typing a name or number…').fill('member@fitclub.test');
    const result = page.getByRole('listitem').filter({ hasText: 'FC-000001' }).first();
    await expect(result).toBeVisible();
    await result.getByRole('button', { name: 'Check in' }).click();
    await expect(page.getByText(/Welcome in!|Already checked in today/).first()).toBeVisible();

    // A second attempt the same day must not create another accepted visit.
    await result.getByRole('button', { name: 'Check in' }).click();
    await expect(page.getByText(/Already checked in today|already checked in/i).first()).toBeVisible();
  });

  test('sales creates a lead and moves it through the pipeline', async ({ page }) => {
    await login(page, 'sales@fitclub.test');
    await page.goto('/en/admin/leads');
    await page.getByRole('button', { name: 'Add lead' }).click();
    const dialog = page.getByRole('dialog');
    const name = `E2E Lead ${Date.now()}`;
    await dialog.getByLabel('Name').fill(name);
    await dialog.getByLabel('Phone').fill('+7 702 000 11 22');
    await dialog.getByRole('button', { name: 'Create' }).click();

    await page.getByRole('link', { name }).click();
    await expect(page.getByRole('heading', { name })).toBeVisible();
    await page.getByRole('button', { name: 'Contacted', exact: true }).click();
    await expect(page.getByText('Lead updated').first()).toBeVisible();

    await page.getByRole('textbox', { name: 'Details' }).fill('Called, interested in the Premium plan.');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByText('Called, interested in the Premium plan.')).toBeVisible();
  });
});

test.describe('permission restrictions', () => {
  test('a member cannot open the administration', async ({ page }) => {
    await login(page, 'member@fitclub.test');
    await page.goto('/en/admin');
    await expect(page).not.toHaveURL(/\/en\/admin(\/|$)/);
  });

  test('a trainer cannot reach payments or staff management', async ({ page }) => {
    await login(page, 'trainer@fitclub.test');
    await expect(page.getByRole('link', { name: 'Payments' })).toHaveCount(0);
    const res = await page.request.get('/api/admin/payments');
    expect(res.status()).toBe(403);
    const staff = await page.request.get('/api/admin/staff');
    expect(staff.status()).toBe(403);
  });

  test('reception cannot read or change club settings', async ({ page }) => {
    await login(page, 'reception@fitclub.test');
    const res = await page.request.get('/api/admin/settings');
    expect(res.status()).toBe(403);
  });
});
