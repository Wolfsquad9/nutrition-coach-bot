import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

// Load `.env` FIRST so canonical project config (URLs + anon/publishable
// keys) takes precedence. Then supplement with local-only secrets from
// `.env.local` (e.g. SUPABASE_SERVICE_ROLE_KEY, Postgres creds). dotenv
// never overrides variables it has already set, so no precedence mismatch
// can occur — `.env` is authoritative for the Supabase project identity.
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

// Load `.env.test.local` only when MEAL_VARIETY_E2E=1 so the
// meal-variety E2E suite targets the local Supabase stack. Without the
// flag the normal `.env` + `.env.local` config is left intact for all
// other tests and dev runs.
if (process.env.MEAL_VARIETY_E2E === '1') {
  dotenv.config({ path: '.env.test.local', override: true });
}

/**
 * Playwright E2E config for the coach flow.
 *
 * Single chromium project, single worker, single test file. The dev server
 * is auto-started (or reused if already on :8080) so a single
 * `npm run test:e2e` works either way.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // one coach sign-up per run, no parallel races
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
  ],
  timeout: 120_000, // 2 min per test (Supabase round-trips)
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://localhost:8080',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:8080',
    timeout: 60_000,
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore', // Vite's HMR banner is noisy
    stderr: 'pipe',
  },
});
