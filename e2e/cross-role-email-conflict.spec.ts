import { test as base, expect } from '@playwright/test';
import {
  loginAsCoach,
  setupLockedClientWithInvite,
  signUpAsCoach,
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
 * cleanup) as coach-flow.spec.ts and client-invite-flow.spec.ts.
 */
const test = base.extend<{
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
        ).toBeVisible({ timeout: 10_000 }).catch(() => {
          // If no client exists (e.g. test failed before creation), it's fine.
        });
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
    };
    await use({ run });
    // Teardown: runs after the test body exits, regardless of pass/fail.
    await run();
  },
});

// ---------------------------------------------------------------------------
// Test 1: coach signup rejected when email already used by a client
// ---------------------------------------------------------------------------
test('coach signup rejected when email already used by a client', async ({
  browser,
  page: coachPage,
  coachEmail,
  clientEmail,
  clientPassword,
  cleanup,
}) => {
  const clientData = { ...NEW_CLIENT, email: clientEmail };

  // ---------- COACH SETUP: create a client and invite them ----------
  const inviteUrl = await setupLockedClientWithInvite(
    coachPage,
    coachEmail,
    clientEmail,
    clientData
  );

  // ---------- CLIENT: accept the invite (creates a client account with this email) ----------
  const clientContext = await browser.newContext();
  const clientPage = await clientContext.newPage();

  try {
    await clientPage.goto(inviteUrl);
    await expect(
      clientPage.getByRole('heading', { name: 'FitPlan Pro' })
    ).toBeVisible();
    await clientPage.getByLabel('Email').fill(clientEmail);
    await clientPage.getByLabel('Password').fill(clientPassword);
    await clientPage.getByRole('button', { name: /Sign up/i }).click();
    await clientPage.waitForURL('/my-plan', { timeout: 15_000 });
    await expect(
      clientPage.getByRole('heading', { name: 'My Plan' })
    ).toBeVisible({ timeout: 15_000 });
  } finally {
    await clientContext.close();
  }

  // ---------- ATTEMPT COACH SIGNUP WITH THE SAME EMAIL ----------
  // Open a fresh context (no session) and try to sign up as a coach
  // using the email that is now a client account.
  const freshContext = await browser.newContext();
  const freshPage = await freshContext.newPage();

  try {
    await freshPage.goto('/signup');
    await expect(
      freshPage.getByRole('heading', { name: 'FitPlan Pro' })
    ).toBeVisible();

    // The signup page should show "Create your coach account" (no invite param)
    await expect(
      freshPage.getByText('Create your coach account')
    ).toBeVisible();

    await freshPage.getByLabel('Email').fill(clientEmail);
    await freshPage.getByLabel('Password').fill(TEST_PASSWORD);
    await freshPage.getByRole('button', { name: /Sign up/i }).click();

    // Assert the error toast appears with the specific conflict message
    await expect(
      freshPage.getByText('This email is already registered as a client account').first()
    ).toBeVisible({ timeout: 10_000 });

    // Assert we are still on the signup page (not redirected to a dashboard)
    await expect(
      freshPage.getByRole('heading', { name: 'FitPlan Pro' }).first()
    ).toBeVisible();
    await expect(
      freshPage.getByText('Create your coach account')
    ).toBeVisible();
  } finally {
    await freshContext.close();
  }

  // Cleanup is handled by the `cleanup` fixture teardown.
  void cleanup;
});

// ---------------------------------------------------------------------------
// Test 2: client invite claim rejected when email already used by a coach
// ---------------------------------------------------------------------------
test('client invite claim rejected when email already used by a coach', async ({
  browser,
  page: coachPage,
  coachEmail,
  clientEmail,
  secondClientEmail,
  clientPassword,
  cleanup,
}) => {
  const clientData = { ...NEW_CLIENT, email: clientEmail };

  // ---------- COACH SETUP: create a client and invite them ----------
  const inviteUrl = await setupLockedClientWithInvite(
    coachPage,
    coachEmail,
    clientEmail,
    clientData
  );

  // ---------- ATTEMPT TO CLAIM THE INVITE USING THE COACH'S OWN EMAIL ----------
  // The coach is already signed in on coachPage. We need a fresh context
  // to sign up as a new user using the coach's email.
  const freshContext = await browser.newContext();
  const freshPage = await freshContext.newPage();

  try {
    await freshPage.goto(inviteUrl);
    await expect(
      freshPage.getByRole('heading', { name: 'FitPlan Pro' })
    ).toBeVisible();

    // The invite signup page shows a tailored subtitle.
    await expect(
      freshPage.getByText('Create your client account to view your plan')
    ).toBeVisible();

    // Sign up using the coach's email (which already exists as a trainer)
    await freshPage.getByLabel('Email').fill(coachEmail);
    await freshPage.getByLabel('Password').fill(TEST_PASSWORD);
    await freshPage.getByRole('button', { name: /Sign up/i }).click();

    // The claim_client_invitation RPC should reject with the conflict error.
    // The error is surfaced as a toast: "Account created" with the error description.
    await expect(
      freshPage.getByText('This email is already registered as a coach account').first()
    ).toBeVisible({ timeout: 10_000 });

    // Assert we are still on the signup page (the invite was NOT consumed)
    await expect(
      freshPage.getByRole('heading', { name: 'FitPlan Pro' }).first()
    ).toBeVisible();
    await expect(
      freshPage.getByText('Create your client account to view your plan')
    ).toBeVisible();

    // ---------- VERIFY THE INVITE IS STILL VALID: claim with a different email ----------
    // Sign out first
    // Since the signup may have created an auth.users row but the claim failed,
    // we need a completely fresh context for the second attempt.
  } finally {
    await freshContext.close();
  }

  // Now try with a completely different, unused email to prove the invite
  // token was not consumed by the failed attempt.
  const secondContext = await browser.newContext();
  const secondPage = await secondContext.newPage();

  try {
    await secondPage.goto(inviteUrl);
    await expect(
      secondPage.getByRole('heading', { name: 'FitPlan Pro' })
    ).toBeVisible();
    await expect(
      secondPage.getByText('Create your client account to view your plan')
    ).toBeVisible();

    await secondPage.getByLabel('Email').fill(secondClientEmail);
    await secondPage.getByLabel('Password').fill(clientPassword);
    await secondPage.getByRole('button', { name: /Sign up/i }).click();

    // This should succeed — the invite was not consumed by the failed attempt.
    await secondPage.waitForURL('/my-plan', { timeout: 15_000 });
    await expect(
      secondPage.getByRole('heading', { name: 'My Plan' })
    ).toBeVisible({ timeout: 15_000 });

    // Verify the plan content is visible (invite claim succeeded)
    await expect(
      secondPage.getByText('Breakfast', { exact: true }).first()
    ).toBeVisible({ timeout: 20_000 });
  } finally {
    await secondContext.close();
  }

  // Cleanup is handled by the `cleanup` fixture teardown.
  void cleanup;
});