import { test as base, expect } from '@playwright/test';
import {
  deleteTestClient,
  loginAsCoach,
} from './actions';
import {
  generateCoachEmail,
  generateClientEmail,
  TEST_PASSWORD,
} from './test-data';
import { getE2eSupabaseClient } from './supabase';

export const cleanupTest = base.extend<{
  coachEmail: string;
  clientEmail: string;
  secondClientEmail: string;
  clientPassword: string;
  cleanup: { run: () => Promise<void> };
}>({
  coachEmail: async ({}, use) => {
    await use(generateCoachEmail());
  },
  clientEmail: async ({}, use) => {
    await use(generateClientEmail());
  },
  secondClientEmail: async ({}, use) => {
    await use(generateClientEmail());
  },
  clientPassword: async ({}, use) => {
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
        ).toBeVisible({ timeout: 10_000 }).catch(() => {});
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
        // eslint-disable-next-line no-console
        console.warn('[e2e cleanup] could not delete test client:', err);
      } finally {
        await ctx.close();
      }

      // SQL-level fallback: force-delete both tagged users regardless of UI outcome.
      // This is the unmovable safety net for failures that happen before the
      // soft-delete UI is reachable.
      // eslint-disable-next-line no-console
      console.log('[e2e cleanup] attempting SQL fallback for', coachEmail, 'and', clientEmail);
      const supabase = getE2eSupabaseClient() as any;
      for (const email of [coachEmail, clientEmail]) {
        try {
          // eslint-disable-next-line no-console
          console.log('[e2e cleanup] calling RPC for', email);
          const { error } = await supabase.rpc('e2e_force_delete_test_user', { p_email: email });
          // eslint-disable-next-line no-console
          console.log('[e2e cleanup] RPC result for', email, 'error:', error);
          if (error) {
            // eslint-disable-next-line no-console
            console.warn('[e2e cleanup] SQL fallback failed for', email, error);
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('[e2e cleanup] SQL fallback threw for', email, err);
        }
      }
    };
    await use({ run });
    await run();
  },
});