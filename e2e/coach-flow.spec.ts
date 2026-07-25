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
        // SPA: clicking the tab may not change the URL if already on the
        // client detail page. Wait for the heading that confirms the client
        // detail view is rendered, rather than waitForURL.
        await expect(
          page.getByRole('heading', { name: /^Client: /i })
        ).toBeVisible({ timeout: 10_000 }).catch(() => {
          // If no client exists (e.g. test failed before creation), the
          // heading won't appear — that's fine, deleteTestClient handles it.
        });
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
