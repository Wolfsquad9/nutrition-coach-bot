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
import { cleanupTest } from './helpers/fixtures';

const test = cleanupTest;

test('athlete can mark meals complete with persistence', async ({
  browser,
  page: coachPage,
  coachEmail,
  clientEmail,
  cleanup,
}) => {
  const clientData = { ...NEW_CLIENT, email: clientEmail };

  // ---------- COACH SETUP: sign up → create client → generate plan → lock → invite ----------
  const inviteUrl = await setupLockedClientWithInvite(
    coachPage,
    coachEmail,
    clientEmail,
    clientData
  );

  // ---------- ATHLETE: new browser context (no shared cookies/session) ----------
  const athleteContext = await browser.newContext();
  const athletePage = await athleteContext.newPage();

  try {
    // ---------- 1. Navigate to the invite URL ----------
    await athletePage.goto(inviteUrl);
    await expect(
      athletePage.getByRole('heading', { name: 'FitPlan Pro' })
    ).toBeVisible();
    await expect(
      athletePage.getByText('Create your client account to view your plan')
    ).toBeVisible();

    // ---------- 2. Complete athlete signup ----------
    await athletePage.getByLabel('Email').fill(clientEmail);
    await athletePage.getByLabel('Password').fill(TEST_PASSWORD);
    await athletePage.getByRole('button', { name: /Sign up/i }).click();

    // ---------- 3. Assert redirect to /my-plan (client dashboard) ----------
    await athletePage.waitForURL('/my-plan', { timeout: 15_000 });

    await expect(
      athletePage.getByRole('heading', { name: 'My Plan' })
    ).toBeVisible({ timeout: 15_000 });

    // ---------- 4. Confirm the plan renders in its locked state ----------
    await expect(
      athletePage.getByText('Breakfast', { exact: true }).first()
    ).toBeVisible({ timeout: 20_000 });
    await expect(athletePage.getByText('Calories', { exact: true })).toBeVisible();

    // ---------- 5. Meal Completion: confirm initial state ----------
    // Meal completion buttons use aria-pressed; collapsible headers use aria-expanded.
    // Filter for buttons that have aria-pressed (meal completion controls).
    const breakfastButton = athletePage
      .locator('button[aria-pressed="false"]')
      .filter({ hasText: /^Breakfast$/ })
      .first();
    await expect(breakfastButton).toBeVisible();

    // ---------- 6. Mark a meal complete ----------
    await breakfastButton.click();

    // ---------- 7. Verify completion state changed ----------
    const completedButton = athletePage
      .locator('button[aria-pressed="true"]')
      .filter({ hasText: /^Breakfast$/ })
      .first();
    await expect(completedButton).toBeVisible({ timeout: 5_000 });

    // ---------- 8. Reload /my-plan and confirm completion persists ----------
    await athletePage.reload();
    await athletePage.waitForLoadState('networkidle');

    await expect(
      athletePage
        .locator('button[aria-pressed="true"]')
        .filter({ hasText: /^Breakfast$/ })
        .first()
    ).toBeVisible({ timeout: 5_000 });

    // ---------- 9. Mark the meal incomplete ----------
    await athletePage
      .locator('button[aria-pressed="true"]')
      .filter({ hasText: /^Breakfast$/ })
      .first()
      .click();

    await expect(
      athletePage
        .locator('button[aria-pressed="false"]')
        .filter({ hasText: /^Breakfast$/ })
        .first()
    ).toBeVisible({ timeout: 5_000 });

    // ---------- 10. Reload again and confirm incomplete state persists ----------
    await athletePage.reload();
    await athletePage.waitForLoadState('networkidle');

    await expect(
      athletePage
        .locator('button[aria-pressed="false"]')
        .filter({ hasText: /^Breakfast$/ })
        .first()
    ).toBeVisible({ timeout: 5_000 });
  } finally {
    await athleteContext.close();
  }
  void cleanup;
});