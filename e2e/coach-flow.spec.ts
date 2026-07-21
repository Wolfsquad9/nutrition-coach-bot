import { test as base, expect } from '@playwright/test';
import {
  signUpAsCoach,
  createClient,
  deleteTestClient,
  waitForNoSpinner,
  preferFirstNIngredients,
  loginAsCoach,
} from './helpers/actions';
import {
  generateCoachEmail,
  generateClientEmail,
  TEST_PASSWORD,
  NEW_CLIENT,
} from './helpers/test-data';

/**
 * Fixture: produces the tagged emails in setup, exposes them to the test,
 * and runs UI-driven cleanup in teardown (always — even on failure).
 *
 * The `cleanup` fixture teardown re-logs-in as the tagged coach and drives
 * the soft-delete UI for the tagged client. If re-login itself fails (e.g.
 * the signup step never created a user), teardown logs a warning and moves
 * on — the original test failure is the one that matters.
 */
const test = base.extend<{
  coachEmail: string;
  clientEmail: string;
  cleanup: { run: () => Promise<void> };
}>({
  coachEmail: async ({}, use) => {
    await use(generateCoachEmail());
  },
  clientEmail: async ({}, use) => {
    await use(generateClientEmail());
  },
  cleanup: async ({ browser, coachEmail, clientEmail }, use) => {
    let ran = false;
    const run = async () => {
      if (ran) return; // idempotent — fixtures are torn down once
      ran = true;
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      try {
        await loginAsCoach(page, coachEmail, TEST_PASSWORD);
        await page.getByRole('tab', { name: 'Client' }).click();
        await page.waitForURL(
          /^http:\/\/localhost:8080\/clients\/[^/]+$/,
          { timeout: 10_000 }
        );
        await deleteTestClient(page);
      } catch (err) {
        // Cleanup must never mask the original test failure.
        // eslint-disable-next-line no-console
        console.warn('[e2e cleanup] could not delete test client:', err);
      } finally {
        await ctx.close();
      }
    };
    await use({ run });
    // Teardown: runs after the test body exits, whether it passed, failed, or threw.
    await run();
  },
});

test('coach completes full client lifecycle', async ({
  page,
  coachEmail,
  clientEmail,
  cleanup,
}) => {
  const clientData = { ...NEW_CLIENT, email: clientEmail };

  // ---------- 1. Sign up as coach ----------
  await signUpAsCoach(page, coachEmail, TEST_PASSWORD);

  // ---------- 2. Create a new client ----------
  await createClient(page, clientData);

  // ---------- 3. Generate complete plan ----------
  await page.getByRole('button', { name: /Generate complete plan/i }).click();
  // The PDF/JSON download buttons appear once the plan exists.
  await expect(
    page.getByRole('button', { name: /^PDF$/i })
  ).toBeVisible({ timeout: 30_000 });

  // ---------- 4. Ingredients tab — prefer 5, then generate ----------
  await page.getByRole('tab', { name: 'Ingredients' }).click();
  await page.waitForURL(/\/ingredients$/);
  await expect(
    page.getByRole('heading', { name: 'Ingredient Manager' })
  ).toBeVisible();
  await preferFirstNIngredients(page, 5);
  await page.getByRole('button', { name: /Generate Full Plan/i }).click();
  // The Generated Plans section appears on success.
  await expect(
    page.getByRole('heading', { name: 'Generated Plans' })
  ).toBeVisible({ timeout: 30_000 });

  // ---------- 5. Nutrition tab — generate weekly plan ----------
  await page.getByRole('tab', { name: 'Nutrition' }).click();
  await page.waitForURL(/\/nutrition$/);
  await expect(
    page.getByRole('heading', { name: /Meal Plan Generation/i })
  ).toBeVisible();
  await page
    .getByRole('button', { name: /^(Weekly Plan|Regenerate)$/i })
    .click();
  // WeeklyMealPlanDisplay renders meal rows (Breakfast, Lunch, Dinner, Snack).
  await expect(
    page.getByText('Breakfast', { exact: true }).first()
  ).toBeVisible({ timeout: 30_000 });

  // ---------- 6. Lock the plan ----------
  await page.getByRole('button', { name: /^Lock Plan$/i }).click();
  await expect(
    page.getByRole('heading', { name: 'Confirm lock' })
  ).toBeVisible();
  await page.getByRole('button', { name: /Confirm lock/i }).click();
  // PlanStateIndicator badge format: "Locked (Nd)".
  await expect(page.getByText(/^Locked \(\d+d\)$/i)).toBeVisible({
    timeout: 10_000,
  });

  // ---------- 7. Check-in tab — must not hang ----------
  await page.getByRole('tab', { name: 'Check-in' }).click();
  await page.waitForURL(/\/checkin$/);
  await expect(
    page.getByRole('heading', { name: 'Check-in & Follow-up' })
  ).toBeVisible();
  // Critical: spinner must clear within 5s. The default subtab is "Daily Check-in".
  await waitForNoSpinner(page, 5_000);
  await expect(
    page.getByRole('tab', { name: 'Daily Check-in' })
  ).toBeVisible();

  // ---------- 8. Training tab — plan is shown ----------
  await page.getByRole('tab', { name: 'Training' }).click();
  await page.waitForURL(/\/training$/);
  await expect(
    page.getByRole('heading', { name: 'Plan d’Entraînement' })
  ).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Programme Hebdomadaire')).toBeVisible();

  // ---------- 9. Progress tab — loads ----------
  await page.getByRole('tab', { name: 'Progress' }).click();
  await page.waitForURL(/\/progress$/);
  await expect(
    page.getByRole('heading', { name: 'Progress Tracking' })
  ).toBeVisible();
  // "Loading progress…" (single Unicode ellipsis) → "Track X's journey" or empty-state text.
  await waitForNoSpinner(page, 5_000);
  await expect(
    page.getByText(
      /^Track .*'s journey$|No progress entries yet/i
    )
  ).toBeVisible({ timeout: 10_000 });

  // ---------- 10. Invite Client ----------
  await page.getByRole('tab', { name: 'Client' }).click();
  await page.waitForURL(/^http:\/\/localhost:8080\/clients\/[^/]+$/);
  await expect(
    page.getByRole('heading', { name: /^Client: /i })
  ).toBeVisible();
  await page.getByRole('button', { name: /Invite Client/i }).click();
  await expect(
    page.getByRole('heading', { name: 'Invitation created' })
  ).toBeVisible({ timeout: 15_000 });
  // The link is rendered in a div with .font-mono and contains /signup?invite=.
  const inviteLink = page
    .locator('div.font-mono')
    .filter({ hasText: /\/signup\?invite=/ });
  await expect(inviteLink).toBeVisible();
  const inviteText = await inviteLink.textContent();
  expect(inviteText).toMatch(/\/signup\?invite=[^"\s]+/);

  // Close the dialog so the Logout button is reachable.
  await page.keyboard.press('Escape');

  // ---------- 11. Log out, verify redirect ----------
  await page.getByRole('button', { name: /^Logout$/i }).click();
  await page.waitForURL(/\/login$/, { timeout: 5_000 });
  await expect(page.getByRole('heading', { name: 'FitPlan Pro' })).toBeVisible();

  // Cleanup is handled by the `cleanup` fixture teardown (runs whether the
  // test passed, failed, or threw). Reference `cleanup` so the fixture
  // isn't tree-shaken by an aggressive linter.
  void cleanup;
});
