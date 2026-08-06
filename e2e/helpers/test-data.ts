/**
 * Test data builders and constants for the E2E coach flow.
 *
 * Every test artifact is tagged with the `e2e-test-` prefix so cleanup
 * queries can target only this test's data, never a real client/user.
 */

export function uniqueTag(): string {
  // Example: 2026-07-20T18-42-11-739Z
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export function generateCoachEmail(): string {
  return `e2e-test-coach-${uniqueTag()}@example.com`;
}

export function generateClientEmail(): string {
  return `e2e-test-client-${uniqueTag()}@example.com`;
}

export const TEST_PASSWORD = 'E2eTest!Passw0rd-2026';

export interface NewClientInput {
  firstName: string;
  lastName: string;
  email: string;
  birthDate: string;
  weight: string;
  height: string;
  trainingDays: string;
}

// All fields filled in by the test, EXCEPT email — callers must supply
// a tagged email via generateClientEmail() so the cleanup fixture can
// target it.
export const NEW_CLIENT: Omit<NewClientInput, 'email'> = {
  firstName: 'E2E',
  lastName: 'Client',
  birthDate: '1995-06-15',
  weight: '75',
  height: '175',
  trainingDays: '4',
};
