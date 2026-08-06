import { test as base, expect } from '@playwright/test';
import { cleanupTest } from './helpers/fixtures';

const test = cleanupTest;

test('cleanup fallback handles missing client gracefully', async ({
  page,
  coachEmail,
  clientEmail,
  cleanup,
}) => {
  // This test verifies that the cleanup fixture handles the case where
  // no client exists (e.g., test failed before creation) without throwing.
  // We don't create any client here — we just reference cleanup to ensure
  // the teardown runs and handles the missing client gracefully.
  void cleanup;

  // Minimal test body — navigate to a valid page so the test passes.
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'FitPlan Pro' })).toBeVisible();
});
