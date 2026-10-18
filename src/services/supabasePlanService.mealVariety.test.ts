/**
 * Meal variety — locked plan payload contract.
 *
 * The persisted `mealVariety` key is the ONLY honest source for the athlete's
 * preference label. These tests pin both directions:
 *  - provided → the key survives into the JSON that reaches `plan_payload`;
 *  - absent   → the key is ABSENT, so no consumer can show a label the
 *    persisted plan does not record (legacy payloads included).
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { buildLockedPlanPayload, type PlanPayload } from './supabasePlanService';
import type { WeeklyMealPlanResult, MealVarietyPreference } from '@/services/recipeService';

const EMPTY_PLAN: WeeklyMealPlanResult = {
  days: [],
  weeklyTotalMacros: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
  weeklyTargetMacros: { calories: 0, protein: 0, carbs: 0, fat: 0 },
  weeklyVariance: { calories: 0, protein: 0, carbs: 0, fat: 0 },
};

const baseInput = {
  lockedAt: new Date('2026-10-18T10:00:00.000Z'),
  weeklyPlan: EMPTY_PLAN,
  macroTargets: { calories: 2000, protein: 150, carbs: 200, fat: 70 },
  likedIngredients: ['oats', 'banana'],
};

const roundTrip = (payload: PlanPayload): PlanPayload =>
  JSON.parse(JSON.stringify(payload)) as PlanPayload;

describe('buildLockedPlanPayload — mealVariety persistence', () => {
  it.each<MealVarietyPreference>(['more', 'traditional'])(
    'persists mealVariety=%s through the JSON round-trip that reaches plan_payload',
    (preference) => {
      const payload = buildLockedPlanPayload({ ...baseInput, mealVariety: preference });
      expect(payload.mealVariety).toBe(preference);
      expect(roundTrip(payload).mealVariety).toBe(preference);
    },
  );

  it('omits the key entirely when the preference is unknown (no invented label)', () => {
    const payload = buildLockedPlanPayload(baseInput);
    expect('mealVariety' in payload).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(roundTrip(payload), 'mealVariety')).toBe(false);
  });
});
