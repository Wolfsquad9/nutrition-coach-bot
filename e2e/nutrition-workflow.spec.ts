/**
 * Coach-to-athlete nutrition workflow E2E regression (P0-4).
 *
 * Verifies the primary nutrition workflow: coach generates a plan (daily or
 * weekly), reviews the draft, locks it, and the athlete sees the persisted
 * locked plan after reload.
 *
 * Runs ONLY against the local Supabase stack. The `MEAL_VARIETY_E2E=1` env
 * flag arms the fail-closed guard in `e2e/helpers/supabase.ts`.
 *
 * Run via:
 *   MEAL_VARIETY_E2E=1 npx playwright test e2e/nutrition-workflow.spec.ts
 */
import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  signUpAsCoach,
  createClient,
  preferFirstNIngredients,
  waitForNoSpinner,
} from './helpers/actions';
import {
  TEST_PASSWORD,
  NEW_CLIENT,
  type NewClientInput,
} from './helpers/test-data';
import { cleanupTest } from './helpers/fixtures';

const test = cleanupTest;

test.beforeEach(() => {
  if (process.env.MEAL_VARIETY_E2E !== '1') {
    test.skip(true, 'nutrition workflow requires MEAL_VARIETY_E2E=1 (local stack only)');
  }
});

async function setupLockedPlan(
  page: Page,
  coachEmail: string,
  clientEmail: string,
  clientData: NewClientInput,
  planType: 'daily' | 'weekly'
): Promise<string> {
  await signUpAsCoach(page, coachEmail, TEST_PASSWORD);
  await createClient(page, clientData);

  await page.getByRole('tab', { name: 'Ingredients' }).click();
  await page.waitForURL(/\/ingredients$/);
  await expect(page.getByRole('heading', { name: 'Ingredient Manager' })).toBeVisible();
  await preferFirstNIngredients(page, 5);

  await page.getByRole('tab', { name: 'Nutrition' }).click();
  await page.waitForURL(/\/nutrition$/);
  await expect(page.getByRole('heading', { name: /Meal Plan Generation/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No nutrition plan' })).toBeVisible({
    timeout: 15_000,
  });

  if (planType === 'daily') {
    await page.getByRole('button', { name: /^Daily Plan$/i }).click();
    await expect(page.getByText('Breakfast', { exact: true }).first()).toBeVisible({
      timeout: 30_000,
    });
  } else {
    await page.getByRole('button', { name: /^(Weekly Plan|Regenerate)$/i }).click();
    await expect(page.getByText('Breakfast', { exact: true }).first()).toBeVisible({
      timeout: 30_000,
    });
  }

  await page.getByRole('button', { name: /^Lock Plan$/i }).click();
  await expect(page.getByRole('heading', { name: 'Confirm lock' })).toBeVisible();
  await page.getByRole('button', { name: /Confirm lock/i }).click();
  await expect(page.getByText(/^Locked \(\d+d\)$/i)).toBeVisible({ timeout: 10_000 });

  await page.getByRole('tab', { name: 'Client' }).click();
  await page.waitForURL(/\/clients\/[^/]+$/);
  await expect(page.getByRole('heading', { name: /^Client: /i })).toBeVisible();
  await page.getByRole('button', { name: /Invite Client/i }).click();
  await expect(page.getByRole('heading', { name: 'Invitation created' })).toBeVisible({
    timeout: 15_000,
  });
  const inviteLink = page.locator('div.font-mono').filter({ hasText: /\/signup\?invite=/ });
  await expect(inviteLink).toBeVisible();
  const inviteText = await inviteLink.textContent();
  expect(inviteText).toMatch(/\/signup\?invite=[^\s]+/);
  await page.keyboard.press('Escape');
  return inviteText!.trim();
}

async function claimInviteAsAthlete(
  browser: import('@playwright/test').Browser,
  inviteUrl: string,
  clientEmail: string,
  clientPassword: string
) {
  const clientContext = await browser.newContext();
  const clientPage = await clientContext.newPage();
  await clientPage.goto(inviteUrl);
  await expect(clientPage.getByRole('heading', { name: 'FitPlan Pro' })).toBeVisible();
  await clientPage.getByLabel('Email').fill(clientEmail);
  await clientPage.getByLabel('Password').fill(clientPassword);
  await clientPage.getByRole('button', { name: /Sign up/i }).click();
  await clientPage.waitForURL('/my-plan', { timeout: 15_000 });
  await expect(clientPage.getByRole('heading', { name: 'My Plan' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(clientPage.getByText('Breakfast', { exact: true }).first()).toBeVisible({
    timeout: 20_000,
  });
  return { clientContext, clientPage };
}
test('A. Daily plan survives generation, lock and athlete view', async ({
  browser,
  page,
  coachEmail,
  clientEmail,
  clientPassword,
  cleanup,
}) => {
  const inviteUrl = await setupLockedPlan(
    page, coachEmail, clientEmail, { ...NEW_CLIENT, email: clientEmail }, 'daily'
  );
  const { clientContext, clientPage } = await claimInviteAsAthlete(
    browser, inviteUrl, clientEmail, clientPassword
  );
  try {
    await expect(clientPage.getByText('Breakfast', { exact: true }).first()).toBeVisible();
    await expect(clientPage.getByRole('heading', { name: 'My Plan' })).toBeVisible();
  } finally {
    await clientContext.close();
  }
  void cleanup;
});

test('B. Weekly plan survives generation, lock and athlete view', async ({
  browser,
  page,
  coachEmail,
  clientEmail,
  clientPassword,
  cleanup,
}) => {
  const inviteUrl = await setupLockedPlan(
    page, coachEmail, clientEmail, { ...NEW_CLIENT, email: clientEmail }, 'weekly'
  );
  const { clientContext, clientPage } = await claimInviteAsAthlete(
    browser, inviteUrl, clientEmail, clientPassword
  );
  try {
    await expect(clientPage.getByText('Breakfast', { exact: true }).first()).toBeVisible();
    await expect(clientPage.getByRole('heading', { name: 'My Plan' })).toBeVisible();
  } finally {
    await clientContext.close();
  }
  void cleanup;
});

test('C. Locked plan persists through reload', async ({ page, coachEmail, clientEmail, cleanup }) => {
  await setupLockedPlan(page, coachEmail, clientEmail, { ...NEW_CLIENT, email: clientEmail }, 'weekly');

  await page.reload();
  await waitForNoSpinner(page, 10_000);
  await expect(page.getByText('Breakfast', { exact: true }).first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText(/^Locked \(\d+d\)$/i)).toBeVisible({ timeout: 10_000 });

  void cleanup;
});