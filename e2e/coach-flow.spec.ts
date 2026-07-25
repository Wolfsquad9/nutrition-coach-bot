import { test as base, expect } from '@playwright/test';
import {
  deleteTestClient,
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

test('coach completes full client lifecycle', async ({
  page,
  coachEmail,
  clientEmail,
  cleanup,
}) => {
  const clientData = { ...NEW_CLIENT, email: clientEmail };

  // Steps 1–10: delegate to the shared helper so the setup logic lives in one place.
  await setupLockedClientWithInvite(page, coachEmail, clientEmail, clientData);

  // ---------- 11. Log out, verify redirect ----------
  await page.getByRole('button', { name: /^Logout$/i }).click();
  await page.waitForURL(/\/login$/, { timeout: 5_000 });
  await expect(page.getByRole('heading', { name: 'FitPlan Pro' })).toBeVisible();

  // Cleanup is handled by the `cleanup` fixture teardown (runs whether the
  // test passed, failed, or threw). Reference `cleanup` so the fixture
  // isn't tree-shaken by an aggressive linter.
  void cleanup;
});
