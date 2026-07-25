import { test as base, expect } from '@playwright/test';
import {
  loginAsCoach,
  setupLockedClientWithInvite,
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
 * Reuses the same fixture pattern (test.extend, coachEmail, clientEmail,
 * cleanup) as coach-flow.spec.ts.
 */
const test = base.extend<{
  coachEmail: string;
  clientEmail: string;
  clientPassword: string;
  cleanup: { run: () => Promise<void> };
}>({
  coachEmail: async ({}, use) => {
    await use(generateCoachEmail());
  },
  clientEmail: async ({}, use) => {
    await use(generateClientEmail());
  },
  clientPassword: async ({}, use) => {
    // Use the same globally defined test password for simplicity.
    await use(TEST_PASSWORD);
  },
  cleanup: async ({ browser, coachEmail, clientEmail }, use) => {
    let ran = false;
    const run = async () => {
      if (ran) return;
      ran = true;
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      try {
        await loginAsCoach(page, coachEmail, TEST_PASSWORD);
        await page.getByRole('tab', { name: 'Client' }).click();
        await expect(
          page.getByRole('heading', { name: /^Client: /i })
        ).toBeVisible({ timeout: 10_000 }).catch(() => {
          // If no client exists (e.g. test failed before creation), it's fine.
        });
        // Use deleteTestClient via the imported helper — it bails if no client.
        const deleteButton = page.getByRole('button', { name: /^Delete$/i });
        if (await deleteButton.isVisible().catch(() => false)) {
          await deleteButton.click();
          await expect(
            page.getByRole('heading', { name: 'Delete client' })
          ).toBeVisible();
          await page.getByRole('button', { name: /Delete client/i }).click();
          await expect(
            page.getByRole('heading', { name: 'No clients' })
          ).toBeVisible({ timeout: 10_000 }).catch(() => {});
        }
      } catch (err) {
        // Cleanup must never mask the original test failure.
        // eslint-disable-next-line no-console
        console.warn('[e2e cleanup] could not delete test client:', err);
      } finally {
        await ctx.close();
      }
    };
    await use({ run });
    // Teardown: runs after the test body exits, regardless of pass/fail.
    await run();
  },
});

test('client accepts invite and views locked plan', async ({
  browser,
  page: coachPage,
  coachEmail,
  clientEmail,
  clientPassword,
  cleanup,
}) => {
  const clientData = { ...NEW_CLIENT, email: clientEmail };
  const invitedClientPassword = clientPassword;

  // ---------- COACH SETUP: sign up → create client → generate plan → lock → invite ----------
  const inviteUrl = await setupLockedClientWithInvite(
    coachPage,
    coachEmail,
    clientEmail,
    clientData
  );

  // ---------- CLIENT: new browser context (no shared cookies/session) ----------
  const clientContext = await browser.newContext();
  const clientPage = await clientContext.newPage();

  try {
    // ---------- 1. Navigate to the invite URL ----------
    await clientPage.goto(inviteUrl);
    await expect(
      clientPage.getByRole('heading', { name: 'FitPlan Pro' })
    ).toBeVisible();
    // The invite signup page shows a tailored subtitle.
    await expect(
      clientPage.getByText('Create your client account to view your plan')
    ).toBeVisible();

    // ---------- 2. Complete client signup ----------
    await clientPage.getByLabel('Email').fill(clientEmail);
    await clientPage.getByLabel('Password').fill(invitedClientPassword);
    await clientPage.getByRole('button', { name: /Sign up/i }).click();

    // ---------- 3. Assert redirect to /my-plan (client dashboard) ----------
    await clientPage.waitForURL('/my-plan', { timeout: 15_000 });

    // Assert the client dashboard heading "My Plan" is visible.
    // This is the client heading, NOT "Client: <name>" which is the coach view.
    await expect(
      clientPage.getByRole('heading', { name: 'My Plan' })
    ).toBeVisible({ timeout: 15_000 });

    // ---------- 4. Confirm the plan renders in its locked state ----------
    // The client view does not show PlanStateIndicator (that is coach-only in
    // NutritionTabContent). Instead, the locked plan data is fetched from the
    // database and rendered via WeeklyMealPlanDisplay. The presence of meal
    // content (Breakfast, Lunch, Dinner, Snack) is the evidence that a locked
    // plan was successfully loaded and displayed — the "No plan found" error
    // state would show "No plan available yet." or "No plan found".
    await expect(
      clientPage.getByText('Breakfast', { exact: true }).first()
    ).toBeVisible({ timeout: 20_000 });

    // Verify macro targets are visible (they render when plan.macroTargets exists).
    // Use exact match to avoid matching "Calories/week" in WeeklyMealPlanDisplay.
    await expect(clientPage.getByText('Calories', { exact: true })).toBeVisible();

    // Verify that the No-plan error messages are NOT shown.
    await expect(clientPage.getByText('No plan available yet.')).not.toBeVisible();
    await expect(
      clientPage.getByText('Your coach has not yet created a plan for you.')
    ).not.toBeVisible();

    // ---------- 5. Grocery list draft-state check ----------
    // ClientMyPlanPage does NOT render GroceryListDisplay — that component
    // exists only in the coach-facing NutritionTabContent. Assert its absence
    // explicitly so this check is not silently skipped.
    await expect(clientPage.getByText('Grocery List')).not.toBeVisible();

    // ---------- 6. Log out as client, assert redirect to /login ----------
    // ClientLayout renders a Logout button in the header.
    await clientPage.getByRole('button', { name: /Logout/i }).click();
    await clientPage.waitForURL('/login', { timeout: 10_000 });
    await expect(
      clientPage.getByRole('heading', { name: 'FitPlan Pro' })
    ).toBeVisible();
  } finally {
    // Close the client-only context.
    await clientContext.close();
  }

  // Cleanup is handled by the `cleanup` fixture teardown (runs whether the
  // test passed, failed, or threw). Reference `cleanup` so the fixture
  // isn't tree-shaken by an aggressive linter.
  void cleanup;
});