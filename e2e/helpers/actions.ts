import { expect, type Page } from '@playwright/test';
import {
  TEST_PASSWORD,
  type NewClientInput,
} from './test-data';

/**
 * E2E action helpers. Each function drives a single, atomic UI flow so the
 * test body can read top-to-bottom like a script.
 *
 * Selectors rely on accessible text/role — the codebase has no
 * data-testid convention (see plan: Critical files referenced).
 */

const APP_HEADING = 'FitPlan Pro';

export async function loginAsCoach(
  page: Page,
  email: string,
  password: string = TEST_PASSWORD
): Promise<void> {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: APP_HEADING })).toBeVisible();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /Sign in/i }).click();
  // After sign-in the coach lands on /clients/<first-client-id> OR / if no
  // clients exist.
  await page.waitForURL(/\/(clients\/|$)/, { timeout: 15_000 });
  await waitForNoSpinner(page, 10_000);
}

export async function signUpAsCoach(
  page: Page,
  email: string,
  password: string = TEST_PASSWORD
): Promise<void> {
  await page.goto('/signup');
  await expect(page.getByRole('heading', { name: APP_HEADING })).toBeVisible();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await expect(page.getByRole('button', { name: /Sign up/i })).toBeEnabled();
  await page.getByRole('button', { name: /Sign up/i }).click();
  // Normal (non-invite) signup routes to /login — the user must sign in
  // explicitly because Supabase does not auto-authenticate after signup.
  await page.waitForURL('/login', { timeout: 15_000 });
  // Now sign in with the same credentials the signup form just submitted.
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /Sign in/i }).click();
  // After sign-in the coach lands on /clients/<first-client-id> OR / if no
  // clients exist.
  await page.waitForURL(/\/(clients\/|$)/, { timeout: 15_000 });
  // First-load spinner in ProtectedRoute must clear.
  await waitForNoSpinner(page, 10_000);
}

export async function createClient(
  page: Page,
  data: NewClientInput
): Promise<void> {
  // From the Client tab, click "New" (or "Create new client" if list is empty).
  const newButton = page.getByRole('button', {
    name: /^(New|Create new client)$/i,
  });
  await newButton.click();
  await expect(
    page.getByRole('heading', { name: 'New Client' })
  ).toBeVisible();

  await page.locator('#firstName').fill(data.firstName);
  await page.locator('#lastName').fill(data.lastName);
  await page.locator('#email').fill(data.email);
  await page.locator('#birthDate').fill(data.birthDate);
  await page.locator('#weight').fill(data.weight);
  await page.locator('#height').fill(data.height);
  await page.locator('#trainingDays').fill(data.trainingDays);

  await page.getByRole('button', { name: /^Save$/i }).click();
  // "Client saved" toast confirms persist; the heading flips to "Client: <label>".
  await expect(page.getByText('Client saved')).toBeVisible({ timeout: 10_000 });
  await expect(
    page.getByRole('heading', { name: /^Client: /i })
  ).toBeVisible();
}

export async function deleteTestClient(page: Page): Promise<void> {
  // Cleanup uses the same UI the user would: Delete → confirm.
  // Caller is responsible for navigating to the Client tab first.
  const deleteButton = page.getByRole('button', { name: /^Delete$/i });
  // If the client isn't loaded (e.g. test failed before save), bail without erroring.
  if (!(await deleteButton.isVisible().catch(() => false))) return;

  await deleteButton.click();
  await expect(
    page.getByRole('heading', { name: 'Delete client' })
  ).toBeVisible();
  await page.getByRole('button', { name: /Delete client/i }).click();
  // Either the toast "Client deleted" appears, OR (if the test was on the
  // create-new screen) the page returns to the empty state. Accept either.
  await expect(
    page
      .getByText('Client deleted')
      .or(page.getByRole('heading', { name: 'No clients' }))
  ).toBeVisible({ timeout: 10_000 });
}

export async function waitForNoSpinner(
  page: Page,
  timeoutMs = 5_000
): Promise<void> {
  // Several pages (Checkin, Progress, ProtectedRoute) render a bare
  // <Loader2> with no text. The "loaded" signal is the absence of
  // .animate-spin. assert that within timeoutMs so a hang is caught
  // as a failure, not a silent timeout.
  await expect(page.locator('.animate-spin')).toHaveCount(0, {
    timeout: timeoutMs,
  });
}

export async function preferFirstNIngredients(
  page: Page,
  n: number
): Promise<void> {
  // The Ingredients page renders each ingredient as a row whose name is
  // inside a `.font-medium` div, with two icon-only buttons (X=block, ✓=prefer).
  // We click the prefer button on the first N visible rows in DOM order.
  const rows = page.locator('div:has(> div > div.font-medium)');
  const count = Math.min(n, await rows.count());
  if (count === 0) {
    throw new Error(
      'No ingredient rows found on Ingredients page. Was the page loaded?'
    );
  }
  for (let i = 0; i < count; i++) {
    const row = rows.nth(i);
    const preferBtn = row.getByRole('button').filter({
      has: page.locator('svg.lucide-check'),
    });
    await preferBtn.click();
    // Tiny pause so the row's border class flips before the next iteration's
    // locator query; robustness measure, not a real wait.
    await page.waitForTimeout(50);
  }
}
