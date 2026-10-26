import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const PASSWORD = process.env.E2E_DEMO_PASSWORD ?? '';
export const WEB = 'http://localhost:3100';

/** Form field by its visible label; required fields render the label with a trailing `*`. */
export const field = (page: Page, label: string) =>
  page.getByLabel(new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\*?$`));

/** Signs in through the real login form and waits for the post-login redirect. */
export async function login(page: Page, email: string, password = PASSWORD) {
  await page.goto('/en/login');
  await field(page, 'E-mail').fill(email);
  await field(page, 'Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => !url.pathname.endsWith('/login'));
}

/** Authenticated API call that reuses the page's session cookie and CSRF token, like the web app does. */
export async function apiCall<T = unknown>(
  page: Page,
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  data?: unknown,
): Promise<T> {
  const request: APIRequestContext = page.request;
  const cookies = await page.context().cookies(WEB);
  const csrf = cookies.find((c) => c.name === 'fc_csrf')?.value ?? '';
  const res = await request.fetch(`${WEB}/api${path}`, {
    method,
    data,
    headers: method === 'GET' ? {} : { 'x-csrf-token': csrf, origin: WEB },
  });
  expect(res.ok(), `${method} ${path} → ${res.status()} ${await res.text()}`).toBeTruthy();
  return (await res.json()) as T;
}

export const uniqueEmail = (tag: string) => `e2e.${tag}.${Date.now()}.${Math.floor(Math.random() * 1e4)}@example.test`;

/** Registers a brand-new member through the sign-up form. */
export async function register(page: Page, email: string) {
  await page.goto('/en/register');
  await field(page, 'First name').fill('Erlan');
  await field(page, 'Last name').fill('Testov');
  await field(page, 'E-mail').fill(email);
  await field(page, 'Phone').fill('+7 701 555 12 34');
  await field(page, 'Password').fill(PASSWORD);
  await field(page, 'Confirm password').fill(PASSWORD);
  await page.getByRole('checkbox').first().check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL(/\/en\/account/);
}
