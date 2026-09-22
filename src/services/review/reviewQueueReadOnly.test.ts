/**
 * Review Queue — read-only architectural guard (Phase 13E)
 *
 * Static/architectural guard consistent with the Phase 13C/13D strategy: the
 * ENTIRE queue path (service, hook, presentation, page) performs no writes,
 * invokes no decision-recording RPC, and mutates nothing — coaching decisions,
 * nutrition plans, prescriptions, check-ins or review state.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SERVICE_PATH = resolve(process.cwd(), 'src/services/review/reviewQueueService.ts');
const HOOK_PATH = resolve(process.cwd(), 'src/hooks/useReviewQueue.ts');
const COMPONENT_PATH = resolve(process.cwd(), 'src/components/review/ReviewQueue.tsx');
const PAGE_PATH = resolve(process.cwd(), 'src/pages/ReviewQueuePage.tsx');

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

const FORBIDDEN_WRITE_PATTERNS =
  /\.insert\(|\.update\(|\.delete\(|\.upsert\(|supabase\.rpc\(|record_coaching_decision/;

describe('Review Queue — read-only invariant (Phase 13E)', () => {
  it('performs no insert / update / delete / upsert anywhere in the queue path', () => {
    for (const path of [SERVICE_PATH, HOOK_PATH, COMPONENT_PATH, PAGE_PATH]) {
      expect(read(path)).not.toMatch(FORBIDDEN_WRITE_PATTERNS);
    }
  });

  it('does not generate, activate, lock or unlock plans; no prescription mutation', () => {
    for (const path of [SERVICE_PATH, HOOK_PATH, COMPONENT_PATH, PAGE_PATH]) {
      const src = read(path);
      expect(src).not.toContain('lock_nutrition_plan');
      expect(src).not.toContain('unlock_nutrition_plan');
      expect(src).not.toContain('generate_nutrition_plan');
      expect(src).not.toContain('activate_nutrition_plan');
      expect(src).not.toContain('buildLockedPlanPayload');
    }
  });

  it('reads decisions ONLY from coaching_decisions, scoped to the current date', () => {
    const src = read(SERVICE_PATH);
    expect(src).toContain("'coaching_decisions'");
    expect(src).toContain(".eq('decision_date', decisionDate)");
    // No historical reconstruction: no full-history select ordered by date.
    expect(src).not.toMatch(/select\('\*'\)/);
    expect(src).not.toMatch(/'nutrition_plans'|'plan_versions'|'daily_checkins'|'weekly_reviews'/);
  });

  it('reuses the existing review model instead of duplicating review logic', () => {
    const src = read(SERVICE_PATH);
    expect(src).toContain('buildReviewState');
    expect(src).not.toContain('resolveAdaptedTarget('); // delegated, not re-invoked
    expect(src).not.toContain('decideAdaptation');
    expect(src).not.toContain('calculateProfile');
  });

  it('receives the already-authorized client list (no client-id access bypass)', () => {
    const src = read(SERVICE_PATH);
    // The service never queries the clients table itself; callers pass the
    // existing RLS-scoped client list from the AppLayout context.
    expect(src).not.toMatch(/from\('clients'\)/);
    expect(src).not.toContain('getCurrentUserId');
  });

  it('queues entries project no nutrition values (no second coaching engine)', () => {
    const hook = read(HOOK_PATH);
    const component = read(COMPONENT_PATH);
    for (const src of [hook, component]) {
      expect(src).not.toContain('targetCalories');
      expect(src).not.toContain('calorieAdjustment');
      expect(src).not.toContain('adherenceScore');
    }
  });
});
