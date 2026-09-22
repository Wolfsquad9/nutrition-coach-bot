/**
 * Decision History — read-only architectural guard (Phase 13D)
 *
 * Static/architectural guard consistent with the Phase 13C read-only strategy
 * (coachingDecisionPersistence.test.ts): proves the ENTIRE history read path —
 * service read method, hook and presentation — contains no write operation,
 * no prescription mutation, no plan generation/activation and no lock/unlock
 * behavior. History reads ONLY `coaching_decisions`.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SERVICE_PATH = resolve(process.cwd(), 'src/services/review/coachingDecisionService.ts');
const HOOK_PATH = resolve(process.cwd(), 'src/hooks/useCoachingDecisionHistory.ts');
const COMPONENT_PATH = resolve(process.cwd(), 'src/components/review/DecisionHistory.tsx');
const VIEW_PATH = resolve(process.cwd(), 'src/components/review/ClientReviewView.tsx');
const PAGE_PATH = resolve(process.cwd(), 'src/pages/ClientReviewPage.tsx');

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

/** The history-specific portion of the service (from the history section). */
function historyServiceSection(src: string): string {
  const marker = '// READ (decision history — newest-first, read-only)';
  const start = src.indexOf(marker);
  expect(start).toBeGreaterThan(-1);
  const end = src.indexOf('// MAPPERS', start);
  return src.slice(start, end);
}

describe('Decision History — read-only invariant (Phase 13D)', () => {
  it('history read path performs no insert / update / delete / upsert', () => {
    const section = historyServiceSection(read(SERVICE_PATH));
    expect(section).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
    expect(section).not.toContain('rpc(');
  });

  it('history is sourced ONLY from coaching_decisions', () => {
    const section = historyServiceSection(read(SERVICE_PATH));
    expect(section).toContain("'coaching_decisions'");
    expect(section).not.toMatch(/'nutrition_plans'|'plan_versions'|'diet_logs'|'checkins'/);
    expect(section).toContain(".order('decision_date', { ascending: false })");
  });

  it('history is client-scoped', () => {
    const section = historyServiceSection(read(SERVICE_PATH));
    expect(section).toContain(".eq('client_id', clientId)");
  });

  it('hook and presentation never mutate anything', () => {
    for (const path of [HOOK_PATH, COMPONENT_PATH, VIEW_PATH, PAGE_PATH]) {
      const src = read(path);
      expect(src).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(|supabase\.rpc\(/);
      expect(src).not.toContain('lock_nutrition_plan');
      expect(src).not.toContain('unlock_nutrition_plan');
      expect(src).not.toContain('generate_nutrition_plan');
      expect(src).not.toContain('activate_nutrition_plan');
    }
  });

  it('the history hook does not derive history from current review/prescription state', () => {
    const src = read(HOOK_PATH);
    expect(src).not.toContain('useClientReview');
    expect(src).not.toContain('useNutritionPlanState');
    expect(src).not.toContain('buildReviewState');
    expect(src).toContain('fetchCoachingDecisionHistory');
  });
});
