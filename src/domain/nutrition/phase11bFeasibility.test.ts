/**
 * Phase 11B — F-04 regression tests: feasibility / effective-rate integrity.
 *
 * The engine has two distinct concepts that must never be silently conflated:
 *   1. the REQUESTED/Prescribed weekly rate (what the client asked to target)
 *   2. the FEASIBLE target (what the engine can actually produce after the
 *      canonical minimum/maximum/feasibility constraints)
 *
 * When the absolute target floor (800 kcal) or cap (12000 kcal) is the binding
 * constraint, the resulting target can no longer honor the requested rate and —
 * for very small profiles — the previously reverse-engineered "effective rate"
 * could even INVERT the requested direction. The corrected engine must:
 *   - keep the requested (direction-preserving) rate in `rate.weeklyRateKg`;
 *   - keep the constrained canonical target in `energy.targetCalories`;
 *   - explicitly mark the target infeasible with a deterministic warning.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  resolveNutritionDecision,
  calculateTargetCalories,
  caloriesFromMacros,
  MIN_TARGET_KCAL,
  MAX_TARGET_KCAL,
  type NutritionProfileInput,
} from './engine';
import {
  decideAdaptation,
  type WeightObservation,
} from './adaptation';

// ============================================================================
// HELPERS
// ============================================================================

const profile = (o: Partial<NutritionProfileInput> = {}): NutritionProfileInput => ({
  weightKg: 80,
  heightCm: 180,
  age: 30,
  gender: 'male',
  activityLevel: 'moderately_active',
  primaryGoal: 'fat_loss',
  weeklyWeightChange: -0.5,
  ...o,
});

/** Extreme-but-VALID profile where the 800 kcal floor is the binding constraint
 *  and the requested deficit would invert if reverse-engineered (tdee 572 < 800).
 *  Age 100 / height 150 / weight 20 are all within the engine's clinical bounds. */
const FLOOR_PROFILE: NutritionProfileInput = {
  weightKg: 20,
  heightCm: 150,
  age: 100,
  gender: 'female',
  activityLevel: 'sedentary',
  primaryGoal: 'fat_loss',
  weeklyWeightChange: -0.5,
};

function isoAddDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Exact linear weigh-ins (days+1 points), total change over the window. */
function linearWeighIns(
  totalKgChange: number,
  days: number,
  startWeight = 20,
): WeightObservation[] {
  const perDay = totalKgChange / days;
  return Array.from({ length: days + 1 }, (_, i) => ({
    date: isoAddDays('2026-01-01', i),
    weightKg: startWeight + perDay * i,
  }));
}

// ============================================================================
// F-04-A / F-04-B — NORMAL FEASIBLE DEFICIT & SURPLUS
// ============================================================================

describe('F-04-A/B · normal feasible rates keep direction, feasibility, no warnings', () => {
  it('normal deficit stays negative, is feasible, no warnings', () => {
    const d = resolveNutritionDecision(profile({ weeklyWeightChange: -0.5 }));
    expect(d.rate.requestedWeeklyRateKg).toBe(-0.5);
    expect(d.rate.weeklyRateKg).toBeLessThan(0);
    expect(d.energy.dailyDelta).toBeLessThan(0);
    expect(d.feasibility.isFeasible).toBe(true);
    expect(d.feasibility.warnings).toEqual([]);
  });

  it('normal surplus stays positive, is feasible, no warnings', () => {
    const d = resolveNutritionDecision(profile({ weeklyWeightChange: 0.25 }));
    expect(d.rate.requestedWeeklyRateKg).toBe(0.25);
    expect(d.rate.weeklyRateKg).toBeGreaterThan(0);
    expect(d.energy.dailyDelta).toBeGreaterThan(0);
    expect(d.feasibility.isFeasible).toBe(true);
    expect(d.feasibility.warnings).toEqual([]);
  });
});

// ============================================================================
// F-04-C — EXTREME DEFICIT BELOW THE MINIMUM FLOOR
// ============================================================================

describe('F-04-C · extreme deficit below the minimum floor is explicit, not silent', () => {
  it('requested rate stays negative; target respects the floor; flagged infeasible', () => {
    const d = resolveNutritionDecision(FLOOR_PROFILE);
    // Precondition: this profile's TDEE is below the floor (sign-inversion case).
    expect(d.energy.tdee).toBeLessThan(MIN_TARGET_KCAL);
    // Requested (prescribed) rate is preserved and negative.
    expect(d.rate.requestedWeeklyRateKg).toBe(-0.5);
    expect(d.rate.weeklyRateKg).toBe(-0.5);
    expect(d.rate.weeklyRateKg).toBeLessThan(0);
    // The constrained target respects the existing minimum floor.
    expect(d.energy.targetCalories).toBe(MIN_TARGET_KCAL);
    expect(Number.isFinite(d.energy.targetCalories)).toBe(true);
    expect(d.energy.targetCalories).toBeGreaterThanOrEqual(0);
    // Explicitly infeasible with a deterministic warning.
    expect(d.feasibility.isFeasible).toBe(false);
    expect(d.feasibility.warnings.length).toBeGreaterThan(0);
    expect(d.feasibility.warnings.join(' ')).toMatch(/floored/);
    // The system does NOT relabel the constrained result as the requested rate
    // being achieved: the target is 800 kcal, not the ~572 kcal the request implied.
    expect(d.energy.targetCalories).not.toBe(d.energy.tdee - 550);
  });
});

// ============================================================================
// F-04-D — EXTREME SURPLUS ABOVE THE MAXIMUM CAP
// ============================================================================

describe('F-04-D · maximum calorie cap', () => {
  it('documents that the cap is unreachable under valid inputs, and the primitive caps', () => {
    // Highest reachable TDEE with valid inputs: 400kg, 250cm, age 12, male,
    // extra_active. Even at the maximum +2 kg/week request the goal-appropriate
    // clamp (+550 kcal) yields ~11015 kcal < 12000 — the cap cannot be reached
    // through any valid decision, so no decision-level infeasibility is expected.
    const d = resolveNutritionDecision(
      profile({
        weightKg: 400,
        heightCm: 250,
        age: 12,
        gender: 'male',
        activityLevel: 'extra_active',
        primaryGoal: 'muscle_gain',
        weeklyWeightChange: 2,
      }),
    );
    expect(d.energy.targetCalories).toBeLessThan(MAX_TARGET_KCAL);
    expect(d.feasibility.isFeasible).toBe(true);
    expect(d.rate.weeklyRateKg).toBeGreaterThan(0);
    // The cap primitive itself is still authoritative and respected.
    expect(calculateTargetCalories(11900, 'maintenance', 10)).toBe(MAX_TARGET_KCAL);
  });
});

// ============================================================================
// F-04-E — NO SIGN INVERSION (representative boundary cases)
// ============================================================================

describe('F-04-E · extreme requested direction can never become the opposite effective rate', () => {
  it('negative requests on the floor-binding profile never report a positive rate', () => {
    for (const rate of [-0.5, -1, -2, -1e-9]) {
      const d = resolveNutritionDecision({ ...FLOOR_PROFILE, weeklyWeightChange: rate });
      expect(d.rate.weeklyRateKg, `rate for ${rate}`).toBeLessThanOrEqual(0);
      expect(d.rate.weeklyRateKg, `rate for ${rate}`).toBe(rate);
      expect(d.rate.weeklyRateKg, `rate for ${rate}`).not.toBeGreaterThan(0);
    }
  });

  it('positive requests on the floor-binding profile never report a negative rate', () => {
    for (const rate of [0.25, 0.5, 2]) {
      const d = resolveNutritionDecision({ ...FLOOR_PROFILE, weeklyWeightChange: rate });
      expect(d.rate.weeklyRateKg, `rate for ${rate}`).toBeGreaterThanOrEqual(0);
      expect(d.rate.weeklyRateKg, `rate for ${rate}`).not.toBeLessThan(0);
    }
  });

  it('a maintenance (zero) request on the floor-binding profile reports exactly zero', () => {
    const d = resolveNutritionDecision({
      ...FLOOR_PROFILE,
      primaryGoal: 'maintenance',
      weeklyWeightChange: 0,
    });
    expect(d.rate.weeklyRateKg).toBe(0);
    expect(d.energy.targetCalories).toBe(MIN_TARGET_KCAL); // floored
    expect(d.feasibility.isFeasible).toBe(false);
  });
});

// ============================================================================
// F-04-F — MACRO / CALORIE INTEGRITY UNDER INFEASIBILITY
// ============================================================================

describe('F-04-F · macros stay valid even when the energy target is constrained', () => {
  it('floored target: non-negative, finite, canonical closure, fiber <= carbs', () => {
    const d = resolveNutritionDecision(FLOOR_PROFILE);
    const { proteinGrams, carbsGrams, fatGrams } = d.macros;
    expect(d.energy.targetCalories).toBe(MIN_TARGET_KCAL);
    expect(proteinGrams).toBeGreaterThanOrEqual(0);
    expect(carbsGrams).toBeGreaterThanOrEqual(0);
    expect(fatGrams).toBeGreaterThanOrEqual(0);
    expect(
      [proteinGrams, carbsGrams, fatGrams, d.nutrition.fiberGrams, d.energy.targetCalories]
        .every(Number.isFinite),
    ).toBe(true);
    // Canonical 4/4/9 closure holds exactly for the returned macros.
    expect(caloriesFromMacros({ protein: proteinGrams, carbs: carbsGrams, fat: fatGrams })).toBe(
      d.energy.targetCalories,
    );
    expect(d.nutrition.fiberGrams).toBeLessThanOrEqual(carbsGrams);
  });
});

// ============================================================================
// F-04-G — ADAPTATION STILL DELEGATES TO THE CANONICAL ENGINE
// ============================================================================

describe('F-04-G · adaptation delegates feasibility to the canonical engine', () => {
  it('an adapted future rate passes through the engine and receives the same floor', () => {
    const tdee = resolveNutritionDecision(FLOOR_PROFILE).energy.tdee; // 572
    const decision = decideAdaptation({
      referenceWeightKg: 20,
      tdee,
      primaryGoal: 'fat_loss',
      activityLevel: 'sedentary',
      prescribedWeeklyRateKg: -0.5,
      currentTargetCalories: MIN_TARGET_KCAL, // the standing (floored) prescription target
      observations: linearWeighIns(-0.8, 28), // observed ≈ -0.2/wk vs prescribed -0.5
      adherenceScores: Array.from({ length: 10 }, () => 92),
    });
    // eligible adjustment fires, and the future target is exactly the canonical
    // engine output for the adjusted rate — including the SAME floor treatment.
    expect(decision.outcome).toBe('adherent_unexpected');
    expect(decision.calorieAdjustmentKcal).not.toBe(0);
    expect(decision.futureTargetCalories).toBe(
      Math.round(calculateTargetCalories(tdee, 'fat_loss', decision.futureWeeklyRateKg)),
    );
    expect(decision.futureTargetCalories).toBe(MIN_TARGET_KCAL);
  });

  it('the adaptation layer defines no independent feasibility/floor logic (static guard)', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/domain/nutrition/adaptation.ts'), 'utf8');
    expect(src).not.toMatch(/MIN_TARGET_KCAL|MAX_TARGET_KCAL/);
    expect(src).not.toMatch(/isFeasible\s*:/);
    expect(src).toMatch(/calculateTargetCalories/); // delegates to the engine
  });
});

// ============================================================================
// F-04-H — DETERMINISM
// ============================================================================

describe('F-04-H · identical inputs produce byte-equivalent decisions', () => {
  it('feasible and floor-bound decisions are deterministic', () => {
    expect(JSON.stringify(resolveNutritionDecision(profile({ weeklyWeightChange: -0.5 })))).toBe(
      JSON.stringify(resolveNutritionDecision(profile({ weeklyWeightChange: -0.5 }))),
    );
    expect(JSON.stringify(resolveNutritionDecision(FLOOR_PROFILE))).toBe(
      JSON.stringify(resolveNutritionDecision(FLOOR_PROFILE)),
    );
  });
});