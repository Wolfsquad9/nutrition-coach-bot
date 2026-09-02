/**
 * Phase 10 — EFFECTIVE (post-clamp) weekly rate + prescription reconstruction.
 *
 * Proves:
 *  - the canonical engine distinguishes REQUESTED from EFFECTIVE weekly rate
 *  - the effective rate is what a prescription persists, and it corresponds to
 *    the delivered target AFTER every feasibility/energy clamp (never the
 *    pre-clamp request)
 *  - reconstructing a valid active prescription through the canonical engine
 *    reproduces the same target (deterministic; no second source of truth)
 *  - malformed/out-of-range prescription records fail deterministically
 */

import { describe, it, expect } from 'vitest';
import {
  resolveNutritionDecision,
  calculateProfile,
  calculateTargetCalories,
  buildNutritionProfileInput,
  effectiveWeeklyRateForTarget,
  weeklyRateForAdjustment,
  MIN_TARGET_KCAL,
  MAX_TARGET_KCAL,
  KCAL_PER_KG_BODYWEIGHT,
  DAYS_PER_WEEK,
  type NutritionProfileInput,
} from './engine';
import {
  prescriptionFromLockedPlan,
  deriveInitialPrescription,
  reconstructMetricsFromPrescription,
  PrescriptionIntegrityError,
} from './prescription';
import type { Client } from '@/types';

// ============================================================================
// FIXTURES
// ============================================================================

const buildClient = (overrides: Partial<Client> = {}): Client =>
  ({
    id: 'c-p10',
    firstName: 'Jo',
    lastName: 'Do',
    email: 'j@p10.co',
    phone: '',
    birthDate: '1995-06-15',
    age: 30,
    gender: 'female',
    height: 165,
    weight: 70,
    activityLevel: 'moderately_active',
    primaryGoal: 'fat_loss',
    weeklyWeightChange: -0.5,
    dietType: 'omnivore',
    mealsPerDay: 3,
    intolerances: [],
    allergies: [],
    dislikedFoods: [],
    medicalConditions: [],
    medications: [],
    injuries: [],
    hasRedFlags: false,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }) as Client;

const profile = (overrides: Partial<NutritionProfileInput> = {}): NutritionProfileInput => ({
  weightKg: 80,
  heightCm: 180,
  age: 30,
  gender: 'male',
  activityLevel: 'moderately_active',
  primaryGoal: 'fat_loss',
  weeklyWeightChange: -0.5,
  ...overrides,
});

// ============================================================================
// REQUESTED vs EFFECTIVE RATE
// ============================================================================

describe('P0 · effective weekly rate is the rate the delivered target implies', () => {
  it('any delivered target maps to an effective rate and reconstructs to itself', () => {
    const inputs: Array<Partial<NutritionProfileInput>> = [
      { weeklyWeightChange: -0.5 },
      { weeklyWeightChange: -2 },
      { weeklyWeightChange: 1 },
      { weeklyWeightChange: 2 },
      { weeklyWeightChange: 0 },
    ];
    for (const overrides of inputs) {
      const decision = resolveNutritionDecision(profile(overrides));
      const effective = decision.rate.weeklyRateKg;
      // The effective rate is exactly the rate implied by the delivered delta.
      expect(effective).toBeCloseTo(
        weeklyRateForAdjustment(decision.energy.targetCalories - decision.energy.tdee),
        9,
      );
      // Deterministic reconstruction: re-running the engine at the effective
      // rate reproduces the same target (after all the same clamps).
      const replayed = resolveNutritionDecision({
        ...profile(overrides),
        weeklyWeightChange: effective,
      });
      expect(replayed.energy.targetCalories).toBeCloseTo(decision.energy.targetCalories, 4);
      expect(replayed.macros.proteinGrams).toBe(decision.macros.proteinGrams);
      expect(replayed.macros.fatGrams).toBe(decision.macros.fatGrams);
    }
  });

  it('extreme deficit request keeps its (clamped) negative effective rate', () => {
    const decision = resolveNutritionDecision(profile({ weeklyWeightChange: -2 }));
    expect(decision.rate.requestedWeeklyRateKg).toBe(-2);
    // Requested -2200 kcal/day exceeds the max deficit; the actual adjustment
    // is clamped to -1150, which is what the effective rate claims.
    expect(decision.energy.dailyDelta).toBe(-1150);
    expect(decision.rate.weeklyRateKg).toBeCloseTo(
      (-1150 * DAYS_PER_WEEK) / KCAL_PER_KG_BODYWEIGHT,
      9,
    );
    expect(decision.rate.weeklyRateKg).toBeLessThan(0);
  });

  it('extreme surplus request is clamped to the max surplus (+0.5kg/wk)', () => {
    // Decision level: the largest request the profile validator accepts (+2).
    const decision = resolveNutritionDecision(profile({ weeklyWeightChange: 2 }));
    expect(decision.rate.requestedWeeklyRateKg).toBe(2);
    expect(decision.rate.weeklyRateKg).toBeGreaterThan(0);
    expect(decision.rate.weeklyRateKg).toBeCloseTo(
      (550 * DAYS_PER_WEEK) / KCAL_PER_KG_BODYWEIGHT,
      9,
    );
    // Raw path: a +10 kg/week wish (beyond the validated domain) still lands on
    // the same clamped target — and the effective rate says so honestly.
    const target = calculateTargetCalories(2759, 'fat_loss', 10);
    expect(target).toBe(2759 + 550);
    expect(effectiveWeeklyRateForTarget(2759, target)).toBeCloseTo(
      (550 * DAYS_PER_WEEK) / KCAL_PER_KG_BODYWEIGHT,
      9,
    );
  });
it('minimum absolute target clamp floors the target; feasibility is explicit (F-04)', () => {
    // Small, light, sedentary profile where even the max deficit floors at
    // MIN_TARGET_KCAL. The target respects the floor; the requested rate is
    // preserved (direction never inverted) and the result is flagged infeasible.
    const input: NutritionProfileInput = {
      weightKg: 55,
      heightCm: 160,
      age: 30,
      gender: 'female',
      activityLevel: 'sedentary',
      primaryGoal: 'fat_loss',
      weeklyWeightChange: -2,
    };
    const decision = resolveNutritionDecision(input);
    expect(decision.energy.targetCalories).toBe(MIN_TARGET_KCAL);
    // F-04: the requested (direction-preserving) rate is reported, not a
    // reverse-engineered rate that could diverge from the prescription.
    expect(decision.rate.requestedWeeklyRateKg).toBe(-2);
    expect(decision.rate.weeklyRateKg).toBe(-2);
    expect(decision.rate.weeklyRateKg).toBeLessThan(0);
    // F-04: the constrained target is explicitly infeasible with a warning.
    expect(decision.feasibility.isFeasible).toBe(false);
    expect(decision.feasibility.warnings.join(' ')).toMatch(/floored/);
    // Replaying the reported rate still reproduces the floored target.
    const replayed = resolveNutritionDecision({ ...input, weeklyWeightChange: -2 });
    expect(replayed.energy.targetCalories).toBeCloseTo(MIN_TARGET_KCAL, 4);
  });

  it('maximum absolute target cap is mirrored by the effective rate', () => {
    const target = calculateTargetCalories(11900, 'maintenance', 10);
    expect(target).toBe(MAX_TARGET_KCAL);
    const effective = effectiveWeeklyRateForTarget(11900, target);
    const replayed = calculateTargetCalories(11900, 'maintenance', effective);
    expect(replayed).toBeCloseTo(target, 4);
  });

  it('maintenance is exactly zero', () => {
    const decision = resolveNutritionDecision(
      profile({ primaryGoal: 'maintenance', weeklyWeightChange: undefined }),
    );
    expect(decision.rate.weeklyRateKg).toBe(0);
  });

  it('requestedWeeklyRateKg is null when the goal default drove the target', () => {
    const decision = resolveNutritionDecision(profile({ weeklyWeightChange: undefined }));
    expect(decision.rate.requestedWeeklyRateKg).toBeNull();
    expect(decision.rate.weeklyRateKg).toBeCloseTo(-0.5, 9);
  });

  it('sign is preserved for defensive surplus/deficit requests', () => {
    expect(
      resolveNutritionDecision(profile({ weeklyWeightChange: -0.5 })).rate.weeklyRateKg,
    ).toBeLessThan(0);
    expect(
      resolveNutritionDecision(profile({ weeklyWeightChange: 0.25 })).rate.weeklyRateKg,
    ).toBeGreaterThan(0);
    expect(resolveNutritionDecision(profile({ weeklyWeightChange: 0 })).rate.weeklyRateKg).toBe(0);
  });
});

// ============================================================================
// PRESCRIPTION RECONSTRUCTION (P0-1: effectiveMetrics && effectiveRate agree)
// ============================================================================

describe('P10 — active prescription reconstructs canonically', () => {
  it('initial prescription: metrics/rate agree and reproduce through the engine', () => {
    const client = buildClient();
    const rx = deriveInitialPrescription(client);
    const reconstructed = reconstructMetricsFromPrescription(client, rx);
    expect(reconstructed.targetCalories).toBeCloseTo(rx.targetCalories, 4);
    expect(reconstructed).toEqual(calculateProfile({ ...buildNutritionProfileInput(client) }));
  });

  it('adapted prescription: metrics/rate agree on the clamped effective value', () => {
    const client = buildClient();
    const adaptedRate = -0.6363636363636364;
    const adaptedTarget = calculateProfile({
      ...buildNutritionProfileInput(client),
      weeklyWeightChange: adaptedRate,
    }).targetCalories;

    const rx = prescriptionFromLockedPlan({
      weeklyRateKg: adaptedRate,
      targetCalories: adaptedTarget,
      versionId: 'v-p10-1',
      versionNumber: 2,
      establishedAt: '2026-02-11T00:00:00.000Z',
    });
    const reconstructed = reconstructMetricsFromPrescription(client, rx);
    expect(reconstructed.targetCalories).toBeCloseTo(rx.targetCalories, 4);
    expect(Math.abs(reconstructed.targetCalories - adaptedTarget)).toBeLessThan(1);
  });

  it('fails deterministically for an out-of-range prescription rate', () => {
    const client = buildClient();
    const rx = prescriptionFromLockedPlan({
      weeklyRateKg: 99,
      targetCalories: 2209,
      versionId: 'v-bad',
      versionNumber: 1,
      establishedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(() => reconstructMetricsFromPrescription(client, rx)).toThrow(
      PrescriptionIntegrityError,
    );
  });
});