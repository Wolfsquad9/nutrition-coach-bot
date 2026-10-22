/**
 * Meal Variety persistence round-trip (P0-1).
 *
 * Runs ONLY against the local Supabase stack. The `MEAL_VARIETY_E2E=1` env flag
 * arms the fail-closed guard in `e2e/helpers/supabase.ts`, which requires a
 * loopback Supabase URL and refuses any remote host BEFORE any auth, mutation,
 * or cleanup can execute. Run via:
 *
 *   MEAL_VARIETY_E2E=1 npx playwright test e2e/meal-variety.spec.ts
 *
 * with the dev server pointed at the local stack (see `.env.test.local`).
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
import type { MealVarietyPreference } from '@/services/recipe/types';

const test = cleanupTest;

test.beforeEach(() => {
  if (process.env.MEAL_VARIETY_E2E !== '1') {
    test.skip(true, 'meal-variety round-trip requires MEAL_VARIETY_E2E=1 (local stack only)');
  }
});

/**
 * Coach setup through lock, with an explicit variety selection injected before
 * generation. Mirrors `setupLockedClientWithInvite` steps 1-5 + invite, with
 * the Meal variety toggle set to `preference` before Weekly Plan.
 */
async function setupLockedPlanWithVariety(
  page: Page,
  coachEmail: string,
  clientEmail: string,
  clientData: NewClientInput,
  preference: MealVarietyPreference
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

  // The variety control under test: real ToggleGroup radio in the weekly panel.
  const varietyLabel = preference === 'more' ? 'More variety' : 'Traditional variety';
  await page.getByRole('radio', { name: varietyLabel }).click();

  await page.getByRole('button', { name: /^(Weekly Plan|Regenerate)$/i }).click();
  await expect(page.getByText('Breakfast', { exact: true }).first()).toBeVisible({
    timeout: 30_000,
  });

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
  expect(inviteText).toMatch(/\/signup\?invite=[^"\s]+/);
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

test('A. More variety persists through lock and shows the athlete badge', async ({
  browser,
  page,
  coachEmail,
  clientEmail,
  clientPassword,
  cleanup,
}) => {
  const inviteUrl = await setupLockedPlanWithVariety(
    page, coachEmail, clientEmail, { ...NEW_CLIENT, email: clientEmail }, 'more'
  );
  const { clientContext, clientPage } = await claimInviteAsAthlete(
    browser, inviteUrl, clientEmail, clientPassword
  );
  try {
    const badge = clientPage.getByTestId('meal-variety-badge');
    await expect(badge).toBeVisible({ timeout: 10_000 });
    await expect(badge).toContainText('More variety');
  } finally {
    await clientContext.close();
  }
  void cleanup;
});

test('B. Traditional variety persists and the More label is absent', async ({
  browser,
  page,
  coachEmail,
  clientEmail,
  clientPassword,
  cleanup,
}) => {
  const inviteUrl = await setupLockedPlanWithVariety(
    page, coachEmail, clientEmail, { ...NEW_CLIENT, email: clientEmail }, 'traditional'
  );
  const { clientContext, clientPage } = await claimInviteAsAthlete(
    browser, inviteUrl, clientEmail, clientPassword
  );
  try {
    const badge = clientPage.getByTestId('meal-variety-badge');
    await expect(badge).toBeVisible({ timeout: 10_000 });
    await expect(badge).toContainText('Traditional variety');
    await expect(badge).not.toContainText('More variety');
  } finally {
    await clientContext.close();
  }
  void cleanup;
});

test('C. Athlete badge label contract is honest (no invented preference)', async ({
  browser,
  page,
  coachEmail,
  clientEmail,
  clientPassword,
  cleanup,
}) => {
  // The badge shows ONLY what the locked payload records. The keyless half of
  // that contract (key omitted when unknown; no badge when the key is absent)
  // is pinned by `supabasePlanService.mealVariety.test.ts` ("omits the key
  // entirely") and `ClientMyPlanPage.test.tsx` ("shows NO preference label
  // when the payload does not record one"). This case asserts the OTHER half
  // live: a `more` payload shows EXACTLY "Meal variety: More variety" — the
  // renderer never invents, appends, or substitutes a preference.
  const inviteUrl = await setupLockedPlanWithVariety(
    page, coachEmail, clientEmail, { ...NEW_CLIENT, email: clientEmail }, 'more'
  );
  const { clientContext, clientPage } = await claimInviteAsAthlete(
    browser, inviteUrl, clientEmail, clientPassword
  );
  try {
    const badge = clientPage.getByTestId('meal-variety-badge');
    await expect(badge).toBeVisible({ timeout: 10_000 });
    await expect(badge).toHaveText('Meal variety: More variety');
    await expect(clientPage.getByText('Breakfast', { exact: true }).first()).toBeVisible();
    await waitForNoSpinner(page, 5_000).catch(() => {});
  } finally {
    await clientContext.close();
  }
  void cleanup;
});