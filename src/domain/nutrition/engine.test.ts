/**
 * Canonical Nutrition Engine — unit tests
 *
 * Locks down the invariants declared at the top of engine.ts:
 *  - Mifflin-St Jeor for BMR (TDEE = BMR x activity factor, not its own formula)
 *  - targetCalories = TDEE + signed(goalAdjustment); sign is never abs()-ed
 *  - protein is bodyweight-based (1.6 g/kg default, 2.0 g/kg priority,
 *    2.2 g/kg absolute ceiling) — never % of kcal
 *  - fat is a 0.6 g/kg bodyweight floor that is preserved, never traded away
 *  - carbs are the remainder and are never negative
 *  - infeasible targets are flagged, not silently "fixed"
 *  - fiber = 14 g / 1000 kcal, capped at carbohydrate grams
 *  - kcal closure: within ~4 kcal (one gram) of target
 *  - single boundary round; deterministic (same input => identical output)
 *  - structured, explainable decision output (energy/macros/nutrition/method/
 *    feasibility/rate)
 *  - validation rejects unsafe inputs before any arithmetic
 */

import { describe, it, expect } from 'vitest';
import {
  validateNutritionInput,
  calculateBMR,
  calculateTDEE,
  calculateTargetCalories,
  dailyEnergyDelta,
  resolveEnergyAdjustment,
  calculateProteinTarget,
  proteinCoefficientFor,
  resolveProteinPriority,
  PROTEIN_COEFFICIENT_NORMAL_G_PER_KG,
  PROTEIN_COEFFICIENT_PRIORITY_G_PER_KG,
  PROTEIN_COEFFICIENT_CEILING_G_PER_KG,
  FAT_FLOOR_G_PER_KG,
  calculateFatFloor,
  reconcileTarget,
  resolveNutritionDecision,
  calculateProfile,
  calculateFiberGrams,
  calculateWaterIntake,
  ageFromBirthDate,
  calculateNutritionMetrics,
  scaleIngredientMacros,
  sumMacros,
  aggregatePortions,
  validateIngredientEnergy,
  type NutritionProfileInput,
} from './engine';
import type { Client } from '@/types';

const maleInput: NutritionProfileInput = {
  weightKg: 80,
  heightCm: 180,
  age: 30,
  gender: 'male',
  activityLevel: 'moderately_active',
  primaryGoal: 'fat_loss',
};
const male = maleInput;

describe('validateNutritionInput', () => {
  it('accepts a valid input', () => {
    const { valid, errors } = validateNutritionInput(male);
    expect(valid).toBe(true);
    expect(errors).toEqual([]);
  });
  it('rejects out-of-range weight', () => {
    expect(validateNutritionInput({ ...male, weightKg: 5 }).valid).toBe(false);
    expect(validateNutritionInput({ ...male, weightKg: 0 }).valid).toBe(false);
    expect(validateNutritionInput({ ...male, weightKg: NaN }).valid).toBe(false);
  });
  it('rejects out-of-range height', () => {
    expect(validateNutritionInput({ ...male, heightCm: 50 }).valid).toBe(false);
    expect(validateNutritionInput({ ...male, heightCm: -1 }).valid).toBe(false);
  });
  it('rejects out-of-range age', () => {
    expect(validateNutritionInput({ ...male, age: 5 }).valid).toBe(false);
    expect(validateNutritionInput({ ...male, age: 150 }).valid).toBe(false);
  });
  it('rejects unknown goal / activity level', () => {
    expect(validateNutritionInput({ ...male, primaryGoal: 'bogus' as never }).valid).toBe(false);
    expect(validateNutritionInput({ ...male, activityLevel: 'couch' as never }).valid).toBe(false);
  });
  it('allows +/-2 kg and rejects beyond', () => {
    expect(validateNutritionInput({ ...male, weeklyWeightChange: 2 }).valid).toBe(true);
    expect(validateNutritionInput({ ...male, weeklyWeightChange: -2 }).valid).toBe(true);
    expect(validateNutritionInput({ ...male, weeklyWeightChange: 2.5 }).valid).toBe(false);
    expect(validateNutritionInput({ ...male, weeklyWeightChange: -3 }).valid).toBe(false);
  });
});

describe('calculateBMR', () => {
  it('computes male BMR via Mifflin-St Jeor', () => {
    // 10*80 + 6.25*180 - 5*30 + 5 = 1780
    expect(calculateBMR(80, 180, 30, 'male')).toBe(1780);
  });
  it('computes female BMR via Mifflin-St Jeor', () => {
    // 10*80 + 6.25*165 - 5*30 - 161 = 1520.25
    expect(calculateBMR(80, 165, 30, 'female')).toBe(1520.25);
  });
});

describe('calculateTDEE', () => {
  it('is BMR x activity factor (moderately_active = 1.55)', () => {
    expect(calculateTDEE(1780, 'moderately_active')).toBe(1780 * 1.55);
  });
});

describe('dailyEnergyDelta', () => {
  it('translates weekly change to daily delta, preserving sign', () => {
    expect(dailyEnergyDelta(1)).toBe(1100);
    expect(dailyEnergyDelta(-1)).toBe(-1100);
    expect(dailyEnergyDelta(0.5)).toBe(550);
  });
});

describe('calculateTargetCalories', () => {
  const tdee = 2759;

  it('uses the conservative deficit default for fat_loss', () => {
    expect(calculateTargetCalories(tdee, 'fat_loss')).toBe(tdee - 550);
  });
  it('uses the conservative surplus default for muscle_gain', () => {
    expect(calculateTargetCalories(tdee, 'muscle_gain')).toBe(tdee + 275);
  });
  it('maintenance and recomposition target TDEE exactly', () => {
    expect(calculateTargetCalories(tdee, 'maintenance')).toBe(tdee);
    expect(calculateTargetCalories(tdee, 'recomposition')).toBe(tdee);
  });
  it('honors explicit weeklyWeightChange: loss = deficit, sign preserved', () => {
    expect(calculateTargetCalories(tdee, 'fat_loss', -0.5)).toBe(tdee - 550);
    expect(calculateTargetCalories(tdee, 'fat_loss', -0.5)).toBeLessThan(tdee);
  });
  it('honors explicit weeklyWeightChange: gain = surplus, sign preserved', () => {
    expect(calculateTargetCalories(tdee, 'muscle_gain', 0.5)).toBe(tdee + 550);
    expect(calculateTargetCalories(tdee, 'muscle_gain', 0.5)).toBeGreaterThan(tdee);
  });
  it('clamps infeasible deficits to MAX_DEFICIT_KCAL (-1150)', () => {
    expect(calculateTargetCalories(tdee, 'fat_loss', -3)).toBe(tdee - 1150);
  });
  it('clamps infeasible surpluses to MAX_SURPLUS_KCAL (+550)', () => {
    expect(calculateTargetCalories(tdee, 'muscle_gain', 3)).toBe(tdee + 550);
  });
  it('default fat_loss equals an explicit -0.5 weekly change', () => {
    expect(calculateTargetCalories(tdee, 'fat_loss')).toBe(
      calculateTargetCalories(tdee, 'fat_loss', -0.5),
    );
  });
  it('never below MIN_TARGET_KCAL or above MAX_TARGET_KCAL', () => {
    expect(calculateTargetCalories(100, 'fat_loss', -3)).toBeGreaterThanOrEqual(800);
    expect(calculateTargetCalories(20000, 'muscle_gain', 3)).toBeLessThanOrEqual(12000);
  });
});

// __ENGINE_TEST_TAIL_MACROS__

// ============================================================================
// PHASE 6 DECISION MODEL — protein / fat / carb rules
// ============================================================================

describe('Phase 6 protein policy (bodyweight coefficient, never % of calories)', () => {
  it('defaults to 1.6 g/kg for the normal general population', () => {
    expect(PROTEIN_COEFFICIENT_NORMAL_G_PER_KG).toBe(1.6);
    expect(resolveProteinPriority('maintenance', 'moderately_active')).toBe('normal');
    expect(resolveProteinPriority('muscle_gain', 'moderately_active')).toBe('normal');
    expect(resolveProteinPriority('recomposition', 'lightly_active')).toBe('normal');
    expect(resolveProteinPriority('maintenance', 'sedentary')).toBe('normal');
    expect(proteinCoefficientFor('normal')).toBe(1.6);
    expect(calculateProteinTarget(80, 'normal')).toBeCloseTo(80 * 1.6, 10);
  });

  it('raises protein priority to 2.0 g/kg for fat loss', () => {
    expect(PROTEIN_COEFFICIENT_PRIORITY_G_PER_KG).toBe(2.0);
    expect(resolveProteinPriority('fat_loss', 'sedentary')).toBe('priority');
    expect(resolveProteinPriority('fat_loss', 'moderately_active')).toBe('priority');
    expect(proteinCoefficientFor('priority')).toBe(2.0);
    expect(calculateProteinTarget(80, 'priority')).toBeCloseTo(80 * 2.0, 10);
  });

  it('raises protein priority to 2.0 g/kg for high training demand', () => {
    expect(resolveProteinPriority('maintenance', 'very_active')).toBe('priority');
    expect(resolveProteinPriority('muscle_gain', 'extra_active')).toBe('priority');
    expect(resolveProteinPriority('recomposition', 'very_active')).toBe('priority');
  });

  it('never prescribes above the 2.2 g/kg absolute planning ceiling', () => {
    expect(PROTEIN_COEFFICIENT_CEILING_G_PER_KG).toBe(2.2);
    expect(proteinCoefficientFor('normal')).toBeLessThanOrEqual(2.2);
    expect(proteinCoefficientFor('priority')).toBeLessThanOrEqual(2.2);
    expect(calculateProteinTarget(120, 'priority')).toBeLessThanOrEqual(120 * 2.2 + 1e-9);
  });

  it('protein is derived from bodyweight, not from remaining calories', () => {
    // Same bodyweight, wildly different calorie budgets -> identical protein.
    expect(reconcileTarget(1500, 80, 'normal').proteinGrams).toBe(
      reconcileTarget(3500, 80, 'normal').proteinGrams,
    );
  });
});

describe('Phase 6 fat floor (0.6 g/kg bodyweight)', () => {
  it('is a bodyweight-based floor of 0.6 g/kg/day', () => {
    expect(FAT_FLOOR_G_PER_KG).toBe(0.6);
    expect(calculateFatFloor(80)).toBeCloseTo(48, 10);
    expect(calculateFatFloor(100)).toBeCloseTo(60, 10);
  });

  it('fat is preserved even when the calorie budget is tight', () => {
    // 80 kg client on 900 kcal: fat floor (48 g) is kept, not traded away.
    const tight = reconcileTarget(900, 80, 'normal');
    expect(tight.fatGrams).toBe(Math.floor(80 * 0.6));
  });
});

describe('reconcileTarget (Phase 6: preserve protein + fat, flag infeasibility)', () => {
  // 1780 BMR * 1.55 TDEE = 2759; fat_loss default -550 => 2209
  const target = 2209;
  const result = () => reconcileTarget(target, 80, 'priority');

  it('preserves the prescribed protein target (2.0 g/kg for priority)', () => {
    expect(result().proteinGrams).toBe(160);
  });

  it('honors the fat floor (0.6 * weight)', () => {
    expect(result().fatGrams).toBe(Math.floor(80 * 0.6));
  });

  it('carbs are the remainder after protein and fat', () => {
    const r = result();
    expect(r.carbsGrams).toBe(Math.floor((2209 - 160 * 4 - 48 * 9) / 4));
  });

  it('carbs are never negative', () => {
    expect(result().carbsGrams).toBeGreaterThanOrEqual(0);
  });

  it('protein and fat are never negative', () => {
    const r = result();
    expect(r.proteinGrams).toBeGreaterThanOrEqual(0);
    expect(r.fatGrams).toBeGreaterThanOrEqual(0);
  });

  it('flags a feasible target with no warnings', () => {
    const r = result();
    expect(r.isFeasible).toBe(true);
    expect(r.warnings).toEqual([]);
  });

  it('achieves kcal closure within ~4 kcal (one gram) of target', () => {
    const r = result();
    const kcal = r.proteinGrams * 4 + r.carbsGrams * 4 + r.fatGrams * 9;
    expect(Math.abs(kcal - target)).toBeLessThanOrEqual(4);
  });

  it('produces stable, integer gram values (deterministic)', () => {
    const a = reconcileTarget(target, 80, 'priority');
    const b = reconcileTarget(target, 80, 'priority');
    expect(a).toEqual(b);
    expect(Number.isInteger(a.proteinGrams)).toBe(true);
    expect(Number.isInteger(a.carbsGrams)).toBe(true);
    expect(Number.isInteger(a.fatGrams)).toBe(true);
  });

  it('exposes the DailyTarget shape including feasibility metadata', () => {
    const r: ReturnType<typeof reconcileTarget> = result();
    expect(Object.keys(r).sort()).toEqual(
      [
        'targetCalories',
        'proteinGrams',
        'carbsGrams',
        'fatGrams',
        'fiberGrams',
        'isFeasible',
        'warnings',
      ].sort(),
    );
  });
});

describe('Phase 6 infeasible target detection (never negative macros)', () => {
  it('flags infeasible instead of shrinking protein/fat or producing negative carbs', () => {
    // 150 kg client, 900 kcal target: prescribed protein alone (300 g = 1200
    // kcal) exceeds the entire budget.
    const r = reconcileTarget(900, 150, 'priority');
    expect(r.isFeasible).toBe(false);
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.carbsGrams).toBe(0);
    expect(r.proteinGrams).toBeGreaterThanOrEqual(0);
    expect(r.fatGrams).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(r.proteinGrams + r.carbsGrams + r.fatGrams)).toBe(true);
  });

  it('keeps the fat floor intact when flagging infeasibility', () => {
    const r = reconcileTarget(900, 150, 'priority');
    expect(r.fatGrams).toBe(Math.floor(150 * 0.6));
  });

  it('treats a target that exactly covers protein + fat as feasible with zero carbs', () => {
    // 80 kg priority: protein 640 kcal + fat floor 432 kcal = 1072 kcal.
    const r = reconcileTarget(1072, 80, 'priority');
    expect(r.isFeasible).toBe(true);
    expect(r.carbsGrams).toBe(0);
    expect(r.proteinGrams).toBe(160);
    expect(r.fatGrams).toBe(48);
  });
});

// __ENGINE_TEST_TAIL_FIBER__

describe('calculateFiberGrams (14 g per 1000 kcal, capped at carbs)', () => {
  it('scales at 14 g / 1000 kcal, rounded once', () => {
    expect(calculateFiberGrams(2209, 284)).toBe(30); // floor(2209 * 14 / 1000)
    expect(calculateFiberGrams(1000, 500)).toBe(14);
    expect(calculateFiberGrams(2500, 500)).toBe(35);
  });
  it('never reports more fiber than carb grams', () => {
    expect(calculateFiberGrams(800, 10)).toBe(10);
    expect(calculateFiberGrams(3000, 20)).toBe(20);
  });
  it('is never negative', () => {
    expect(calculateFiberGrams(0, 0)).toBe(0);
  });
});

describe('calculateWaterIntake', () => {
  it('uses 35 ml/kg + activity add-on, returns liters', () => {
    // 80 * 35 = 2800; moderately_active adds 500 -> 3300 -> 3
    expect(calculateWaterIntake(80, 'moderately_active')).toBe(3);
    // sedentary: no add-on -> 2800 -> 3
    expect(calculateWaterIntake(80, 'sedentary')).toBe(3);
  });
  it('adds the active add-on for very/extra_active (3.8 L -> 4)', () => {
    expect(calculateWaterIntake(80, 'very_active')).toBe(4);
    expect(calculateWaterIntake(80, 'extra_active')).toBe(4);
  });
});

describe('ageFromBirthDate', () => {
  it('computes whole-year age relative to a fixed reference date', () => {
    expect(ageFromBirthDate('2000-06-15', new Date('2025-01-15'))).toBe(24);
    expect(ageFromBirthDate('2000-06-15', new Date('2025-07-15'))).toBe(25);
  });
  it('returns 0 for unparseable dates', () => {
    expect(ageFromBirthDate('not-a-date')).toBe(0);
  });
});

describe('calculateProfile (client -> NutritionMetrics)', () => {
  it('produces the canonical NutritionMetrics for the male fixture', () => {
    // fat_loss => priority protein 2.0 g/kg = 160 g; fat floor 0.6 g/kg = 48 g;
    // carbs = floor((2209 - 640 - 432) / 4) = 284.
    expect(calculateProfile(male)).toEqual({
      bmr: 1780,
      tdee: 2759,
      targetCalories: 2209,
      proteinGrams: 160,
      carbsGrams: 284,
      fatGrams: 48,
      fiberGrams: 30,
      waterLiters: 3,
    });
  });

  it('is deterministic - identical input yields identical output', () => {
    const a = calculateProfile(male);
    const b = calculateProfile({ ...male });
    expect(a).toStrictEqual(b);
  });

  it('throws NutritionInputError on invalid input', () => {
    expect(() => calculateProfile({ ...male, weightKg: 5 })).toThrow(/Invalid nutrition inputs/);
  });
});

// ============================================================================
// PHASE 6 STRUCTURED DECISION OUTPUT (explainability)
// ============================================================================

describe('resolveNutritionDecision (structured, explainable target)', () => {
  const decision = resolveNutritionDecision(male);

  it('exposes the energy block (bmr / tdee / target / dailyDelta)', () => {
    expect(decision.energy.bmr).toBe(1780);
    expect(decision.energy.tdee).toBe(2759);
    expect(decision.energy.targetCalories).toBe(2209);
    expect(decision.energy.dailyDelta).toBe(2209 - 2759);
  });

  it('exposes macros and nutrition targets with feasibility', () => {
    expect(decision.macros).toEqual({ proteinGrams: 160, carbsGrams: 284, fatGrams: 48 });
    expect(decision.nutrition.fiberGrams).toBe(30);
    expect(decision.nutrition.waterLiters).toBe(3);
    expect(decision.feasibility.isFeasible).toBe(true);
    expect(decision.feasibility.warnings).toEqual([]);
  });

  it('explains the methods deterministically', () => {
    expect(decision.method.energyMethod).toBe('tdee_plus_default_goal_adjustment');
    expect(decision.method.proteinMethod).toBe('bodyweight_coefficient');
    expect(decision.method.fatMethod).toBe('bodyweight_fat_floor');
    expect(decision.method.carbohydrateMethod).toBe('calorie_remainder');
    expect(decision.proteinPriority).toBe('priority');
    expect(decision.proteinCoefficientGPerKg).toBe(2.0);
    expect(decision.fatFloorCoefficientGPerKg).toBe(0.6);
  });

  it('expresses the target rate relative to bodyweight', () => {
    // Default fat_loss adjustment (-550 kcal) implies -0.5 kg/week.
    expect(decision.rate.weeklyRateKg).toBeCloseTo(-0.5, 10);
    expect(decision.rate.weeklyRatePercentBodyweight).toBeCloseTo(-0.625, 10); // -0.5 / 80 * 100
  });

  it('reports maintenance as TDEE with zero delta and normal protein priority', () => {
    const d = resolveNutritionDecision({ ...male, primaryGoal: 'maintenance' });
    expect(d.method.energyMethod).toBe('maintenance_tdee');
    expect(d.energy.targetCalories).toBe(2759);
    expect(d.energy.dailyDelta).toBe(0);
    expect(d.rate.weeklyRateKg).toBe(0);
    expect(d.rate.weeklyRatePercentBodyweight).toBe(0);
    expect(d.proteinPriority).toBe('normal');
    expect(d.macros.proteinGrams).toBe(128); // 1.6 g/kg default
  });

  it('uses the requested weekly change and preserves its sign', () => {
    const loss = resolveNutritionDecision({
      ...male,
      primaryGoal: 'maintenance',
      weeklyWeightChange: -0.5,
    });
    expect(loss.method.energyMethod).toBe('tdee_plus_requested_weekly_change');
    expect(loss.energy.targetCalories).toBe(2759 - 550);
    expect(loss.rate.weeklyRateKg).toBeCloseTo(-0.5, 10);

    const gain = resolveNutritionDecision({
      ...male,
      primaryGoal: 'maintenance',
      weeklyWeightChange: 0.25,
    });
    expect(gain.method.energyMethod).toBe('tdee_plus_requested_weekly_change');
    expect(gain.energy.targetCalories).toBe(2759 + 275);
    expect(gain.rate.weeklyRateKg).toBeCloseTo(0.25, 10);
    expect(gain.rate.weeklyRatePercentBodyweight).toBeCloseTo(0.3125, 10); // 0.25 / 80 * 100
  });

  it('surfaces infeasibility through the structured output', () => {
    // 150 kg / 160 cm / 60 y female, sedentary, max validated deficit:
    // BMR 2039 -> TDEE 2447 -> clamped target 1297, but prescribed protein
    // (300 g = 1200 kcal) + fat floor (90 g = 810 kcal) exceed it.
    const d = resolveNutritionDecision({
      ...male,
      gender: 'female',
      weightKg: 150,
      heightCm: 160,
      age: 60,
      activityLevel: 'sedentary',
      weeklyWeightChange: -2,
    });
    expect(d.energy.targetCalories).toBe(1297);
    expect(d.feasibility.isFeasible).toBe(false);
    expect(d.feasibility.warnings.length).toBeGreaterThan(0);
    expect(d.macros.carbsGrams).toBe(0);
    expect(Math.min(d.macros.proteinGrams, d.macros.carbsGrams, d.macros.fatGrams)).toBeGreaterThanOrEqual(0);
  });

  it('is deterministic', () => {
    expect(resolveNutritionDecision(male)).toEqual(resolveNutritionDecision({ ...male }));
  });
});

describe('Phase 6 calorie closure across all goals', () => {
  it('profile macros close to the target via the canonical 4/4/9 equation', () => {
    for (const goal of ['fat_loss', 'muscle_gain', 'recomposition', 'maintenance'] as const) {
      const m = calculateProfile({ ...male, primaryGoal: goal });
      const kcal = m.proteinGrams * 4 + m.carbsGrams * 4 + m.fatGrams * 9;
      expect(Math.abs(kcal - m.targetCalories)).toBeLessThanOrEqual(4);
    }
  });
});

describe('resolveEnergyAdjustment (energy method metadata)', () => {
  it('reports requested weekly change with its signed delta', () => {
    const plan = resolveEnergyAdjustment('fat_loss', -0.5);
    expect(plan.adjustmentKcal).toBe(-550);
    expect(plan.energyMethod).toBe('tdee_plus_requested_weekly_change');
    expect(plan.weeklyRateKg).toBe(-0.5);
  });

  it('reports conservative defaults per goal when no weekly change is given', () => {
    expect(resolveEnergyAdjustment('fat_loss').adjustmentKcal).toBe(-550);
    expect(resolveEnergyAdjustment('muscle_gain').adjustmentKcal).toBe(275);
    expect(resolveEnergyAdjustment('maintenance').energyMethod).toBe('maintenance_tdee');
    expect(resolveEnergyAdjustment('recomposition').weeklyRateKg).toBe(0);
  });
});

const buildClient = (overrides: Partial<Client> = {}): Client =>
  ({
    id: 'c1',
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'j@doe.com',
    phone: '',
        birthDate: '1995-06-15',
    age: 30,
    gender: 'male',
    height: 180,
    weight: 80,
    activityLevel: 'moderately_active',
    primaryGoal: 'fat_loss',
    targetWeight: 75,
    weeklyWeightChange: -0.5,
    trainingExperience: 'intermediate',
    trainingDaysPerWeek: 4,
    sessionDuration: 60,
    preferredTrainingStyle: 'hypertrophy',
    equipment: [],
    equipmentAvailable: [],
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

describe('calculateNutritionMetrics (Client shortcut)', () => {
  it('maps Client fields to the canonical profile', () => {
    const result = calculateNutritionMetrics(buildClient());
    expect(result.bmr).toBe(1780);
    expect(result.tdee).toBe(2759);
    expect(result.targetCalories).toBe(2759 - 550);
  });

  it('derives age from birthDate when client.age is absent', () => {
    const client = buildClient({ age: undefined, birthDate: '2000-06-15' });
    const result = calculateNutritionMetrics(client);
    expect(result).toBeTruthy();
    expect(typeof result.targetCalories).toBe('number');
  });
});

// INGREDIENT / RECIPE HELPERS ==================================================

describe('scaleIngredientMacros', () => {
  it('scales each macro by the factor, rounding once', () => {
    expect(scaleIngredientMacros({ protein: 10, carbs: 5, fat: 3, fiber: 1 }, 2.5)).toEqual({
      protein: 25,
      carbs: 13,
      fat: 8,
      fiber: 3,
    });
  });
  it('accepts scale 0 (fiber undefined stays undefined)', () => {
    expect(scaleIngredientMacros({ protein: 10, carbs: 5, fat: 3 }, 0)).toEqual({
      protein: 0,
      carbs: 0,
      fat: 0,
      fiber: undefined,
    });
  });
  it('throws on negative / non-finite factor', () => {
    expect(() => scaleIngredientMacros({ protein: 10, carbs: 5, fat: 3 }, -1)).toThrow(/Invalid nutrition inputs/);
    expect(() => scaleIngredientMacros({ protein: 10, carbs: 5, fat: 3 }, NaN)).toThrow(/Invalid nutrition inputs/);
  });
});

describe('sumMacros / aggregatePortions', () => {
  it('sums portions and derives calories consistently', () => {
    const total = sumMacros([
      { protein: 10, carbs: 5, fat: 3, fiber: 1 },
      { protein: 20, carbs: 15, fat: 7 },
    ]);
    // first: 40+20+27=87; second: 80+60+63=203 -> total 290
    expect(total.calories).toBe(290);
    expect(total.protein).toBe(30);
    expect(total.carbs).toBe(20);
    expect(total.fat).toBe(10);
    expect(total.fiber).toBe(1);
  });
  it('aggregatePortions is equivalent to sumMacros', () => {
    const portions = [
      { protein: 10, carbs: 5, fat: 3, fiber: 1 },
      { protein: 20, carbs: 15, fat: 7 },
    ];
    expect(aggregatePortions(portions)).toEqual(sumMacros(portions));
  });
});

describe('validateIngredientEnergy', () => {
  it('returns true when declared calories match derived calories', () => {
    expect(validateIngredientEnergy({ protein: 10, carbs: 10, fat: 10, calories: 170 })).toBe(true);
  });
  it('returns false when declared calories diverge beyond tolerance', () => {
    expect(validateIngredientEnergy({ protein: 10, carbs: 10, fat: 10, calories: 180 })).toBe(false);
  });
  it('uses derived calories when none are declared', () => {
    expect(validateIngredientEnergy({ protein: 10, carbs: 10, fat: 10 })).toBe(true);
  });
});