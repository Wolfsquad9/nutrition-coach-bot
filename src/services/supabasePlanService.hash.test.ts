/**
 * Phase 10 — P2: payload hash integrity.
 *
 * `hashPlanPayload` is a deterministic deduplication identifier (not a
 * tamper-proof digest). The meaningful invariant is that the payload<->hash
 * relationship is pinned in the authoritative persistence path: a serialized
 * payload ALWAYS hashes to the same value, and a different payload hashes
 * differently (so the stored hash can be trusted to fingerprint the payload).
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}));

import { hashPlanPayload, type PlanPayload } from './supabasePlanService';

function samplePayload(overrides: Partial<PlanPayload> = {}): PlanPayload {
  return {
    type: 'nutrition',
    generatedAt: '2026-01-01T00:00:00.000Z',
    lockedAt: '2026-01-01T00:00:00.000Z',
    macroTargets: { calories: 2209, protein: 160, carbs: 284, fat: 48 },
    weeklyPlan: { days: [], weeklyTotalMacros: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }, weeklyTargetMacros: { calories: 0, protein: 0, carbs: 0, fat: 0 }, weeklyVariance: { calories: 0, protein: 0, carbs: 0, fat: 0 } } as unknown as PlanPayload['weeklyPlan'],
    likedIngredients: ['chicken-breast'],
    ...overrides,
  };
}

describe('hashPlanPayload — deterministic payload fingerprint', () => {
  it('is deterministic for the identical payload', () => {
    const payload = samplePayload();
    expect(hashPlanPayload(payload)).toBe(hashPlanPayload(payload));
    // A JSON round-trip (what is actually sent to the RPC) hashes identically.
    const serialized = JSON.parse(JSON.stringify(payload)) as PlanPayload;
    expect(hashPlanPayload(serialized)).toBe(hashPlanPayload(payload));
  });

  it('differs when the payload content changes', () => {
    const a = samplePayload();
    const b = samplePayload({ macroTargets: { calories: 2210, protein: 160, carbs: 284, fat: 48 } });
    expect(hashPlanPayload(a)).not.toBe(hashPlanPayload(b));
  });

  it('produced a stable non-empty fingerprint', () => {
    expect(typeof hashPlanPayload(samplePayload())).toBe('string');
    expect(hashPlanPayload(samplePayload()).length).toBeGreaterThan(0);
  });
});