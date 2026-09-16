/**
 * Review Workflow — read-only / safety architectural guard (Phase 13F)
 *
 * Static guard consistent with the Phase 13C/13D/13E strategy. The workflow
 * completion wiring must not introduce any mutation beyond the EXISTING
 * Phase 13C coach-decision write path: no prescription mutation, no plan
 * generation/activation, no lock/unlock, no check-in mutation, and the queue
 * + history paths remain strictly read-only.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PAGE_PATH = resolve(process.cwd(), 'src/pages/ClientReviewPage.tsx');
const VIEW_PATH = resolve(process.cwd(), 'src/components/review/ClientReviewView.tsx');
const PANEL_PATH = resolve(process.cwd(), 'src/components/review/CoachDecisionPanel.tsx');
const CURRENT_HOOK_PATH = resolve(process.cwd(), 'src/hooks/useCurrentCoachingDecision.ts');
const HISTORY_HOOK_PATH = resolve(process.cwd(), 'src/hooks/useCoachingDecisionHistory.ts');

const WRITE_PATHS = [
  PAGE_PATH,
  VIEW_PATH,
  PANEL_PATH,
  CURRENT_HOOK_PATH,
  HISTORY_HOOK_PATH,
];

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('Review workflow completion — read/write boundary (Phase 13F)', () => {
  it('introduces no new mutation anywhere in the workflow wiring', () => {
    for (const path of WRITE_PATHS) {
      const src = read(path);
      expect(src).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(|supabase\.rpc\(/);
      expect(src).not.toContain('record_coaching_decision'); // via service only
    }
  });

  it('never mutates the prescription, plans, or check-ins', () => {
    for (const path of WRITE_PATHS) {
      const src = read(path);
      expect(src).not.toContain('lock_nutrition_plan');
      expect(src).not.toContain('unlock_nutrition_plan');
      expect(src).not.toContain('generate_nutrition_plan');
      expect(src).not.toContain('activate_nutrition_plan');
      expect(src).not.toContain('buildLockedPlanPayload');
      expect(src).not.toContain("from('nutrition_plans')");
      expect(src).not.toContain("from('plan_versions')");
      expect(src).not.toContain("from('daily_checkins')");
      expect(src).not.toContain("from('weekly_reviews')");
    }
  });

  it('derives the current decision FROM PERSISTENCE, never from local UI state', () => {
    const hook = read(CURRENT_HOOK_PATH);
    expect(hook).toContain('fetchLatestCoachingDecision');
    expect(hook).not.toContain('localStorage');
    expect(hook).not.toContain('sessionStorage');
    // Historical decisions never satisfy the current review: the persisted
    // decision_date must equal today.
    expect(hook).toContain('persisted.decisionDate === todayIso(now())');
  });

  it('records decisions exclusively through the existing Phase 13C hook path', () => {
    const page = read(PAGE_PATH);
    expect(page).toContain('useCoachingDecision');
    expect(page).toContain('recording.recordDecision');
    // The page only reconciles/wires state; it never implements persistence.
    expect(page).not.toContain('supabase');
  });

  it('reconciles the queue only through refetch of the existing read model', () => {
    const page = read(PAGE_PATH);
    // The queue page (Phase 13E) refetches on mount; no shared mutable store,
    // no polling, no subscriptions were introduced.
    const queuePage = read(resolve(process.cwd(), 'src/pages/ReviewQueuePage.tsx'));
    const queueHook = read(resolve(process.cwd(), 'src/hooks/useReviewQueue.ts'));
    expect(queueHook).toContain('useEffect');
    expect(queueHook).not.toContain('setInterval');
    expect(queueHook).not.toContain('addEventListener');
    expect(page).not.toContain('localStorage');
    expect(queuePage).not.toContain('localStorage');
  });

  it('nutrition engine and adaptation logic are untouched by the workflow', () => {
    for (const path of WRITE_PATHS) {
      const src = read(path);
      expect(src).not.toContain('resolveAdaptedTarget');
      expect(src).not.toContain('decideAdaptation');
      expect(src).not.toContain('calculateProfile');
      expect(src).not.toContain('reconcileTarget');
    }
  });
});
