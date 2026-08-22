/**
 * Canonical Nutrition Engine
 *
 * THE single source of truth for all nutrition calculation in the application.
 *
 * Pipeline:  CLIENT INPUTS -> BMR -> TDEE -> ENERGY TARGET -> PROTEIN TARGET ->
 *            FAT FLOOR -> CARBOHYDRATE REMAINDER -> CALORIE RECONCILIATION ->
 *            FIBER / WATER -> INGREDIENT SCALING -> RECIPE/MEAL/DAY/WEEK TOTALS
 *            -> SNAPSHOT
 *
 * Invariants:
 *  1. Mifflin-St Jeor for resting expenditure (never labeled TDEE).
 *  2. TDEE = BMR x activity factor.
 *  3. targetCalories = TDEE + signed(goalAdjustment). Never Math.abs direction.
 *     The requested weekly weight change is an INITIAL PLANNING estimate
 *     (~7700 kcal/kg), later adjusted from observed client response via the
 *     subordinate adaptation layer (adaptation.ts) — never silently here.
 *  4. Energy target is the MASTER variable: macros fit the target, never the
 *     reverse. Protein is bodyweight-based (1.6 g/kg default, 2.0 g/kg when
 *     fat loss / high training demand warrants priority, 2.2 g/kg absolute
 *     planning ceiling), never a % of calories.
 *  5. Fat floor is a bodyweight-based minimum (0.6 g/kg); preserved even when
 *     the budget is tight.
 *  6. Carbs are the flexible remainder; never negative. If the target cannot
 *     cover protein + fat floor, carbs go to zero and the target is FLAGGED
 *     infeasible instead of producing negative macros.
 *  7. kcal closure: targetCalories ~ protein*4 + carbs*4 + fat*9, once.
 *  8. Round once at the domain output boundary. No round-then-sum.
 *  9. Same input always produces exactly the same output.
 */

import type { Client, NutritionMetrics } from '@/types';

// ============================================================================
// TYPES
// ============================================================================

export type Gender = 'male' | 'female';

export type ActivityLevel =
  | 'sedentary'
  | 'lightly_active'
  | 'moderately_active'
  | 'very_active'
  | 'extra_active';

/** Inputs the engine needs to compute a canonical daily target. */
export interface NutritionProfileInput {
  weightKg: number;
  heightCm: number;
  age: number;
  gender: Gender;
  activityLevel: ActivityLevel;
  primaryGoal: PrimaryGoal;
  weeklyWeightChange?: number;
}

/** Fully reconciled, rounded daily target produced by the engine. */
export interface DailyTarget {
  targetCalories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  fiberGrams: number;
  /**
   * False when the energy target cannot cover the prescribed protein target
   * AND the fat floor. In that case carbohydrate is reduced to zero and the
   * target must be flagged (never "fixed" by producing negative macros).
   */
  isFeasible: boolean;
  /** Deterministic explanation strings; empty when the target is feasible. */
  warnings: string[];
}

/** A macro portion (grams). Calories are derived consistently by the engine. */
export interface MacroPortion {
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
}

/** A resolved macro total that includes the canonical derived calories. */
export interface ResolvedMacros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
}

// ============================================================================
// CONSTANTS (the single energy policy)
// ============================================================================

export const KCAL_PER_G_PROTEIN = 4;
export const KCAL_PER_G_CARBS = 4;
export const KCAL_PER_G_FAT = 9;
/** Fiber is tracked separately and contributes 0 kcal to the closure. */
export const KCAL_PER_G_FIBER = 0;

/** ~7700 kcal is the common energy content of one kg of body-weight change. */
export const KCAL_PER_KG_BODYWEIGHT = 7700;
export const DAYS_PER_WEEK = 7;

/** Mifflin-St Jeor resting expenditure terms. */
const MSJ_WEIGHT = 10;
const MSJ_HEIGHT = 6.25;
const MSJ_AGE = 5;
const MALE_OFFSET = 5;
const FEMALE_OFFSET = -161;

/** Activity multipliers (preserved from the existing app categories). */
export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  lightly_active: 1.375,
  moderately_active: 1.55,
  very_active: 1.725,
  extra_active: 1.9,
};

// ============================================================================
// PROTEIN POLICY (bodyweight coefficient — never a % of calories)
// ============================================================================

export type PrimaryGoal = 'fat_loss' | 'muscle_gain' | 'recomposition' | 'maintenance';

/** All valid primary goals (used by input validation). */
export const PRIMARY_GOALS: readonly PrimaryGoal[] = [
  'fat_loss',
  'muscle_gain',
  'recomposition',
  'maintenance',
] as const;

/**
 * Protein priority level. 'normal' is the default for the general population.
 * 'priority' is reserved for clients whose goal/context warrants greater
 * protein priority (aggressive fat loss or high training demand).
 */
export type ProteinPriority = 'normal' | 'priority';

/** Default protein coefficient: general population (g/kg/day). */
export const PROTEIN_COEFFICIENT_NORMAL_G_PER_KG = 1.6;

/** Elevated protein coefficient: fat loss / high training demand (g/kg/day). */
export const PROTEIN_COEFFICIENT_PRIORITY_G_PER_KG = 2.0;

/**
 * Absolute protein PLANNING CEILING (g/kg/day). Never a default — no client is
 * automatically pushed to this value; it only bounds the coefficient policy.
 */
export const PROTEIN_COEFFICIENT_CEILING_G_PER_KG = 2.2;

/**
 * Deterministic fat floor (g/kg/day): minimum dietary fat prescribed from
 * bodyweight. Preserved even under tight calorie budgets (see reconcileTarget).
 */
export const FAT_FLOOR_G_PER_KG = 0.6;

/**
 * Resolve the protein-priority level from the client's goal and training
 * context. Deterministic:
 *   - fat loss goal            -> 'priority' (aggressive fat loss)
 *   - very/extra active        -> 'priority' (high training demand)
 *   - everything else          -> 'normal'
 */
export function resolveProteinPriority(
  primaryGoal: PrimaryGoal,
  activityLevel: ActivityLevel,
): ProteinPriority {
  if (primaryGoal === 'fat_loss') return 'priority';
  if (activityLevel === 'very_active' || activityLevel === 'extra_active') return 'priority';
  return 'normal';
}

/**
 * Coefficient for a priority level (g/kg/day), bounded by the absolute
 * planning ceiling. The default is 1.6 — clients are NOT automatically pushed
 * to 2.2.
 */
export function proteinCoefficientFor(priority: ProteinPriority): number {
  const base =
    priority === 'priority'
      ? PROTEIN_COEFFICIENT_PRIORITY_G_PER_KG
      : PROTEIN_COEFFICIENT_NORMAL_G_PER_KG;
  return Math.min(base, PROTEIN_COEFFICIENT_CEILING_G_PER_KG);
}

/** Deterministic protein multiplier retained for reference/reporting. */
export const PROTEIN_PRIORITY_COEFFICIENTS: Record<ProteinPriority, number> = {
  normal: PROTEIN_COEFFICIENT_NORMAL_G_PER_KG,
  priority: PROTEIN_COEFFICIENT_PRIORITY_G_PER_KG,
};

/** Default goal adjustments (kcal/day) when no weekly change is requested. */
export const DEFAULT_DEFICIT_KCAL = 550;
export const DEFAULT_SURPLUS_KCAL = 275;

/** Feasibility clamps for a requested daily adjustment relative to TDEE. */
export const MAX_DEFICIT_KCAL = 1150;
export const MAX_SURPLUS_KCAL = 550;

/** Absolute sanity bounds on any generated energy target. */
export const MIN_TARGET_KCAL = 800;
export const MAX_TARGET_KCAL = 12000;

/** Sensible clinical bounds on numeric profile inputs. */
export const MIN_WEIGHT_KG = 20;
export const MAX_WEIGHT_KG = 400;
export const MIN_HEIGHT_CM = 100;
export const MAX_HEIGHT_CM = 250;
export const MIN_AGE = 12;
export const MAX_AGE = 100;

/** Valid weekly weight change magnitude (kg/week). */
export const MAX_WEEKLY_CHANGE_KG = 2;

/** Fiber target policy: 14 g / 1000 kcal, rounded once, never above carbs. */
export const FIBER_G_PER_1000_KCAL = 14;

/** Water intake policy (preserved): 35 ml/kg + activity add-on. */
export const WATER_ML_PER_KG = 35;
export const WATER_ACTIVE_ADD_ML = 1000;
export const WATER_MODERATE_ADD_ML = 500;

// ============================================================================
// INPUT VALIDATION
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** Error thrown when numeric inputs are outside the safe clinical domain. */
export class NutritionInputError extends Error {
  constructor(errors: string[]) {
    super(`Invalid nutrition inputs: ${errors.join('; ')}`);
    this.name = 'NutritionInputError';
  }
}

const hasNonFinite = (value: number): boolean =>
  Number.isNaN(value) || !Number.isFinite(value);

/**
 * Validate numeric inputs before any arithmetic runs. Rejects NaN, Infinity,
 * non-positive, out-of-clinical-range, invalid age, and invalid weekly weight
 * change. Never lets garbage flow into the formula.
 */
export function validateNutritionInput(input: NutritionProfileInput): ValidationResult {
  const errors: string[] = [];

  if (hasNonFinite(input.weightKg)) errors.push('weight must be a finite number');
  else if (input.weightKg <= 0) errors.push('weight must be positive');
  else if (input.weightKg < MIN_WEIGHT_KG || input.weightKg > MAX_WEIGHT_KG)
    errors.push(`weight must be between ${MIN_WEIGHT_KG} and ${MAX_WEIGHT_KG} kg`);

  if (hasNonFinite(input.heightCm)) errors.push('height must be a finite number');
  else if (input.heightCm <= 0) errors.push('height must be positive');
  else if (input.heightCm < MIN_HEIGHT_CM || input.heightCm > MAX_HEIGHT_CM)
    errors.push(`height must be between ${MIN_HEIGHT_CM} and ${MAX_HEIGHT_CM} cm`);

  if (hasNonFinite(input.age)) errors.push('age must be a finite number');
  else if (input.age <= 0) errors.push('age must be positive');
  else if (input.age < MIN_AGE || input.age > MAX_AGE)
    errors.push(`age must be between ${MIN_AGE} and ${MAX_AGE}`);

  if (!PRIMARY_GOALS.includes(input.primaryGoal)) {
    errors.push(`unknown goal: ${String(input.primaryGoal)}`);
  }
  if (!(input.activityLevel in ACTIVITY_FACTORS)) {
    errors.push(`unknown activity level: ${String(input.activityLevel)}`);
  }

  if (input.weeklyWeightChange !== undefined && input.weeklyWeightChange !== null) {
    if (hasNonFinite(input.weeklyWeightChange)) {
      errors.push('weeklyWeightChange must be a finite number');
    } else if (Math.abs(input.weeklyWeightChange) > MAX_WEEKLY_CHANGE_KG) {
      errors.push(`weeklyWeightChange may not exceed +/-${MAX_WEEKLY_CHANGE_KG} kg/week`);
    }
  }

    return { valid: errors.length === 0, errors };
}

// ============================================================================
// RESTING ENERGY (MIFFLIN-ST JEOR)
// ============================================================================

/**
 * BMR = resting energy expenditure via Mifflin-St Jeor.
 *   Male:   10*kg + 6.25*cm - 5*age + 5
 *   Female: 10*kg + 6.25*cm - 5*age - 161
 * Full precision (unrounded) - rounding happens at the domain boundary.
 */
export function calculateBMR(
  weightKg: number,
  heightCm: number,
  age: number,
  gender: Gender,
): number {
  const base = MSJ_WEIGHT * weightKg + MSJ_HEIGHT * heightCm - MSJ_AGE * age;
  return gender === 'male' ? base + MALE_OFFSET : base + FEMALE_OFFSET;
}

/** Activity multiplier fallback (no rounding). */
export function getActivityFactor(activityLevel: ActivityLevel): number {
  return ACTIVITY_FACTORS[activityLevel];
}

/** TDEE = BMR x activity factor (full precision). */
export function calculateTDEE(bmr: number, activityLevel: ActivityLevel): number {
  return bmr * getActivityFactor(activityLevel);
}

// ============================================================================
// ENERGY TARGET
// ============================================================================

/**
 * Daily energy adjustment from a requested weekly weight change.
 * negative weeklyChange => deficit; positive => surplus. Sign is never abs()-ed.
 *
 * This is an INITIAL PLANNING estimate (~7700 kcal per kg of body-weight
 * change). It is NOT a claim that body-weight change is perfectly explained by
 * that constant; the prescription is later adjusted from observed client
 * response by the subordinate adaptation layer (adaptation.ts).
 */
export function dailyEnergyDelta(weeklyWeightChange: number): number {
  return (weeklyWeightChange * KCAL_PER_KG_BODYWEIGHT) / DAYS_PER_WEEK;
}

/**
 * How the energy target was formed — exposed for explainability so the UI can
 * later render WHY a target exists without any nutrition math of its own.
 */
export type EnergyMethod =
  | 'maintenance_tdee'
  | 'tdee_plus_requested_weekly_change'
  | 'tdee_plus_default_goal_adjustment';

/** The signed adjustment plan behind an energy target (pre-clamp values). */
export interface EnergyTargetPlan {
  /** Signed daily adjustment (kcal) BEFORE feasibility clamps are applied. */
  adjustmentKcal: number;
  energyMethod: EnergyMethod;
  /**
   * Effective weekly rate (kg/week, signed) implied by the adjustment.
   * For requested rates this echoes the client's request (sign preserved);
   * for goal defaults it is the rate the conservative default implies.
   */
  weeklyRateKg: number;
}

/**
 * Resolve the signed adjustment behind an energy target WITHOUT applying
 * feasibility clamps. Single source for both the target calculation and the
 * structured explanation output (no duplicated branch logic).
 */
export function resolveEnergyAdjustment(
  goal: PrimaryGoal,
  weeklyWeightChange?: number | null,
): EnergyTargetPlan {
  if (
    weeklyWeightChange !== undefined &&
    weeklyWeightChange !== null &&
    !hasNonFinite(weeklyWeightChange)
  ) {
    return {
      adjustmentKcal: dailyEnergyDelta(weeklyWeightChange),
      energyMethod: 'tdee_plus_requested_weekly_change',
      weeklyRateKg: weeklyWeightChange,
    };
  }
  switch (goal) {
    case 'fat_loss':
      return {
        adjustmentKcal: -DEFAULT_DEFICIT_KCAL,
        energyMethod: 'tdee_plus_default_goal_adjustment',
        weeklyRateKg: (-DEFAULT_DEFICIT_KCAL * DAYS_PER_WEEK) / KCAL_PER_KG_BODYWEIGHT,
      };
    case 'muscle_gain':
      return {
        adjustmentKcal: DEFAULT_SURPLUS_KCAL,
        energyMethod: 'tdee_plus_default_goal_adjustment',
        weeklyRateKg: (DEFAULT_SURPLUS_KCAL * DAYS_PER_WEEK) / KCAL_PER_KG_BODYWEIGHT,
      };
    case 'recomposition':
    case 'maintenance':
    default:
      return { adjustmentKcal: 0, energyMethod: 'maintenance_tdee', weeklyRateKg: 0 };
  }
}

/** Clamp a signed adjustment within feasible bounds. */
function clampAdjustment(goal: PrimaryGoal, delta: number): number {
  if (delta >= 0) return Math.min(delta, MAX_SURPLUS_KCAL);
  return Math.max(delta, -MAX_DEFICIT_KCAL);
}

/** Bound the absolute target so it can never become absurd or negative. */
function clampAbsoluteTarget(target: number): number {
  return Math.max(Math.min(target, MAX_TARGET_KCAL), MIN_TARGET_KCAL);
}

/**
 * Calculate the starting daily calorie target: targetCalories = TDEE + signedDelta.
 *
 * When no weeklyWeightChange is requested, use the explicit conservative
 * defaults per goal (maintenance => TDEE, recomposition => ~maintenance,
 * fat_loss => conservative deficit, muscle_gain => conservative surplus).
 * The sign of the requested weekly change is always preserved.
 */
export function calculateTargetCalories(
  tdee: number,
  goal: PrimaryGoal,
  weeklyWeightChange?: number,
): number {
  const { adjustmentKcal } = resolveEnergyAdjustment(goal, weeklyWeightChange);
  const clamped = clampAdjustment(goal, adjustmentKcal);
  return clampAbsoluteTarget(tdee + clamped);
}

// ============================================================================
// MACRO TARGETS (protein -> fat floor -> carbs -> kcal reconciliation)
// ============================================================================

/** Convert grams to kcal for a single macro. */
export const caloriesFromMacros = (macros: MacroPortion): number =>
  macros.protein * KCAL_PER_G_PROTEIN +
  macros.carbs * KCAL_PER_G_CARBS +
  macros.fat * KCAL_PER_G_FAT;

/**
 * Daily protein target from body-weight (g/day), full precision. Protein is a
 * bodyweight-based target and never a fraction of calories. The coefficient
 * comes from the protein-priority policy (1.6 default / 2.0 priority, capped
 * at the 2.2 planning ceiling).
 */
export function calculateProteinTarget(weightKg: number, priority: ProteinPriority): number {
  return weightKg * proteinCoefficientFor(priority);
}

/**
 * Daily fat floor (g/day) from body-weight. Fat is a FLOOR, not a percentage
 * target: it is secured after protein and is never deliberately prescribed
 * below it (a lower intake would require an explicit professional override,
 * which this engine does not produce).
 */
export function calculateFatFloor(weightKg: number): number {
  return weightKg * FAT_FLOOR_G_PER_KG;
}

/**
 * Reconcile a daily target against the energy budget exactly once, rounding
 * a single time at the domain boundary.
 *
 * Strategy (deterministic, energy target is the MASTER variable):
 *   1. proteinGrams = floor(bodyweight x protein coefficient)  [preserved]
 *   2. fatGrams     = floor(bodyweight x 0.6)                  [floor preserved]
 *   3. carbsGrams   = floor((target - proteinKcal - fatKcal) / 4), never < 0.
 *   4. If protein + fat kcal exceed the target, the discretionary carbohydrate
 *      allocation is reduced to zero and the target is FLAGGED infeasible —
 *      protein and fat minimums are preserved rather than producing negative
 *      macros or silently shrinking the prescription.
 *
 * Result: for feasible targets, protein + fat + carbs kcal is within one gram
 * (< 4 kcal) of target; macros are always >= 0 and finite; the same input is
 * always identical.
 */
export function reconcileTarget(
  targetCalories: number,
  weightKg: number,
  priority: ProteinPriority,
): DailyTarget {
  const proteinGrams = Math.floor(calculateProteinTarget(weightKg, priority));
  const fatGrams = Math.floor(calculateFatFloor(weightKg));

  const proteinKcal = proteinGrams * KCAL_PER_G_PROTEIN;
  const fatKcal = fatGrams * KCAL_PER_G_FAT;

  const remaining = targetCalories - proteinKcal - fatKcal;
  // carbs = flexible remainder; never negative.
  const carbsGrams = remaining > 0 ? Math.floor(remaining / KCAL_PER_G_CARBS) : 0;

  const warnings: string[] = [];
  if (remaining < 0) {
    warnings.push(
      `energy target of ${targetCalories} kcal cannot cover the prescribed protein ` +
        `(${proteinGrams} g) and the fat floor (${fatGrams} g); the discretionary ` +
        `carbohydrate allocation was reduced to zero`,
    );
  }

  const fiberGrams = calculateFiberGrams(targetCalories, carbsGrams);

  return {
    targetCalories,
    proteinGrams,
    carbsGrams,
    fatGrams,
    fiberGrams,
    isFeasible: remaining >= 0,
    warnings,
  };
}

/**
 * Round a calorie figure to the nearest whole number (single boundary round).
 */
export function roundKcal(kcal: number): number {
  return Math.round(kcal);
}

/**
 * Convenience: compute the full reconciled daily target from raw inputs,
 * validating first and throwing NutritionInputError on invalid input.
 */
export function computeDailyTargets(input: NutritionProfileInput): DailyTarget {
  const { valid, errors } = validateNutritionInput(input);
  if (!valid) throw new NutritionInputError(errors);

  const bmr = calculateBMR(input.weightKg, input.heightCm, input.age, input.gender);
  const tdee = calculateTDEE(bmr, input.activityLevel);
  const targetCalories = calculateTargetCalories(tdee, input.primaryGoal, input.weeklyWeightChange);
  const priority = resolveProteinPriority(input.primaryGoal, input.activityLevel);
  return reconcileTarget(targetCalories, input.weightKg, priority);
}

// ============================================================================
// FIBER & WATER
// ============================================================================

/**
 * Daily fiber target: exactly 14 g per 1000 kcal of the energy target
 * (rounded once), never exceeding the available carbohydrate grams — fiber is
 * reported as a subset of carbohydrate (net-carb accounting), never
 * manufactured by altering the carbohydrate target.
 */
export function calculateFiberGrams(targetCalories: number, carbGrams: number): number {
  const fromCalories = Math.floor((targetCalories / 1000) * FIBER_G_PER_1000_KCAL);
  // Fiber cannot exceed total carbohydrate.
  return Math.max(0, Math.min(fromCalories, carbGrams));
}

/**
 * Hydration target (L): 35 ml/kg base plus a modest activity add-on.
 * Preserved from the original application policy. Output is liters, rounded.
 */
export function calculateWaterIntake(
  weightKg: number,
  activityLevel: ActivityLevel,
): number {
  const baseMl = weightKg * WATER_ML_PER_KG;
  const addMl =
    activityLevel === 'very_active' || activityLevel === 'extra_active'
      ? WATER_ACTIVE_ADD_ML
      : activityLevel === 'moderately_active'
      ? WATER_MODERATE_ADD_ML
      : 0;
  return Math.round((baseMl + addMl) / 1000);
}

// ============================================================================
// FULL PROFILE (CLIENT -> NutritionMetrics)
// ============================================================================

/**
 * Full canonical profile: BMR + TDEE + energy target + reconciled macros + fiber
 * + water. Output calories are single-boundary rounded; macro grams are rounded
 * within reconcileTarget. Same input always yields identical output.
 */
export function calculateProfile(input: NutritionProfileInput): NutritionMetrics {
  const decision = resolveNutritionDecision(input);
  return {
    bmr: decision.energy.bmr,
    tdee: decision.energy.tdee,
    targetCalories: decision.energy.targetCalories,
    proteinGrams: decision.macros.proteinGrams,
    carbsGrams: decision.macros.carbsGrams,
    fatGrams: decision.macros.fatGrams,
    fiberGrams: decision.nutrition.fiberGrams,
    waterLiters: decision.nutrition.waterLiters,
  };
}

// ============================================================================
// STRUCTURED DECISION OUTPUT (explainability — sections S/T)
// ============================================================================

/**
 * Express a signed weekly rate (kg/week) as a percentage of bodyweight.
 * A -1 kg/week target is NOT equally appropriate for a 50 kg and a 120 kg
 * client; this exposes the relative magnitude for later validation of whether
 * a requested rate is reasonable. Rounded to 4 decimals for stable output.
 */
export function weeklyRateAsPercentBodyweight(weeklyRateKg: number, weightKg: number): number {
  if (!Number.isFinite(weeklyRateKg) || !Number.isFinite(weightKg) || weightKg <= 0) return 0;
  return Math.round((weeklyRateKg / weightKg) * 100 * 10000) / 10000;
}

/** Energy block of the structured decision (all values single-boundary rounded). */
export interface NutritionEnergyDetail {
  bmr: number;
  tdee: number;
  targetCalories: number;
  /** Effective signed daily delta actually applied (targetCalories - tdee). */
  dailyDelta: number;
}

export interface NutritionMacrosDetail {
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
}

export interface NutritionSupportDetail {
  fiberGrams: number;
  waterLiters: number;
}

/** Deterministic, machine-readable explanation of HOW each target was formed. */
export interface NutritionMethodDetail {
  energyMethod: EnergyMethod;
  proteinMethod: 'bodyweight_coefficient';
  fatMethod: 'bodyweight_fat_floor';
  carbohydrateMethod: 'calorie_remainder';
}

export interface NutritionFeasibilityDetail {
  isFeasible: boolean;
  warnings: readonly string[];
}

/** Requested/implied weekly rate, in kg/week and as % of bodyweight. */
export interface NutritionRateDetail {
  weeklyRateKg: number;
  weeklyRatePercentBodyweight: number;
}

/**
 * The full structured nutrition decision for a client. Contains everything the
 * UI needs to explain WHY a target exists ("Target calories: 2,209 kcal based
 * on an estimated TDEE of 2,759 kcal with a planned 0.5 kg/week reduction")
 * without generating prose inside the engine.
 */
export interface NutritionDecision {
  energy: NutritionEnergyDetail;
  macros: NutritionMacrosDetail;
  nutrition: NutritionSupportDetail;
  method: NutritionMethodDetail;
  feasibility: NutritionFeasibilityDetail;
  rate: NutritionRateDetail;
  proteinPriority: ProteinPriority;
  proteinCoefficientGPerKg: number;
  fatFloorCoefficientGPerKg: number;
}

/**
 * Resolve the complete canonical nutrition decision from raw inputs:
 * energy (BMR -> TDEE -> master energy target) + macros (protein coefficient ->
 * fat floor -> carbohydrate remainder) + fiber/water + method metadata +
 * feasibility flags + the requested weekly rate expressed relative to
 * bodyweight. Pure and deterministic; throws NutritionInputError on invalid
 * input.
 */
export function resolveNutritionDecision(input: NutritionProfileInput): NutritionDecision {
  const { valid, errors } = validateNutritionInput(input);
  if (!valid) throw new NutritionInputError(errors);

  const bmr = roundKcal(calculateBMR(input.weightKg, input.heightCm, input.age, input.gender));
  const tdee = roundKcal(calculateTDEE(bmr, input.activityLevel));
  const plan = resolveEnergyAdjustment(input.primaryGoal, input.weeklyWeightChange);
  const targetCalories = calculateTargetCalories(
    tdee,
    input.primaryGoal,
    input.weeklyWeightChange,
  );

  const priority = resolveProteinPriority(input.primaryGoal, input.activityLevel);
  const daily = reconcileTarget(targetCalories, input.weightKg, priority);
  const waterLiters = calculateWaterIntake(input.weightKg, input.activityLevel);

  return {
    energy: {
      bmr,
      tdee,
      targetCalories: daily.targetCalories,
      dailyDelta: daily.targetCalories - tdee,
    },
    macros: {
      proteinGrams: daily.proteinGrams,
      carbsGrams: daily.carbsGrams,
      fatGrams: daily.fatGrams,
    },
    nutrition: {
      fiberGrams: daily.fiberGrams,
      waterLiters,
    },
    method: {
      energyMethod: plan.energyMethod,
      proteinMethod: 'bodyweight_coefficient',
      fatMethod: 'bodyweight_fat_floor',
      carbohydrateMethod: 'calorie_remainder',
    },
    feasibility: {
      isFeasible: daily.isFeasible,
      warnings: daily.warnings,
    },
    rate: {
      weeklyRateKg: plan.weeklyRateKg,
      weeklyRatePercentBodyweight: weeklyRateAsPercentBodyweight(
        plan.weeklyRateKg,
        input.weightKg,
      ),
    },
    proteinPriority: priority,
    proteinCoefficientGPerKg: proteinCoefficientFor(priority),
    fatFloorCoefficientGPerKg: FAT_FLOOR_G_PER_KG,
  };
}

// ============================================================================
// AGE DERIVATION
// ============================================================================

/**
 * Derive whole-year age from an ISO date of birth at an optional "now" date.
 * Pure and deterministic given the same inputs.
 */
export function ageFromBirthDate(birthDate: string, now: Date = new Date()): number {
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return 0;
  let age = now.getFullYear() - birth.getFullYear();
  const hasHadBirthdayThisYear =
    now.getMonth() > birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() >= birth.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

/**
 * Client-facing shortcut: build canonical NutritionMetrics from an app Client.
 * Falls back to deriving age from birthDate when the Client's own age is absent.
 */
export function calculateNutritionMetrics(client: Client): NutritionMetrics {
  const age = client.age ?? ageFromBirthDate(client.birthDate);
  const input: NutritionProfileInput = {
    weightKg: client.weight,
    heightCm: client.height,
    age,
    gender: client.gender,
    activityLevel: client.activityLevel,
    primaryGoal: client.primaryGoal,
    weeklyWeightChange: client.weeklyWeightChange,
  };
  return calculateProfile(input);
}

/**
 * Map an application Client to the canonical NutritionProfileInput. Field
 * mapping is identical to `calculateNutritionMetrics` (age falls back to
 * birthDate). Single canonical input mapping for every consumer.
 */
export function buildNutritionProfileInput(client: Client): NutritionProfileInput {
  return {
    weightKg: client.weight,
    heightCm: client.height,
    age: client.age ?? ageFromBirthDate(client.birthDate),
    gender: client.gender,
    activityLevel: client.activityLevel,
    primaryGoal: client.primaryGoal,
    weeklyWeightChange: client.weeklyWeightChange,
  };
}

// ============================================================================
// INGREDIENT / RECIPE HELPERS (deterministic scaling)
// ============================================================================

/**
 * Scale any macro set by a positive factor, rounding gram outputs once at the
 * boundary. Throws NutritionInputError on NaN/negative factors.
 */
export function scaleIngredientMacros(macros: MacroPortion, scaleFactor: number): MacroPortion {
  if (!Number.isFinite(scaleFactor) || scaleFactor < 0) {
    throw new NutritionInputError([`invalid scaleFactor: ${scaleFactor}`]);
  }
  return {
    protein: Math.round(macros.protein * scaleFactor),
    carbs: Math.round(macros.carbs * scaleFactor),
    fat: Math.round(macros.fat * scaleFactor),
    fiber: macros.fiber !== undefined ? Math.round(macros.fiber * scaleFactor) : undefined,
  };
}

/** Sum an arbitrary list of macro portions into one resolved total. */
export function sumMacros(macros: MacroPortion[]): ResolvedMacros {
  const total = macros.reduce(
    (acc, m) => ({
      protein: acc.protein + m.protein,
      carbs: acc.carbs + m.carbs,
      fat: acc.fat + m.fat,
      fiber: (acc.fiber ?? 0) + (m.fiber ?? 0),
    }),
    { protein: 0, carbs: 0, fat: 0, fiber: 0 },
  );
  return {
    calories: caloriesFromMacros(total),
    protein: total.protein,
    carbs: total.carbs,
    fat: total.fat,
    fiber: total.fiber,
  };
}

/** Sum ingredient-level servings of a single recipe into resolved macros. */
export function aggregatePortions(portions: MacroPortion[]): ResolvedMacros {
  return sumMacros(portions);
}

/**
 * Verify an ingredient's declared macros are consistent with its declared
 * calories (tolerance allows for fiber/indigestible energy gaps). Returns true
 * when the macros reconcile to within tolerance kcal.
 */
export function validateIngredientEnergy(
  macros: MacroPortion & { calories?: number },
): boolean {
  const declared = macros.calories ?? caloriesFromMacros(macros);
  const derived = caloriesFromMacros(macros);
  return Math.abs(declared - derived) <= 2;
}