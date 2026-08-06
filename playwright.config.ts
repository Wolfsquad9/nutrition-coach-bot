import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
dotenv.config();

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
