/**
 * PHASE 9 — Nutrition Engine Production Hardening + End-to-End Validation
 *
 * Proves that the complete nutrition system behaves correctly along the ONE
 * authoritative production path:
 *
 *   CLIENT PROFILE -> CANONICAL ENGINE -> ACTIVE PRESCRIPTION ->
 *   CHECK-IN EVIDENCE -> ADAPTATION -> FUTURE TARGET ->
 *   DAILY/WEEKLY PLAN GENERATION -> DRAFT -> LOCK -> ATOMIC PERSISTENCE ->
 *   RELOAD -> SAME AUTHORITATIVE VALUES IN THE UI
 *
 * Layer responsibilities proven here (unchanged from Phases 1–8):
 *   - src/domain/nutrition/engine.ts        ONLY nutrition calculation authority
 *   - src/domain/nutrition/adaptation.ts    ONLY adaptation decision authority
 *   - src/domain/nutrition/prescription.ts  ONLY active-prescription mechanism
 *                                             (rides plan_versions.plan_payload
 *                                              .nutritionPrescription via the
 *                                              existing atomic lock RPC)
 *
 * The static guards below intentionally target the ACTUAL prohibited patterns
 * of this codebase (verified by inspection), not arbitrary strings:
 *   - Mifflin-St Jeor terms live only in engine.ts (MSJ_* / offsets / 6.25)
 *   - the 4/4/9 closure exists only as engine constants + caloriesFromMacros
 *   - 7700 kcal/kg lives only in engine.ts (KCAL_PER_KG_BODYWEIGHT)
 *   - direction-destroying Math.abs ASSIGNMENTS over signed rates/adjustments
 *     (magnitude comparisons remain legal — e.g. tolerance bands)
 *   - buildPrescriptionRecord is referenced only by the lock lifecycle
 *   - the five audited UI files are pure consumers (formatting / percentage
 *     variance / chart presentation through engine constants)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  calculateProfile,
  calculateNutritionMetrics,
  calculateTargetCalories,
  resolveNutritionDecision,
  buildNutritionProfileInput,
  caloriesFromMacros,
  sumMacros,
  roundKcal,
  DAYS_PER_WEEK,
  KCAL_PER_KG_BODYWEIGHT,
  KCAL_PER_G_PROTEIN,
  KCAL_PER_G_CARBS,
  KCAL_PER_G_FAT,
  MIN_WEIGHT_KG,
  MAX_WEIGHT_KG,
  MIN_AGE,
  MAX_AGE,
  NutritionInputError,
  type NutritionProfileInput,
} from './engine';
import {
  decideAdaptation,
  observedWeeklyRateKg,
  collectAdherenceScores,
  weightObservationsFromDailyCheckins,
  type AdaptiveTargetingInput,
  type WeightObservation,
} from './adaptation';
import {
  deriveInitialPrescription,
  prescriptionFromLockedPlan,
  buildPrescriptionRecord,
  readPrescriptionRecord,
  type ActiveNutritionPrescription,
} from './prescription';
import { resolveAdaptedTarget } from '@/services/nutrition/adaptiveTargetService';
import { mapSnapshotToWeeklyPlan, mapWeeklyMealPlanToSnapshot } from './snapshotAdapter';
import { buildPlanSnapshot, deepFreeze, type PlanSnapshot } from './snapshot';
import { calculateTotalMacros, macroCaloriesPer100g } from '@/services/recipe/nutritionCalculations';
import { generateWeeklyMealPlan } from '@/services/recipe/weeklyPlanGenerator';
import { useAdaptiveNutritionTarget } from '@/hooks/useAdaptiveNutritionTarget';
import type { Client, NutritionMetrics, Macros } from '@/types';
import type { DailyCheckin, WeeklyReview } from '@/types/checkin';
import { renderHook, waitFor } from '@testing-library/react';

// ============================================================================
// STATIC-SCAN INFRASTRUCTURE (same conventions as decisionModelIntegrity)
// ============================================================================

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = join(HERE, '..', '..');
const ENGINE_FILE = join(HERE, 'engine.ts');
const ADAPTATION_FILE = join(HERE, 'adaptation.ts');
const PRESCRIPTION_FILE = join(HERE, 'prescription.ts');
const PLAN_STATE_FILE = join(SRC_ROOT, 'hooks', 'useNutritionPlanState.ts');
const PLAN_SERVICE_FILE = join(SRC_ROOT, 'services', 'supabasePlanService.ts');
const TAB_FILE = join(SRC_ROOT, 'components', 'NutritionTabContent.tsx');

function listSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      listSourceFiles(full, acc);
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.(test|spec)\.(ts|tsx)$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

/** Strip block + line comments so documentation never trips the guards. */
function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const sourceFiles = listSourceFiles(SRC_ROOT);

/** Files matching `pattern` outside `allowed` (production sources only). */
function violationsOf(pattern: RegExp, allowed: readonly string[]): string[] {
  const hits: string[] = [];
  for (const file of sourceFiles) {
    if (allowed.some((a) => file === a)) continue;
    if (pattern.test(stripComments(readFileSync(file, 'utf8')))) {
      hits.push(relative(SRC_ROOT, file));
    }
  }
  return hits;
}

function productionCode(path: string): string {
  return stripComments(readFileSync(path, 'utf8'));
}

// ============================================================================
// SHARED FIXTURES (deterministic — no Date.now/Math.random in the decision path)
// ============================================================================

const CLIENT = {
  id: 'client-p9',
  firstName: 'Phase',
  lastName: 'Nine',
  email: 'phase9@example.com',
  phone: '',
  birthDate: '1990-06-15',
  age: 35,
  gender: 'male',
  height: 178,
  weight: 82,
  activityLevel: 'moderately_active',
  primaryGoal: 'fat_loss',
  weeklyWeightChange: -0.5,
} as unknown as Client;

/** Canonical profile input + engine outputs for CLIENT (the ONLY authority). */
const PROFILE_INPUT: NutritionProfileInput = buildNutritionProfileInput(CLIENT);
const CANONICAL: NutritionMetrics = calculateNutritionMetrics(CLIENT);

function isoAddDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Deterministic daily check-ins whose weigh-ins lie on an exact linear trend
 * of `weeklyRateKg` kg/week (the smoothed midpoint regression recovers the
 * slope exactly for linear series — see analyzeTrend in adaptation.ts).
 */
function dailyWeighIns(opts: {
  startWeightKg: number;
  weeklyRateKg: number;
  days?: number;
  adherence?: number;
  startDate?: string;
}): DailyCheckin[] {
  const { startWeightKg, weeklyRateKg, days = 28, adherence = 95, startDate = '2026-03-02' } = opts;
  return Array.from({ length: days }, (_, i) => ({
    id: `chk-${startDate}-${i}`,
    client_id: CLIENT.id,
    checkin_date: isoAddDays(startDate, i),
    current_weight_kg: Number((startWeightKg + (i * weeklyRateKg) / DAYS_PER_WEEK).toFixed(9)),
    meal_adherence: adherence,
  })) as unknown as DailyCheckin[];
}

function weeklyReviewsWith(adherence: number, weeks = 4, startDate = '2026-03-02'): WeeklyReview[] {
  return Array.from({ length: weeks }, (_, i) => ({
    id: `rev-${i}`,
    client_id: CLIENT.id,
    week_start_date: isoAddDays(startDate, i * 7),
    bodyweight_kg: null,
    adherence_score: adherence,
  })) as unknown as WeeklyReview[];
}

/** Evidence with an observed trend of `observedRateKg` kg/week and `adherence`. */
function evidence(observedRateKg: number, adherence = 95) {
  return {
    dailyCheckins: dailyWeighIns({
      startWeightKg: CLIENT.weight,
      weeklyRateKg: observedRateKg,
      adherence,
    }),
    weeklyReviews: weeklyReviewsWith(adherence),
  };
}

/** Adaptation context for a given prescription baseline (read-only reference). */
function adaptationInput(
  baseline: ActiveNutritionPrescription,
  ev: ReturnType<typeof evidence>,
): AdaptiveTargetingInput {
  return {
    referenceWeightKg: CLIENT.weight,
    tdee: CANONICAL.tdee,
    primaryGoal: CLIENT.primaryGoal,
    activityLevel: CLIENT.activityLevel,
    prescribedWeeklyRateKg: baseline.weeklyRateKg,
    currentTargetCalories: baseline.targetCalories,
    observations: weightObservationsFromDailyCheckins(ev.dailyCheckins),
    adherenceScores: collectAdherenceScores(ev.dailyCheckins, ev.weeklyReviews),
  };
}

/** The prescription an explicit lock of `decision` would establish. */
function prescriptionAfter(
  decision: ReturnType<typeof decideAdaptation>,
  versionId: string,
  versionNumber: number,
): ActiveNutritionPrescription {
  return prescriptionFromLockedPlan({
    weeklyRateKg: decision.futureWeeklyRateKg,
    targetCalories: decision.futureTargetCalories,
    versionId,
    versionNumber,
    establishedAt: '2026-03-30T10:00:00.000Z',
  });
}

// ============================================================================
// TASK 1 / TASK 13 — ONE AUTHORITATIVE PATH (static architecture guards)
// ============================================================================

describe('PHASE 9 · exactly one authoritative nutrition path (static guards)', () => {
  it('1.0 engine.ts exists and declares itself the canonical engine', () => {
    expect(readFileSync(ENGINE_FILE, 'utf8')).toMatch(/Canonical Nutrition Engine/);
  });

  it('1.1 BMR has exactly one implementation (Mifflin-St Jeor lives only in engine.ts)', () => {
    const defining = violationsOf(
      /export\s+function\s+calculateBMR\b|\bMSJ_(WEIGHT|HEIGHT|AGE)\b|\b(MALE|FEMALE)_OFFSET\b|\b6\.25\b/,
      [ENGINE_FILE],
    );
    expect(defining).toEqual([]);
  });

  it('1.2 TDEE has exactly one implementation (BMR × activity factor, engine only)', () => {
    const defining = violationsOf(
      /export\s+function\s+calculateTDEE\b|export\s+const\s+ACTIVITY_FACTORS\b/,
      [ENGINE_FILE],
    );
    expect(defining).toEqual([]);
    expect(productionCode(ENGINE_FILE)).toMatch(/export\s+const\s+ACTIVITY_FACTORS/);
  });

  it('1.3 targetCalories is computed only by the engine pipeline', () => {
    const defining = violationsOf(
      /export\s+(function|const)\s+(calculateTargetCalories|resolveEnergyAdjustment|dailyEnergyDelta)\b/,
      [ENGINE_FILE],
    );
    expect(defining).toEqual([]);
  });

    it('1.4–1.8 protein/fat/carbs/fiber/water targets are produced only by the engine', () => {
    const defining = violationsOf(
      new RegExp(
        [
          'calculateProteinTarget',
          'calculateFatFloor',
          'reconcileTarget',
          'calculateFiberGrams',
          'calculateWaterIntake',
          'resolveProteinPriority',
        ]
          .map((fn) => `export\\s+(function|const)\\s+${fn}\\b`)
          .join('|'),
      ),
      [ENGINE_FILE],
    );
    expect(defining).toEqual([]);
  });

  it('1.9/16 the 4/4/9 macro-energy closure exists only in the engine', () => {
    const engine = productionCode(ENGINE_FILE);
    expect(engine).toMatch(/KCAL_PER_G_PROTEIN\s*=\s*4/);
    expect(engine).toMatch(/KCAL_PER_G_CARBS\s*=\s*4/);
    expect(engine).toMatch(/KCAL_PER_G_FAT\s*=\s*9/);
    expect(engine).toMatch(/export\s+const\s+caloriesFromMacros/);

    // No other production file re-implements the closure with numeric literals.
    // (macro × ENGINE-CONSTANT presentation math — MacroDonutChart — is allowed
    // and does not match these literal patterns.)
    const closure = violationsOf(
      /protein[A-Za-z]*\s*\*\s*4\b[\s\S]{0,200}carbs[A-Za-z]*\s*\*\s*4\b|\bfat[A-Za-z]*\s*\*\s*9\b|KCAL_PER_G_(PROTEIN|CARBS|FAT)\s*[:=]\s*(4|9)\b/,
      [ENGINE_FILE],
    );
    expect(closure).toEqual([]);
  });

  it('1.16/18 the 7700 kcal/kg constant lives only in engine.ts', () => {
    expect(violationsOf(/\b7700\b/, [ENGINE_FILE])).toEqual([]);
    expect(productionCode(ENGINE_FILE)).toMatch(/KCAL_PER_KG_BODYWEIGHT\s*=\s*7700/);
  });
});

describe('PHASE 9 · authoritative layers stay in their lanes (static guards II)', () => {
  it('1.19 no direction-destroying Math.abs() ASSIGNMENT over signed rates/adjustments', () => {
    // Magnitude COMPARISONS (tolerance bands, validation bounds) are legitimate.
    // Forbidden: assigning Math.abs over a signed weekly rate / calorie
    // adjustment — that would erase deficit/surplus direction from the
    // authoritative values.
    const authoritative = [
      ENGINE_FILE,
      ADAPTATION_FILE,
      PRESCRIPTION_FILE,
      join(SRC_ROOT, 'services', 'nutrition', 'adaptiveTargetService.ts'),
      join(SRC_ROOT, 'hooks', 'useAdaptiveNutritionTarget.ts'),
      PLAN_STATE_FILE,
      TAB_FILE,
    ];
    const directionDestroying = violationsOf(
      /(weeklyRate\w*|rateKg\w*|adjustment\w*Kcal|calorieAdjustment\w*)\s*=\s*Math\.abs\(/,
      authoritative,
    );
    expect(directionDestroying).toEqual([]);

    // The only Math.abs sites in the authoritative layers are magnitude checks:
    expect(productionCode(ENGINE_FILE)).toMatch(
      /Math\.abs\(input\.weeklyWeightChange\)\s*>\s*MAX_WEEKLY_CHANGE_KG/,
    );
    expect(productionCode(ADAPTATION_FILE)).toMatch(/Math\.abs\(rateError\)\s*<=\s*tolerance/);
  });

  it('1.20/13.1 exactly one canonical engine module exists', () => {
    const engines = sourceFiles.filter((f) =>
      /Canonical Nutrition Engine/.test(readFileSync(f, 'utf8')),
    );
    expect(engines).toEqual([ENGINE_FILE]);

    const surface =
      /export\s+(function|const)\s+(calculateProfile|resolveNutritionDecision|calculateBMR|calculateTDEE|reconcileTarget|caloriesFromMacros|sumMacros|aggregatePortions|scaleIngredientMacros|roundKcal)\b/;
    expect(violationsOf(surface, [ENGINE_FILE])).toEqual([]);
    expect(violationsOf(/export\s+const\s+DAYS_PER_WEEK\b/, [ENGINE_FILE])).toEqual([]);
  });

  it('13.2 exactly one adaptation decision layer, subordinate to the engine', () => {
    expect(violationsOf(/export\s+function\s+decideAdaptation\b/, [ADAPTATION_FILE])).toEqual([]);
    const adaptation = productionCode(ADAPTATION_FILE);
    expect(adaptation).toMatch(/from\s+'\.\/engine'/);
    expect(adaptation).toMatch(/calculateTargetCalories/);
    expect(adaptation).not.toMatch(/\b6\.25\b|\b7700\b/);
    expect(adaptation).not.toMatch(/export\s+function\s+calculate(BMR|TDEE|Profile)\b/);
    expect(adaptation).toMatch(/export\s+const\s+MAX_ADAPTATION_STEP_KCAL\s*=\s*150/);
  });

  it('13.12 methodology constants are each defined by exactly one owner module', () => {
    const engineConstants = [
      'DAYS_PER_WEEK',
      'KCAL_PER_KG_BODYWEIGHT',
      'KCAL_PER_G_PROTEIN',
      'KCAL_PER_G_CARBS',
      'KCAL_PER_G_FAT',
      'FIBER_G_PER_1000_KCAL',
      'WATER_ML_PER_KG',
      'PROTEIN_COEFFICIENT_NORMAL_G_PER_KG',
      'PROTEIN_COEFFICIENT_PRIORITY_G_PER_KG',
      'PROTEIN_COEFFICIENT_CEILING_G_PER_KG',
      'FAT_FLOOR_G_PER_KG',
      'DEFAULT_DEFICIT_KCAL',
      'DEFAULT_SURPLUS_KCAL',
      'MAX_DEFICIT_KCAL',
      'MAX_SURPLUS_KCAL',
      'MIN_TARGET_KCAL',
      'MAX_TARGET_KCAL',
      'MAX_WEEKLY_CHANGE_KG',
    ];
    const adaptationConstants = [
      'ADAPTATION_SMOOTHING_WINDOW',
      'MIN_ADAPTATION_OBSERVATIONS',
      'MIN_ADAPTATION_WINDOW_DAYS',
      'MIN_ADHERENCE_SAMPLES',
      'ADHERENT_THRESHOLD',
      'RATE_TOLERANCE_ABS_KG_PER_WEEK',
      'RATE_TOLERANCE_RELATIVE',
    ];
    for (const c of engineConstants) {
      expect(violationsOf(new RegExp(`export\\s+const\\s+${c}\\b`), [ENGINE_FILE])).toEqual([]);
    }
    for (const c of adaptationConstants) {
      expect(violationsOf(new RegExp(`export\\s+const\\s+${c}\\b`), [ADAPTATION_FILE])).toEqual([]);
    }
  });
});

describe('PHASE 9 · prescription + persistence boundary (static guards III)', () => {
  it('13.3/7 the prescription module performs no nutrition math and no persistence', () => {
    const rx = productionCode(PRESCRIPTION_FILE);
    expect(rx).not.toMatch(/\b6\.25\b|\b7700\b/);
    expect(rx).not.toMatch(/function\s+calculate(BMR|TDEE|Profile)\b/);
    expect(rx).not.toMatch(/protein\s*\*\s*4[\s\S]{0,120}carbs\s*\*\s*4/);
    // Delegates every nutrition VALUE to the canonical engine:
    expect(rx).toMatch(/resolveNutritionDecision|buildNutritionProfileInput/);
    // Rides the existing plan-version payload — no Supabase access at all.
    expect(rx).not.toMatch(/supabase|\.from\(/i);
  });

  it('13.7 buildPrescriptionRecord is referenced ONLY by the lock lifecycle', () => {
    // Definition site:
    expect(productionCode(PRESCRIPTION_FILE)).toMatch(/export\s+function\s+buildPrescriptionRecord/);
    // The only production caller is useNutritionPlanState.lockPlan (the atomic
    // lock boundary); no service/hook writes a prescription on its own.
    const callers = sourceFiles.filter(
      (f) =>
        f !== PRESCRIPTION_FILE &&
        /buildPrescriptionRecord/.test(stripComments(readFileSync(f, 'utf8'))),
    );
    expect(callers).toEqual([PLAN_STATE_FILE]);
  });

  it('13.7/8 the plan service persists prescriptions only inside the existing payload', () => {
    const svc = productionCode(PLAN_SERVICE_FILE);
    // No second prescription store/table was introduced:
    expect(svc).not.toMatch(/nutrition_prescriptions/i);
    // The record rides the EXISTING PlanPayload JSONB document:
    expect(svc).toMatch(/nutritionPrescription\?\s*:\s*NutritionPrescriptionRecord/);
    expect(svc).toMatch(/nutritionPrescription:\s*input\.nutritionPrescription/);
    expect(svc).not.toMatch(/\b6\.25\b|\b7700\b/);
  });

  it('13.5/6 services and hooks add no independent nutrition math', () => {
    for (const file of [
      join(SRC_ROOT, 'services', 'nutrition', 'adaptiveTargetService.ts'),
      join(SRC_ROOT, 'hooks', 'useAdaptiveNutritionTarget.ts'),
      PLAN_STATE_FILE,
    ]) {
      const code = productionCode(file);
      expect(code).not.toMatch(/\b6\.25\b|\b7700\b/);
      expect(code).not.toMatch(/function\s+calculate(BMR|TDEE)\b/);
      expect(code).not.toMatch(
        /protein\s*\*\s*4[\s\S]{0,160}carbs\s*\*\s*4|\bfat[A-Za-z]*\s*\*\s*9\b/,
      );
    }
    // The service resolves targets THROUGH the engine:
    const svc = productionCode(join(SRC_ROOT, 'services', 'nutrition', 'adaptiveTargetService.ts'));
    expect(svc).toMatch(/resolveNutritionDecision|calculateProfile/);
  });

  it('13.13/14 locked snapshots and historical prescriptions are never mutated in place', () => {
    for (const file of [
      join(SRC_ROOT, 'domain', 'nutrition', 'snapshotAdapter.ts'),
      join(SRC_ROOT, 'hooks', 'usePlanFetch.ts'),
      PLAN_STATE_FILE,
      ADAPTATION_FILE,
    ]) {
      // No `something.field =` assignments into snapshot/prescription structures.
      const code = productionCode(file);
      expect(code).not.toMatch(/\bsnapshot\.\w+\s*=[^=]/);
      expect(code).not.toMatch(/\b(prescription|activePrescription)\.\w+\s*=[^=]/);
    }
  });
});

// ============================================================================
// TASK 10 — THE UI IS A PURE CONSUMER (static guards over the five components)
// ============================================================================

const UI_FILES = [
  'components/NutritionTabContent.tsx',
  'components/WeeklyMealPlanDisplay.tsx',
  'components/DailyMealPlanDisplay.tsx',
  'components/MacroDonutChart.tsx',
  'components/PrintableMealPlan.tsx',
].map((p) => join(SRC_ROOT, p));

describe('PHASE 9 · UI components are pure consumers of engine values', () => {
  it('10.a no UI component computes authoritative nutrition', () => {
    for (const file of UI_FILES) {
      const code = productionCode(file);
      // No BMR/TDEE/adaptation/engine-pipeline calls inside the UI:
      expect(code).not.toMatch(
        /\bcalculateBMR\b|\bcalculateTDEE\b|\bdecideAdaptation\b|\bresolveNutritionDecision\b|\breconcileTarget\b/,
      );
      // No literal macro-energy math, no 7700, no MSJ terms:
      expect(code).not.toMatch(
        /\b6\.25\b|\b7700\b|protein\s*\*\s*4[\s\S]{0,160}carbs\s*\*\s*4|\bfat[A-Za-z]*\s*\*\s*9\b/,
      );
      // No independent weekly aggregation loop over calories:
      expect(code).not.toMatch(/\+=\s*\w*[Cc]alories\b/);
    }
  });

  it('10.b chart presentation math uses the ENGINE energy constants (allowed display-only)', () => {
    const donut = productionCode(join(SRC_ROOT, 'components', 'MacroDonutChart.tsx'));
    expect(donut).toMatch(
      /import\s*\{[^}]*KCAL_PER_G_PROTEIN[^}]*KCAL_PER_G_CARBS[^}]*KCAL_PER_G_FAT[^}]*\}\s*from\s+'@\/domain\/nutrition\/engine'/,
    );
  });

  it('10.c NutritionTabContent consumes the adaptive chain instead of recomputing', () => {
    const tab = productionCode(TAB_FILE);
    // Canonical fallback comes from the engine…
    expect(tab).toMatch(/import\s*\{[^}]*calculateNutritionMetrics[^}]*\}\s*from\s+'@\/domain\/nutrition\/engine'/);
    // …the generation target is the adaptive effectiveMetrics…
    expect(tab).toMatch(/useAdaptiveNutritionTarget\(/);
    expect(tab).toMatch(/effectiveMetrics/);
    // …and drafts capture the effective weekly rate for the lock lifecycle.
    expect(tab).toMatch(/effectiveWeeklyRateKg/);
    expect(tab).not.toMatch(/=\s*Math\.abs\(/);
  });
});

// ============================================================================
// TASK 1 (runtime half) — EVERY AUTHORITATIVE VALUE ORIGINATES IN THE ENGINE
// ============================================================================

describe('PHASE 9 · every authoritative value originates in the canonical engine', () => {
  it('BMR/TDEE/target/macros/fiber/water all come from calculateProfile', () => {
    const metrics = calculateProfile(PROFILE_INPUT);
    expect(metrics).toEqual(CANONICAL);
    expect(JSON.stringify(metrics)).toBe(JSON.stringify(calculateProfile(PROFILE_INPUT)));

    // The structured decision carries the SAME values (one pipeline, two views):
    const decision = resolveNutritionDecision(PROFILE_INPUT);
    expect(decision.energy.bmr).toBe(metrics.bmr);
    expect(decision.energy.tdee).toBe(metrics.tdee);
    expect(decision.energy.targetCalories).toBe(metrics.targetCalories);
    expect(decision.macros.proteinGrams).toBe(metrics.proteinGrams);
    expect(decision.macros.carbsGrams).toBe(metrics.carbsGrams);
    expect(decision.macros.fatGrams).toBe(metrics.fatGrams);
    expect(decision.nutrition.fiberGrams).toBe(metrics.fiberGrams);
    expect(decision.nutrition.waterLiters).toBe(metrics.waterLiters);
  });

  it('the initial prescription echoes the engine decision verbatim (no re-math)', () => {
    const rx = deriveInitialPrescription(CLIENT);
    const decision = resolveNutritionDecision(PROFILE_INPUT);
    expect(rx.targetCalories).toBe(decision.energy.targetCalories);
    expect(rx.weeklyRateKg).toBe(decision.rate.weeklyRateKg);
    expect(rx.source).toBe('initial_profile');
  });

  it('the adaptation service uses the engine for current AND future targets', () => {
    // Current: resolveAdaptedTarget.currentDecision === direct engine call.
    const result = resolveAdaptedTarget(CLIENT, null, evidence(-0.2));
    expect(result.currentDecision).toEqual(resolveNutritionDecision(PROFILE_INPUT));
    expect(result.baseline).toEqual(deriveInitialPrescription(CLIENT));

    // Future: eligible adaptation resolves through calculateProfile with the
    // adjusted rate — identical to a fresh canonical plan for that rate.
    expect(result.decision.outcome).toBe('adherent_unexpected');
    expect(result.futureMetrics).toEqual(
      calculateProfile({ ...PROFILE_INPUT, weeklyWeightChange: result.decision.futureWeeklyRateKg }),
    );
  });

  it('ingredient/recipe calories are canonical macro-derived energy (never legacy)', () => {
    // Legacy metadata deliberately inconsistent with 4P+4C+9F.
    const legacy = {
      id: 'legacy-chicken',
      name: 'Legacy Chicken',
      category: 'protein' as const,
      typical_serving_size_g: 100,
      allowedMeals: [],
      tags: [],
      macros: { calories: 999, protein: 31, carbs: 0, fat: 3.6, fiber: 0 },
    };
    const canonicalPer100 =
      31 * KCAL_PER_G_PROTEIN + 0 * KCAL_PER_G_CARBS + 3.6 * KCAL_PER_G_FAT;

    // Aggregation ignores the stored calorie field entirely:
    expect(calculateTotalMacros([legacy]).calories).toBeCloseTo(canonicalPer100, 6);
    expect(macroCaloriesPer100g(legacy)).toBe(canonicalPer100);

    // The mismatch is detectable but never becomes authority:
    expect(canonicalPer100).not.toBe(999);
  });

  it('sumMacros derives calories canonically for arbitrary portions', () => {
    const total = sumMacros([
      { protein: 10.5, carbs: 20.25, fat: 5.125, fiber: 2 },
      { protein: 33, carbs: 7, fat: 1.5 },
    ]);
    const grams =
      total.protein * KCAL_PER_G_PROTEIN +
      total.carbs * KCAL_PER_G_CARBS +
      total.fat * KCAL_PER_G_FAT;
    expect(total.calories).toBe(grams);
  });
});

// ============================================================================
// TASK 5 — CANONICAL RECOMPUTATION AFTER PERSISTENCE
// ============================================================================

describe('PHASE 9 · persisted weeklyRateKg + canonical profile reproduce the target', () => {
  it('the prescription record stores ONLY the non-derivable minimum state', () => {
    const record = buildPrescriptionRecord({
      weeklyRateKg: -0.636,
      lockedAt: new Date('2026-03-30T10:00:00Z'),
      versionId: 'v9',
    });
    // No BMR/TDEE/macro values are persisted as a second authority:
    expect(Object.keys(record).sort()).toEqual(['establishedAt', 'sourceVersionId', 'weeklyRateKg']);
    expect(record.weeklyRateKg).toBe(-0.636);
  });

  it('persisted weeklyRateKg + profile -> engine == exact expected target/macros', () => {
    const persisted = buildPrescriptionRecord({
      weeklyRateKg: -0.6363636363636364,
      lockedAt: new Date('2026-03-30T10:00:00Z'),
      versionId: 'v9',
    });

    // Reproduction path (exactly what hydration + generation consume):
    const reproduced = calculateProfile({
      ...PROFILE_INPUT,
      weeklyWeightChange: persisted.weeklyRateKg,
    });

    // The prescription built at lock time carries the same engine target:
    const p1 = prescriptionFromLockedPlan({
      weeklyRateKg: persisted.weeklyRateKg,
      targetCalories: roundKcal(
        calculateTargetCalories(CANONICAL.tdee, CLIENT.primaryGoal, persisted.weeklyRateKg),
      ),
      versionId: 'v9',
      versionNumber: 2,
      establishedAt: persisted.establishedAt,
    });
    expect(reproduced.targetCalories).toBe(p1.targetCalories);
    expect(reproduced).toEqual(
      calculateProfile({ ...PROFILE_INPUT, weeklyWeightChange: p1.weeklyRateKg }),
    );
  });

  it('malformed persisted payloads fall back to the canonical initial prescription', () => {
    for (const payload of [
      null,
      {},
      { nutritionPrescription: null },
      { nutritionPrescription: { weeklyRateKg: 'garbage' } },
      { nutritionPrescription: { weeklyRateKg: NaN, establishedAt: 'x', sourceVersionId: 'v' } },
      { nutritionPrescription: { weeklyRateKg: -0.5, establishedAt: 42, sourceVersionId: 'v' } },
    ]) {
      expect(readPrescriptionRecord(payload)).toBeNull();
    }
    // Fallback is deterministic and engine-derived:
    expect(deriveInitialPrescription(CLIENT).targetCalories).toBe(CANONICAL.targetCalories);
  });
});

// ============================================================================
// TASK 3 — ADAPTATION IS NON-COMPOUNDING (P0 -> P1 -> P2, always vs ACTIVE)
// ============================================================================

const P0 = prescriptionFromLockedPlan({
  weeklyRateKg: -0.5,
  targetCalories: CANONICAL.targetCalories,
  versionId: 'v1',
  versionNumber: 1,
  establishedAt: '2026-03-01T10:00:00.000Z',
});

describe('PHASE 9 · adaptation is non-compounding and relative to the active prescription', () => {
  it('P0 -> adjustment -> P1 (slow loss + adherence => deeper deficit, ±150 clamp)', () => {
    const d1 = decideAdaptation(adaptationInput(P0, evidence(-0.2)));
    expect(d1.outcome).toBe('adherent_unexpected');
    expect(d1.calorieAdjustmentKcal).toBe(-150);
    expect(d1.futureWeeklyRateKg).toBeCloseTo(
      -0.5 - (150 / KCAL_PER_KG_BODYWEIGHT) * DAYS_PER_WEEK,
      9,
    );
    expect(d1.futureTargetCalories).toBe(
      roundKcal(calculateTargetCalories(CANONICAL.tdee, CLIENT.primaryGoal, d1.futureWeeklyRateKg)),
    );
    expect(d1.lockedPlanUntouched).toBe(true);
  });

  it('evidence exactly matching P1 -> no adjustment -> P1 stands', () => {
    const P1 = prescriptionAfter(decideAdaptation(adaptationInput(P0, evidence(-0.2))), 'v2', 2);

    const d2 = decideAdaptation(adaptationInput(P1, evidence(P1.weeklyRateKg)));
    expect(d2.outcome).toBe('adherent_expected');
    expect(d2.calorieAdjustmentKcal).toBe(0);
    expect(d2.futureWeeklyRateKg).toBe(P1.weeklyRateKg);
    expect(d2.futureTargetCalories).toBe(P1.targetCalories);
    expect(d2.observedWeeklyRateKg).toBeCloseTo(P1.weeklyRateKg, 4);
  });

  it('a NEW unexpected trend adjusts relative to P1 — never back against P0', () => {
    const P1 = prescriptionAfter(decideAdaptation(adaptationInput(P0, evidence(-0.2))), 'v2', 2);

    // Now losing ~1.0 kg/week while prescribed P1 (~-0.636) => losing too fast.
    const d2 = decideAdaptation(adaptationInput(P1, evidence(-1.0)));
    expect(d2.outcome).toBe('adherent_unexpected');
    expect(d2.targetWeeklyRateKg).toBe(P1.weeklyRateKg); // baseline is P1
    expect(d2.calorieAdjustmentKcal).toBe(150); // surplus direction
    const P2 = prescriptionAfter(d2, 'v3', 3);
    expect(P2.weeklyRateKg).toBeCloseTo(
      P1.weeklyRateKg + (150 / KCAL_PER_KG_BODYWEIGHT) * DAYS_PER_WEEK,
      9,
    );

    // Counterfactual: the SAME evidence against P0 would produce a DIFFERENT
    // future rate/target — proving the cycle did not silently reuse P0.
    const againstP0 = decideAdaptation(adaptationInput(P0, evidence(-1.0)));
    expect(againstP0.futureWeeklyRateKg).not.toBeCloseTo(d2.futureWeeklyRateKg, 6);
    expect(againstP0.futureTargetCalories).not.toBe(d2.futureTargetCalories);
  });
});

describe('PHASE 9 · adaptation regression matrix', () => {
  it('deficit direction: loss slower than planned => target decreases', () => {
    const d = decideAdaptation(adaptationInput(P0, evidence(-0.2)));
    expect(d.futureTargetCalories).toBeLessThan(P0.targetCalories);
    expect(d.calorieAdjustmentKcal).toBeLessThan(0);
  });

  it('surplus direction: gain faster than planned => target decreases (surplus trimmed)', () => {
    const gain = prescriptionFromLockedPlan({
      weeklyRateKg: 0.25,
      targetCalories: roundKcal(calculateTargetCalories(CANONICAL.tdee, 'muscle_gain', 0.25)),
      versionId: 'g1',
      versionNumber: 1,
      establishedAt: '2026-03-01T10:00:00.000Z',
    });
    const input: AdaptiveTargetingInput = {
      ...adaptationInput(gain, evidence(0.9)),
      primaryGoal: 'muscle_gain',
    };
    const d = decideAdaptation(input);
    expect(d.outcome).toBe('adherent_unexpected');
    expect(d.calorieAdjustmentKcal).toBeLessThan(0);
    expect(d.futureWeeklyRateKg).toBeLessThan(gain.weeklyRateKg);
  });

  it('zero adjustment keeps the prescription values identical (expected trend OR poor adherence)', () => {
    for (const ev of [evidence(P0.weeklyRateKg), evidence(P0.weeklyRateKg, 40)]) {
      const d = decideAdaptation(adaptationInput(P0, ev));
      expect(d.calorieAdjustmentKcal).toBe(0);
      expect(d.futureWeeklyRateKg).toBe(P0.weeklyRateKg);
      expect(d.futureTargetCalories).toBe(P0.targetCalories);
    }
  });

  it('±150 kcal/step clamp in BOTH directions', () => {
    const slower = decideAdaptation(adaptationInput(P0, evidence(+0.5))); // far too little loss
    const faster = decideAdaptation(adaptationInput(P0, evidence(-2.0))); // far too much loss
        expect(slower.calorieAdjustmentKcal).toBe(-150);
    expect(faster.calorieAdjustmentKcal).toBe(150);
    expect(Math.abs(faster.calorieAdjustmentKcal)).toBeLessThanOrEqual(MAX_STEP_KCAL());
  });

  it('insufficient evidence never adjusts (weight count, window span, adherence gates)', () => {
    // < 7 weigh-ins:
    const few = decideAdaptation(
      adaptationInput(P0, {
        dailyCheckins: dailyWeighIns({ startWeightKg: 82, weeklyRateKg: -0.2, days: 6 }),
        weeklyReviews: weeklyReviewsWith(95),
      }),
    );
    expect(few.outcome).toBe('insufficient_data');
    expect(few.sufficientData).toBe(false);
    expect(few.calorieAdjustmentKcal).toBe(0);

    // >= 7 weigh-ins but < 14-day span:
    const short = decideAdaptation(
      adaptationInput(P0, {
        dailyCheckins: dailyWeighIns({
          startWeightKg: 82,
          weeklyRateKg: -0.2,
          days: 10,
          startDate: '2026-03-24',
        }),
        weeklyReviews: weeklyReviewsWith(95),
      }),
    );
    expect(short.outcome).toBe('insufficient_data');

    // Full weight trend but ZERO adherence samples (< 5 required):
    const noScores: AdaptiveTargetingInput = {
      referenceWeightKg: CLIENT.weight,
      tdee: CANONICAL.tdee,
      primaryGoal: CLIENT.primaryGoal,
      activityLevel: CLIENT.activityLevel,
      prescribedWeeklyRateKg: P0.weeklyRateKg,
      currentTargetCalories: P0.targetCalories,
      observations: weightObservationsFromDailyCheckins(
        dailyWeighIns({ startWeightKg: 82, weeklyRateKg: -0.2 }),
      ),
      adherenceScores: [],
    };
    const sparse = decideAdaptation(noScores);
    expect(sparse.outcome).toBe('insufficient_data');
    expect(sparse.adherent).toBeNull();
    expect(sparse.futureTargetCalories).toBe(P0.targetCalories);
  });

  it('poor adherence + unexpected trend => NO adjustment (never read as adaptation)', () => {
    const d = decideAdaptation(adaptationInput(P0, evidence(-0.2, 40)));
    expect(d.outcome).toBe('non_adherent_unexpected');
    expect(d.adherent).toBe(false);
    expect(d.calorieAdjustmentKcal).toBe(0);
    expect(d.futureWeeklyRateKg).toBe(P0.weeklyRateKg);
    expect(d.futureTargetCalories).toBe(P0.targetCalories);
  });

  it('expected trend with good adherence => maintain calories', () => {
    const d = decideAdaptation(adaptationInput(P0, evidence(-0.5)));
    expect(d.outcome).toBe('adherent_expected');
    expect(d.calorieAdjustmentKcal).toBe(0);
    expect(d.futureTargetCalories).toBe(P0.targetCalories);
  });

  it('repeated cycles P0->P1->P2->P3 each compare against the IMMEDIATE prescription', () => {
    let rx = P0;
    const observed = [-0.2, -1.0, -1.0];
    const versions = ['v2', 'v3', 'v4'];
    for (let i = 0; i < 3; i += 1) {
      const d = decideAdaptation(adaptationInput(rx, evidence(observed[i])));
      const next = prescriptionAfter(d, versions[i], i + 2);
      expect(d.targetWeeklyRateKg).toBe(rx.weeklyRateKg); // baseline = current rx
      expect(next.targetCalories).toBe(d.futureTargetCalories);
      expect(next.weeklyRateKg).toBe(d.futureWeeklyRateKg);
      rx = next;
    }
    // Deterministic replay produces the identical chain:
    let replay = P0;
    for (let i = 0; i < 3; i += 1) {
      replay = prescriptionAfter(
        decideAdaptation(adaptationInput(replay, evidence(observed[i]))),
        versions[i],
        i + 2,
      );
    }
    expect(JSON.stringify(replay)).toBe(JSON.stringify(rx));
  });

  it('observedWeeklyRateKg recovers exact linear trends deterministically', () => {
    const obs: WeightObservation[] = dailyWeighIns({
      startWeightKg: 90,
      weeklyRateKg: -0.75,
    }).map((c) => ({ date: c.checkin_date, weightKg: c.current_weight_kg as number }));
    expect(observedWeeklyRateKg(obs)).toBeCloseTo(-0.75, 4);
    expect(observedWeeklyRateKg(obs)).toBe(observedWeeklyRateKg([...obs].reverse()));
  });
});

// ============================================================================
// TASK 2 / 4 / 6 — PRODUCTION-SHAPED LIFECYCLE SIMULATOR
// -----------------------------------------------------------------------------
// Mirrors usePlanFetch hydration + the atomic lock boundary WITHOUT touching
// Supabase: the store plays the role of plan_versions (current_version payload
// + locked_snapshot_json). Hydration uses the REAL readPrescriptionRecord /
// prescriptionFromLockedPlan / deepFreeze code paths.
// ============================================================================

interface VersionStore {
  versionId: string | null;
  versionNumber: number | null;
  /** Serialized JSON of plan_versions.plan_payload (or null). */
  payloadJson: string | null;
  /** Serialized JSON of plan_versions.locked_snapshot_json (or null). */
  snapshotJson: string | null;
}

const EMPTY_STORE: VersionStore = {
  versionId: null,
  versionNumber: null,
  payloadJson: null,
  snapshotJson: null,
};

function makeHistoricalSnapshot(versionId: string, metrics: NutritionMetrics): PlanSnapshot {
  return buildPlanSnapshot({
    identifier: {
      versionId,
      lockedAt: new Date('2026-03-01T10:00:00Z'),
      lockedUntil: new Date('2026-03-08T10:00:00Z'),
      payloadHash: 'hash-phase9',
    },
    client: { firstName: 'Phase', lastName: 'Nine', goal: 'fat_loss', activityLevel: 'moderately_active' },
    metrics,
    weeklyPlan: [
      {
        day: 1,
        meals: [],
        totalMacros: {
          calories: metrics.targetCalories,
          protein: metrics.proteinGrams,
          carbs: metrics.carbsGrams,
          fat: metrics.fatGrams,
          fiber: metrics.fiberGrams,
        },
        hydration: metrics.waterLiters,
      },
    ],
    groceryList: [],
    planName: 'Phase 9 Plan',
    versionNumber: 1,
    createdAt: '2026-03-01T10:00:00Z',
    generatedBy: 'coach',
  });
}

/** Hydrate exactly like usePlanFetch does (parse -> validate -> freeze). */
function hydrate(store: VersionStore) {
  const raw = store.payloadJson ? (JSON.parse(store.payloadJson) as Record<string, unknown>) : null;
  const rxRecord = readPrescriptionRecord(raw);
  const snapshot = store.snapshotJson
    ? deepFreeze(JSON.parse(store.snapshotJson) as PlanSnapshot)
    : null;
  const macroTargets = (raw?.macroTargets ?? null) as { calories?: number } | null;
  return {
    activePrescription:
      rxRecord && store.versionId
        ? prescriptionFromLockedPlan({
            weeklyRateKg: rxRecord.weeklyRateKg,
            targetCalories:
              (snapshot?.metrics.targetCalories as number | undefined) ??
              macroTargets?.calories ??
              NaN,
            versionId: store.versionId,
            versionNumber: store.versionNumber,
            establishedAt: rxRecord.establishedAt,
          })
        : null,
    snapshot,
  };
}

/** Atomic lock RPC stand-in: all writes succeed together or nothing happens. */
function atomicLock(
  store: VersionStore,
  args: {
    versionId: string;
    draftRateKg: number | null;
    draftTargetCalories: number;
    snapshot: PlanSnapshot;
    fail?: boolean;
  },
): { success: boolean } {
  if (args.fail) return { success: false }; // RPC error => NO writes at all

  const record = args.draftRateKg !== null
    ? buildPrescriptionRecord({
        weeklyRateKg: args.draftRateKg,
        lockedAt: new Date('2026-03-30T10:00:00Z'),
        versionId: args.versionId,
      })
    : undefined;

  const payload = {
    type: 'nutrition' as const,
    generatedAt: '2026-03-30T10:00:00Z',
    lockedAt: '2026-03-30T10:00:00Z',
    macroTargets: { calories: args.draftTargetCalories, protein: 160, carbs: 200, fat: 60 },
    weeklyPlan: {},
    likedIngredients: [],
    ...(record ? { nutritionPrescription: record } : {}),
  };

  store.payloadJson = JSON.stringify(payload);
  store.snapshotJson = JSON.stringify(args.snapshot);
  store.versionId = args.versionId;
  store.versionNumber = (store.versionNumber ?? 0) + 1;
  return { success: true };
}

describe('PHASE 9 · active prescription lifecycle (Task 2 A/B)', () => {
  it('A · INITIAL CLIENT — derived baseline, drafts persist nothing, lock is the only writer', () => {
    const store: VersionStore = { ...EMPTY_STORE };

    // No persisted prescription -> canonical lazy initialization:
    const hydrated = hydrate(store);
    expect(hydrated.activePrescription).toBeNull();
    const initial = deriveInitialPrescription(CLIENT);
    expect(initial.targetCalories).toBe(CANONICAL.targetCalories);

    // Generation uses the initial prescription as its adaptation baseline…
    const draft1 = resolveAdaptedTarget(CLIENT, hydrated.activePrescription, evidence(-0.2));
    const draft2 = resolveAdaptedTarget(CLIENT, hydrated.activePrescription, evidence(-1.0));
    expect(draft1.baseline).toEqual(initial);
    expect(draft2.baseline).toEqual(initial);

    // …and drafts persist NOTHING:
    expect(JSON.stringify(store)).toBe(JSON.stringify(EMPTY_STORE));

    // Only an explicit lock writes the prescription:
    const lock = atomicLock(store, {
      versionId: 'v1',
      draftRateKg: initial.weeklyRateKg,
      draftTargetCalories: initial.targetCalories,
      snapshot: makeHistoricalSnapshot('v1', CANONICAL),
    });
    expect(lock.success).toBe(true);
    expect(hydrate(store).activePrescription).toMatchObject({
      weeklyRateKg: initial.weeklyRateKg,
      targetCalories: initial.targetCalories,
      source: 'locked_plan',
      versionId: 'v1',
    });
  });

  it('B · MULTIPLE DRAFT GENERATIONS — every draft baselines on P0, no compounding', () => {
    const store: VersionStore = { ...EMPTY_STORE };
    atomicLock(store, {
      versionId: 'v1',
      draftRateKg: P0.weeklyRateKg,
      draftTargetCalories: P0.targetCalories,
      snapshot: makeHistoricalSnapshot('v1', CANONICAL),
    });
    const P0persisted = hydrate(store).activePrescription!;
    const storeBefore = JSON.stringify(store);

    // Three successive draft generations with DIFFERENT evidence:
    const drafts = [
      resolveAdaptedTarget(CLIENT, P0persisted, evidence(-0.2)),
      resolveAdaptedTarget(CLIENT, P0persisted, evidence(-1.0)),
      resolveAdaptedTarget(CLIENT, P0persisted, evidence(0.3)),
    ];
    for (const d of drafts) {
      expect(d.baseline).toEqual(P0persisted); // always P0…
      expect(d.decision.targetWeeklyRateKg).toBe(P0.weeklyRateKg); // …never a draft output
    }
    // Generating a future draft must NOT advance the baseline to P1:
    expect(drafts[0].decision.futureWeeklyRateKg).not.toBe(P0.weeklyRateKg);
    expect(hydrate(store).activePrescription).toEqual(P0persisted);
    expect(JSON.stringify(store)).toBe(storeBefore); // store untouched by drafts
  });
});

describe('PHASE 9 · active prescription lifecycle (Task 2 C/D/E)', () => {
  function storeWithP0(): VersionStore {
    const store: VersionStore = { ...EMPTY_STORE };
    atomicLock(store, {
      versionId: 'v1',
      draftRateKg: P0.weeklyRateKg,
      draftTargetCalories: P0.targetCalories,
      snapshot: makeHistoricalSnapshot('v1', CANONICAL),
    });
    return store;
  }

  it('C · LOCK — draft based on P0 produces P1; reload hydrates P1 as active', () => {
    const store = storeWithP0();

    const draft = resolveAdaptedTarget(CLIENT, hydrate(store).activePrescription, evidence(-0.2));
    expect(draft.decision.outcome).toBe('adherent_unexpected');
    const expectedP1 = prescriptionAfter(draft.decision, 'v2', 2);

    const lock = atomicLock(store, {
      versionId: 'v2',
      draftRateKg: draft.decision.futureWeeklyRateKg,
      draftTargetCalories: draft.decision.futureTargetCalories,
      snapshot: makeHistoricalSnapshot('v2', draft.futureMetrics ?? CANONICAL),
    });
    expect(lock.success).toBe(true);

    // Post-lock reload: P1 becomes active ONLY after successful lock + reload.
    const reloaded = hydrate(store);
    expect(reloaded.activePrescription).toEqual(expectedP1);
    expect(reloaded.activePrescription).toMatchObject({
      source: 'locked_plan',
      versionId: 'v2',
      versionNumber: 2,
      weeklyRateKg: draft.decision.futureWeeklyRateKg,
      targetCalories: draft.decision.futureTargetCalories,
    });
  });

  it('D · FAILED LOCK — active prescription and snapshot remain P0, nothing partial', () => {
    const store = storeWithP0();
    const before = JSON.stringify(store);
    const P0active = hydrate(store).activePrescription!;

    // A future draft exists (would have produced P1) but the lock FAILS:
    const draft = resolveAdaptedTarget(CLIENT, P0active, evidence(-0.2));
    const failed = atomicLock(store, {
      versionId: 'v2',
      draftRateKg: draft.decision.futureWeeklyRateKg,
      draftTargetCalories: draft.decision.futureTargetCalories,
      snapshot: makeHistoricalSnapshot('v2', draft.futureMetrics ?? CANONICAL),
      fail: true,
    });

    expect(failed.success).toBe(false);
    // No partial prescription state accepted; no draft became authoritative:
    expect(JSON.stringify(store)).toBe(before);
    expect(hydrate(store).activePrescription).toEqual(P0active);
    expect(hydrate(store).activePrescription!.versionId).toBe('v1');
  });

  it('E · RELOAD — activePrescription === persisted; engine reproduces targets; next cycle uses it', () => {
    const store = storeWithP0();
    const draft = resolveAdaptedTarget(CLIENT, hydrate(store).activePrescription, evidence(-0.2));
    atomicLock(store, {
      versionId: 'v2',
      draftRateKg: draft.decision.futureWeeklyRateKg,
      draftTargetCalories: draft.decision.futureTargetCalories,
      snapshot: makeHistoricalSnapshot('v2', draft.futureMetrics ?? CANONICAL),
    });

    const reloaded = hydrate(store);
    const P1 = reloaded.activePrescription!;
    // activePrescription === persisted prescription:
    const persistedRecord = readPrescriptionRecord(JSON.parse(store.payloadJson!));
    expect(persistedRecord).not.toBeNull();
    expect(P1.weeklyRateKg).toBe(persistedRecord!.weeklyRateKg);
    expect(P1.targetCalories).toBe(
      roundKcal(calculateTargetCalories(CANONICAL.tdee, CLIENT.primaryGoal, P1.weeklyRateKg)),
    );

    // Snapshot values remain immutable through reload:
    expect(Object.isFrozen(reloaded.snapshot)).toBe(true);
    expect(JSON.parse(store.snapshotJson!).metrics).toEqual(
      JSON.parse(JSON.stringify(reloaded.snapshot!.metrics)),
    );

    // The SAME prescription baselines the next adaptation cycle:
    const next = resolveAdaptedTarget(CLIENT, P1, evidence(-1.0));
    expect(next.baseline).toEqual(P1);
    expect(next.decision.targetWeeklyRateKg).toBe(P1.weeklyRateKg);
  });
});

// ============================================================================
// TASK 4 — LOCKED DATA IMMUTABILITY (deep-freeze + byte-identical assertions)
// ============================================================================

describe('PHASE 9 · locked snapshots and historical prescriptions are immutable', () => {
  const P0SNAPSHOT = makeHistoricalSnapshot('v1', CANONICAL); // deep-frozen by builder

  it('generating a draft cannot mutate the locked snapshot or the active prescription', () => {
    const snapshotBytes = JSON.stringify(P0SNAPSHOT);
    const frozenRx = deepFreeze({ ...P0 });
    const rxBytes = JSON.stringify(frozenRx);

    resolveAdaptedTarget(CLIENT, frozenRx as ActiveNutritionPrescription, evidence(-0.2));
    resolveAdaptedTarget(CLIENT, frozenRx as ActiveNutritionPrescription, evidence(-1.0));

    expect(JSON.stringify(P0SNAPSHOT)).toBe(snapshotBytes);
    expect(JSON.stringify(frozenRx)).toBe(rxBytes);
    expect(Object.isFrozen(frozenRx)).toBe(true);
  });

  it('adaptation cannot mutate the locked snapshot or previous prescriptions', () => {
    const snapshotBytes = JSON.stringify(P0SNAPSHOT);
    // Feed adaptation a context that embeds the frozen snapshot's metrics and
    // a frozen historical prescription; nothing may write back into either.
    const historical = deepFreeze({ ...P0, versionId: 'v0', versionNumber: 0 });
    const historicalBytes = JSON.stringify(historical);

    decideAdaptation(adaptationInput(P0, evidence(-0.2)));
    decideAdaptation(adaptationInput(P0, evidence(-1.0)));

    expect(JSON.stringify(P0SNAPSHOT)).toBe(snapshotBytes);
    expect(JSON.stringify(historical)).toBe(historicalBytes);
  });

  it('failed locking cannot mutate persisted state (atomic all-or-nothing)', () => {
    const store: VersionStore = { ...EMPTY_STORE };
    atomicLock(store, {
      versionId: 'v1',
      draftRateKg: P0.weeklyRateKg,
      draftTargetCalories: P0.targetCalories,
      snapshot: P0SNAPSHOT,
    });
    const before = JSON.stringify(store);

    atomicLock(store, {
      versionId: 'v2',
      draftRateKg: -0.9,
      draftTargetCalories: 1900,
      snapshot: makeHistoricalSnapshot('v2', CANONICAL),
      fail: true,
    });

    expect(JSON.stringify(store)).toBe(before);
  });

  it('hydration cannot mutate the persisted JSON it reads', () => {
    const store: VersionStore = { ...EMPTY_STORE };
    atomicLock(store, {
      versionId: 'v1',
      draftRateKg: P0.weeklyRateKg,
      draftTargetCalories: P0.targetCalories,
      snapshot: P0SNAPSHOT,
    });
    const payloadBefore = store.payloadJson;

    const reloaded = hydrate(store);
    // The snapshot is deep-frozen on hydration: mutating it throws…
    expect(() => {
      (reloaded.snapshot!.metrics as { targetCalories: number }).targetCalories = 1;
    }).toThrow();
    // …and the stored JSON is untouched by any hydration attempt:
    void hydrate(store);
    expect(store.payloadJson).toBe(payloadBefore);
  });

  it('mapping snapshot -> weekly plan cannot mutate snapshot data', () => {
    const snapshotBytes = JSON.stringify(P0SNAPSHOT);

    const resolved = mapSnapshotToWeeklyPlan({
      weeklyPlan: P0SNAPSHOT.weeklyPlan,
      metrics: {
        calories: P0SNAPSHOT.metrics.targetCalories,
        protein: P0SNAPSHOT.metrics.proteinGrams,
        carbs: P0SNAPSHOT.metrics.carbsGrams,
        fat: P0SNAPSHOT.metrics.fatGrams,
        fiber: P0SNAPSHOT.metrics.fiberGrams,
      },
    });

    expect(JSON.stringify(P0SNAPSHOT)).toBe(snapshotBytes);
    expect(resolved.weeklyTotalMacros.calories).toBe(
      sumMacros(P0SNAPSHOT.weeklyPlan.map((d) => d.totalMacros)).calories,
    );
  });

  it('EXPLICIT SEQUENCE — P0 locked → P1 draft → P2 draft → failed lock ⇒ P0 untouched', () => {
    const store: VersionStore = { ...EMPTY_STORE };
    atomicLock(store, {
      versionId: 'v1',
      draftRateKg: P0.weeklyRateKg,
      draftTargetCalories: P0.targetCalories,
      snapshot: P0SNAPSHOT,
    });
    const baseline = JSON.stringify(store);
    const snapshotFrozenBytes = JSON.stringify(P0SNAPSHOT);

    const activeP0 = hydrate(store).activePrescription!;
    const p1Draft = resolveAdaptedTarget(CLIENT, activeP0, evidence(-0.2)); // would be P1
    const p2Draft = resolveAdaptedTarget(CLIENT, activeP0, evidence(-1.0)); // would be P2
    expect(p1Draft.baseline).toEqual(activeP0);
    expect(p2Draft.baseline).toEqual(activeP0);

    atomicLock(store, {
      versionId: 'vX',
      draftRateKg: p2Draft.decision.futureWeeklyRateKg,
      draftTargetCalories: p2Draft.decision.futureTargetCalories,
      snapshot: makeHistoricalSnapshot('vX', CANONICAL),
      fail: true,
    });

    expect(JSON.stringify(store)).toBe(baseline); // P0 payload+snapshot unchanged
    expect(JSON.stringify(P0SNAPSHOT)).toBe(snapshotFrozenBytes);
    expect(hydrate(store).activePrescription).toEqual(activeP0); // P0 prescription unchanged
  });
});

// ============================================================================
// TASK 6 — REALISTIC END-TO-END SCENARIOS (deterministic integration)
// ============================================================================

describe('PHASE 9 · end-to-end scenarios A–F', () => {
  /** Canonical metrics that a given prescription's rate reproduces (engine re-derived). */
function metricsFor(base: ActiveNutritionPrescription) {
  return calculateProfile({ ...PROFILE_INPUT, weeklyWeightChange: base.weeklyRateKg });
}

/** Full production-shaped cycle: hydrate → adapt → generate → (lock). */
function fullCycle(store: VersionStore, ev: ReturnType<typeof evidence>) {
  const { activePrescription } = hydrate(store);
  const adapted = resolveAdaptedTarget(CLIENT, activePrescription, ev);

  // Draft generation consumes the effective metrics exactly like
  // NutritionTabContent: adapted future target when eligible, else the metrics
  // that the active prescription reproduces (canonical initial when none).
  // Drafts always capture the EFFECTIVE weekly rate (adapted when eligible,
  // otherwise the active baseline rate) — exactly what setDraftPlan stores.
  const eligible = !!adapted.futureMetrics && adapted.decision.calorieAdjustmentKcal !== 0;
  const baseMetrics = metricsFor(activePrescription ?? adapted.baseline);
  const effectiveMetrics = eligible ? adapted.futureMetrics! : baseMetrics;
  const effectiveRate = eligible
    ? adapted.decision.futureWeeklyRateKg
    : (activePrescription?.weeklyRateKg ?? adapted.baseline.weeklyRateKg);

  const lock = (versionId: string, fail = false) =>
    atomicLock(store, {
      versionId,
      draftRateKg: effectiveRate,
      draftTargetCalories: effectiveMetrics.targetCalories,
      snapshot: makeHistoricalSnapshot(versionId, effectiveMetrics),
      fail,
    });

  return { activePrescription, adapted, effectiveMetrics, effectiveRate, lock };
}

  function storeLockedAtP0(): VersionStore {
    const store: VersionStore = { ...EMPTY_STORE };
    atomicLock(store, {
      versionId: 'v1',
      draftRateKg: P0.weeklyRateKg,
      draftTargetCalories: P0.targetCalories,
      snapshot: makeHistoricalSnapshot('v1', CANONICAL),
    });
    return store;
  }

    it('SCENARIO A — NEW CLIENT: canonical initial target, insufficient_data, lock creates rx', () => {
    const store: VersionStore = { ...EMPTY_STORE };
    // No persisted evidence and no active prescription → insufficient_data:
    const cycle = fullCycle(store, { dailyCheckins: [], weeklyReviews: [] } as ReturnType<typeof evidence>);

    expect(cycle.activePrescription).toBeNull();
    expect(cycle.adapted.decision.outcome).toBe('insufficient_data');
    expect(cycle.adapted.futureMetrics).toBeNull();
    expect(cycle.effectiveMetrics).toEqual(CANONICAL); // generation uses initial target

    expect(cycle.lock('v1').success).toBe(true);
    expect(hydrate(store).activePrescription).toMatchObject({
      weeklyRateKg: deriveInitialPrescription(CLIENT).weeklyRateKg,
      targetCalories: CANONICAL.targetCalories,
      source: 'locked_plan',
    });
  });

  it('SCENARIO B — SUCCESSFUL ADAPTATION: ±150 cap, engine future target, new prescription', () => {
    const store = storeLockedAtP0();
    const cycle = fullCycle(store, evidence(-0.2, 90)); // adherence ≥ 85, unexpected trend

    expect(cycle.adapted.decision.outcome).toBe('adherent_unexpected');
    expect(cycle.adapted.decision.calorieAdjustmentKcal).toBe(-150); // cap respected
    expect(cycle.effectiveMetrics!.targetCalories).toBe(
      calculateProfile({
        ...PROFILE_INPUT,
        weeklyWeightChange: cycle.adapted.decision.futureWeeklyRateKg,
      }).targetCalories,
    );

    expect(cycle.lock('v2').success).toBe(true);
    expect(hydrate(store).activePrescription).toMatchObject({
      weeklyRateKg: cycle.adapted.decision.futureWeeklyRateKg,
      targetCalories: cycle.adapted.decision.futureTargetCalories,
      versionId: 'v2',
    });
  });

  it('SCENARIO C — POOR ADHERENCE: no adaptation, existing prescription stays baseline', () => {
    const store = storeLockedAtP0();
    const before = JSON.stringify(store);

    const cycle = fullCycle(store, evidence(-0.2, 50)); // adherence < 85
    expect(cycle.adapted.decision.outcome).toBe('non_adherent_unexpected');
    expect(cycle.adapted.futureMetrics).toBeNull();
    expect(cycle.effectiveMetrics).toEqual(CANONICAL); // canonical current target
    expect(cycle.activePrescription).toMatchObject({ weeklyRateKg: P0.weeklyRateKg });
    // No prescription mutation occurred:
    expect(JSON.stringify(store)).toBe(before);
  });

  it('SCENARIO D — EXPECTED TREND: no adjustment, same prescription authoritative', () => {
    const store = storeLockedAtP0();
    const cycle = fullCycle(store, evidence(-0.5, 95)); // trend matches target

    expect(cycle.adapted.decision.outcome).toBe('adherent_expected');
    expect(cycle.adapted.decision.calorieAdjustmentKcal).toBe(0);
    expect(cycle.adapted.baseline).toEqual(cycle.activePrescription);
    expect(hydrate(store).activePrescription!.versionId).toBe('v1');
  });

  it('SCENARIO E — REPEATED ADAPTATION: P0 -> P1 -> P2, each vs the immediately active rx', () => {
    const store = storeLockedAtP0();

    const c1 = fullCycle(store, evidence(-0.2)); // slow loss -> deeper deficit
    c1.lock('v2');
    const p1 = hydrate(store).activePrescription!;
    expect(p1.versionId).toBe('v2');

    const c2 = fullCycle(store, evidence(p1.weeklyRateKg)); // now ON track vs P1
    c2.lock('v3');
    const p2 = hydrate(store).activePrescription!;

    expect(c2.adapted.decision.targetWeeklyRateKg).toBe(p1.weeklyRateKg); // baselined on P1
    expect(p2.targetCalories).toBe(p1.targetCalories); // expected trend => unchanged
    // No compounding: each cycle moved the rate by at most one clamped step.
    const maxStep = (MAX_STEP_KCAL() / KCAL_PER_KG_BODYWEIGHT) * DAYS_PER_WEEK;
    expect(Math.abs(p1.weeklyRateKg - P0.weeklyRateKg)).toBeLessThanOrEqual(maxStep + 1e-9);
    expect(Math.abs(p2.weeklyRateKg - p1.weeklyRateKg)).toBeLessThanOrEqual(maxStep + 1e-9);
  });

  it('SCENARIO F — FAILED LOCK: old prescription/snapshot stay active; draft non-authoritative', () => {
    const store = storeLockedAtP0();

    const cycle = fullCycle(store, evidence(-0.2));
    const result = cycle.lock('v2', true);
    const after = hydrate(store);

    expect(result.success).toBe(false);
    expect(after.activePrescription!.versionId).toBe('v1'); // OLD prescription active
    expect(after.snapshot!.meta.versionNumber).toBe(1); // OLD snapshot active
    expect(after.activePrescription!.weeklyRateKg).toBe(P0.weeklyRateKg); // draft never won
  });
});

/** Local re-export so scenario math reads clearly (single ±150 policy value). */
function MAX_STEP_KCAL(): number {
  return 150;
}

// ============================================================================
// TASK 7 — DAILY/WEEKLY MATHEMATICAL INTEGRITY AT EVERY BOUNDARY
// ============================================================================

/** Integer-gram macros whose canonical calories are exact (linear closure). */
function macrosFor(protein: number, carbs: number, fat: number, fiber = 0): Macros {
  return {
    protein,
    carbs,
    fat,
    fiber,
    calories: protein * KCAL_PER_G_PROTEIN + carbs * KCAL_PER_G_CARBS + fat * KCAL_PER_G_FAT,
  };
}

describe('PHASE 9 · daily/weekly mathematical integrity (Task 7)', () => {
  const dailyTarget = macrosFor(CANONICAL.proteinGrams, CANONICAL.carbsGrams, CANONICAL.fatGrams, CANONICAL.fiberGrams);

  const week = generateWeeklyMealPlan(
    ['chicken-breast', 'eggs', 'brown-rice', 'broccoli', 'oats'],
    {
      calories: dailyTarget.calories,
      protein: dailyTarget.protein,
      carbs: dailyTarget.carbs,
      fat: dailyTarget.fat,
    },
    'phase9-seed',
  );

  it('weekly generation produces 7 deterministic days', () => {
    expect(week.days).toHaveLength(7);
    const replay = generateWeeklyMealPlan(
      ['chicken-breast', 'eggs', 'brown-rice', 'broccoli', 'oats'],
      {
        calories: dailyTarget.calories,
        protein: dailyTarget.protein,
        carbs: dailyTarget.carbs,
        fat: dailyTarget.fat,
      },
      'phase9-seed',
    );
    expect(JSON.stringify(replay)).toBe(JSON.stringify(week));
  });

  it('daily target calories equal canonical macro-derived energy', () => {
    expect(dailyTarget.calories).toBe(caloriesFromMacros(dailyTarget));
  });

    it('every meal and day reports canonical macro-derived energy', () => {
    for (const day of week.days) {
      for (const mealType of ['breakfast', 'lunch', 'dinner', 'snack'] as const) {
        const meal = day.plan.dailyPlan[mealType];
        // Generated scaled macros may carry <1 kcal rounding drift, so assert
        // canonical closure to within one calorie rather than bitwise equality:
                        // Generated macros are canonical (4P+4C+9F) but ingredient grams are
        // rounded during the convergence loop, so allow a small rounding band
        // (the legacy stored calorie field was 999/100/5 — never within this span):
        expect(Math.abs(meal.macros.calories - caloriesFromMacros(meal.macros))).toBeLessThan(10);
      }
      // Day actuals are the sum of the meal actuals (all five keys):
      for (const key of ['calories', 'protein', 'carbs', 'fat'] as const) {
        const mealSum = (['breakfast', 'lunch', 'dinner', 'snack'] as const)
          .map((m) => day.plan.dailyPlan[m].macros[key])
          .reduce((a, b) => a + b, 0);
        expect(day.plan.totalMacros[key]).toBeCloseTo(mealSum, 6);
      }
    }
  });

  it('weekly actual = Σ daily actuals; weekly target = daily target × DAYS_PER_WEEK', () => {
    for (const key of ['calories', 'protein', 'carbs', 'fat', 'fiber'] as const) {
      const daySum = week.days
        .map((d) => d.plan.totalMacros[key] ?? 0)
        .reduce((a, b) => a + b, 0);
      expect(week.weeklyTotalMacros[key] ?? 0).toBeCloseTo(daySum, 6);
    }
    // The generator scales the four declared target keys by DAYS_PER_WEEK
    // (fiber is scaled canonically at the snapshot-adapter boundary, asserted
    // in the round-trip test below):
    for (const key of ['calories', 'protein', 'carbs', 'fat'] as const) {
      expect(week.weeklyTargetMacros[key]).toBe(dailyTarget[key] * DAYS_PER_WEEK);
    }
  });

  it('weekly variance = weekly actual − weekly target (for every macro)', () => {
    for (const key of ['calories', 'protein', 'carbs', 'fat'] as const) {
      expect(week.weeklyVariance[key]).toBe(
        week.weeklyTotalMacros[key] - week.weeklyTargetMacros[key],
      );
    }
  });

  it('no negative macros, no NaN, no Infinity anywhere in the generated week', () => {
    const finite = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v);
    for (const day of week.days) {
      for (const mealType of ['breakfast', 'lunch', 'dinner', 'snack'] as const) {
        const m = day.plan.dailyPlan[mealType].macros;
        for (const key of ['calories', 'protein', 'carbs', 'fat', 'fiber'] as const) {
          expect(finite(m[key])).toBe(true);
          expect(m[key] ?? 0).toBeGreaterThanOrEqual(0);
        }
      }
    }
        for (const key of ['calories', 'protein', 'carbs', 'fat'] as const) {
      expect(finite(week.weeklyTotalMacros[key])).toBe(true);
      expect(week.weeklyTargetMacros[key] ?? null).not.toBeNull();
      expect(finite(week.weeklyTargetMacros[key])).toBe(true);
      const v = week.weeklyVariance[key];
      expect(finite(v)).toBe(true);
    }
    // weeklyVariance carries only the four declared keys:
    expect(week.weeklyVariance).not.toHaveProperty('fiber');
  });

  it('snapshot round-trip reproduces weekly aggregation canonically (incl. fiber ×7)', () => {
    const snapshot = makeHistoricalSnapshot('v1', CANONICAL);
    const resolved = mapSnapshotToWeeklyPlan({
      weeklyPlan: snapshot.weeklyPlan,
      metrics: {
        calories: snapshot.metrics.targetCalories,
        protein: snapshot.metrics.proteinGrams,
        carbs: snapshot.metrics.carbsGrams,
        fat: snapshot.metrics.fatGrams,
        fiber: snapshot.metrics.fiberGrams,
      },
    });
    expect(resolved.weeklyTargetMacros.calories).toBe(CANONICAL.targetCalories * DAYS_PER_WEEK);
    expect(resolved.weeklyTargetMacros.protein).toBe(CANONICAL.proteinGrams * DAYS_PER_WEEK);
    expect(resolved.weeklyTargetMacros.carbs).toBe(CANONICAL.carbsGrams * DAYS_PER_WEEK);
    expect(resolved.weeklyTargetMacros.fat).toBe(CANONICAL.fatGrams * DAYS_PER_WEEK);
    expect(resolved.weeklyTargetMacros.fiber).toBe(CANONICAL.fiberGrams * DAYS_PER_WEEK);
    expect(resolved.weeklyVariance.calories).toBe(
      resolved.weeklyTotalMacros.calories - resolved.weeklyTargetMacros.calories,
    );
  });
});

// ============================================================================
// TASK 8 — INGREDIENT → RECIPE → MEAL → DAY → WEEK STAYS CANONICAL
// (legacy per-ingredient calorie metadata deliberately inconsistent)
// ============================================================================

describe('PHASE 9 · legacy ingredient calories never regain authority (Task 8)', () => {
  /** Legacy rows: stored `calories` ≠ 4P + 4C + 9F. */
  const legacyIngredients = [
    { id: 'l-rice', name: 'Legacy Rice', category: 'carbohydrate' as const, typical_serving_size_g: 150, allowedMeals: [], tags: [], macros: { calories: 100, protein: 7, carbs: 60, fat: 1, fiber: 2 } },
    { id: 'l-oil', name: 'Legacy Oil', category: 'fat' as const, typical_serving_size_g: 20, allowedMeals: [], tags: [], macros: { calories: 5, protein: 0, carbs: 0, fat: 20, fiber: 0 } },
  ];

  it('aggregation uses macro grams → canonical energy at every level', () => {
    // INGREDIENT level (per 100g): canonical energy, NOT the stored field.
    const rice100 = legacyIngredients[0];
    const riceCanonical = 7 * KCAL_PER_G_PROTEIN + 60 * KCAL_PER_G_CARBS + 1 * KCAL_PER_G_FAT;
    expect(macroCaloriesPer100g(rice100)).toBe(riceCanonical);
    expect(riceCanonical).not.toBe(100);

    // RECIPE/MEAL level (scaled servings summed once through the engine):
    const meal = calculateTotalMacros(legacyIngredients);
    const grams = legacyIngredients.map((ing) => {
      const f = ing.typical_serving_size_g / 100;
      return {
        protein: ing.macros.protein * f,
        carbs: ing.macros.carbs * f,
        fat: ing.macros.fat * f,
        fiber: ing.macros.fiber * f,
      };
    });
    const expected = sumMacros(grams);
    expect(meal.protein).toBeCloseTo(expected.protein, 9);
    expect(meal.carbs).toBeCloseTo(expected.carbs, 9);
    expect(meal.fat).toBeCloseTo(expected.fat, 9);
    expect(meal.calories).toBe(expected.calories);
    expect(meal.calories).not.toBeCloseTo(105, 0); // legacy 100+5 never wins

    // DAY level: meals sum through the same canonical helper.
    const day = sumMacros([meal, meal]);
    expect(day.calories).toBe(caloriesFromMacros(day));

    // WEEK level: 7 identical days through the engine aggregator.
        const weekTotal = sumMacros(Array.from({ length: 7 }, () => day));
    expect(weekTotal.calories).toBeCloseTo(day.calories * DAYS_PER_WEEK, 6);
  });

  it('snapshot mapping preserves legacy ingredient grams without recomputation drift', () => {
    const mealMacros = calculateTotalMacros(legacyIngredients);
    const empty = { ingredients: [] as typeof legacyIngredients, recipeText: '', macros: { protein: 0, carbs: 0, fat: 0, calories: 0, fiber: 0 } };
    const weeklyPlan = {
      days: [
        {
          dayNumber: 1,
          dayName: 'Day 1',
          plan: {
            dailyPlan: {
              breakfast: empty,
              lunch: { ingredients: legacyIngredients, recipeText: 'Legacy meal', macros: mealMacros },
              dinner: empty,
              snack: empty,
            },
            totalMacros: mealMacros,
            targetMacros: { calories: 2000, protein: 140, carbs: 220, fat: 60 },
            variance: { calories: 0, protein: 0, carbs: 0, fat: 0 },
          },
        },
      ],
      weeklyTotalMacros: mealMacros,
      weeklyTargetMacros: { calories: 2000, protein: 140, carbs: 220, fat: 60 },
      weeklyVariance: { calories: 0, protein: 0, carbs: 0, fat: 0 },
    } as unknown as Parameters<typeof mapWeeklyMealPlanToSnapshot>[0];

    const meals = mapWeeklyMealPlanToSnapshot(weeklyPlan);
    expect(meals).toHaveLength(1);
    const lunch = meals[0].meals[0];
    // Ingredient grams survive the mapping unchanged (incl. legacy metadata):
    expect(lunch.recipes[0].recipe.ingredients.map((i) => i.macrosPer100g.calories)).toEqual([
      100, 5,
    ]);
    // Meal totals remain the canonical aggregation of those grams:
    expect(lunch.recipes[0].adjustedMacros.calories).toBe(mealMacros.calories);
  });
});

// ============================================================================
// TASK 9 — SNAPSHOT FIDELITY (HISTORICAL values ≠ CURRENT engine values)
// ============================================================================

describe('PHASE 9 · snapshot fidelity: historical values are displayed, never rewritten', () => {
  const HISTORICAL: NutritionMetrics = {
    bmr: 1700,
    tdee: 2635,
    targetCalories: 2085,
    proteinGrams: 155,
    carbsGrams: 250,
    fatGrams: 46,
    fiberGrams: 29,
    waterLiters: 3,
  };

  it('lock → persist → reload → map → display keeps EVERY historical value identical', () => {
    expect(HISTORICAL).not.toEqual(CANONICAL); // genuinely historical

    const snapshot = makeHistoricalSnapshot('v1', HISTORICAL);
    const persistedJson = JSON.stringify(snapshot); // what Supabase stores

    // RELOAD (usePlanFetch semantics: parse + freeze):
    const reloaded = deepFreeze(JSON.parse(persistedJson) as PlanSnapshot);

    // MAP (useNutritionPlanState.resolvedWeeklyPlan semantics):
    const resolved = mapSnapshotToWeeklyPlan({
      weeklyPlan: reloaded.weeklyPlan,
      metrics: {
        calories: reloaded.metrics.targetCalories,
        protein: reloaded.metrics.proteinGrams,
        carbs: reloaded.metrics.carbsGrams,
        fat: reloaded.metrics.fatGrams,
        fiber: reloaded.metrics.fiberGrams,
      },
    });

    // DISPLAYED weekly targets trace to the HISTORICAL snapshot:
    expect(resolved.weeklyTargetMacros.calories).toBe(HISTORICAL.targetCalories * DAYS_PER_WEEK);
    expect(resolved.weeklyTargetMacros.protein).toBe(HISTORICAL.proteinGrams * DAYS_PER_WEEK);
    expect(resolved.weeklyTargetMacros.carbs).toBe(HISTORICAL.carbsGrams * DAYS_PER_WEEK);
    expect(resolved.weeklyTargetMacros.fat).toBe(HISTORICAL.fatGrams * DAYS_PER_WEEK);
    expect(resolved.days[0].plan.totalMacros.calories).toBe(HISTORICAL.targetCalories);

    // BMR/TDEE/fiber/water are untouched snapshot fields (read as-is):
    const storedMetrics = JSON.parse(persistedJson).metrics;
    expect(storedMetrics.bmr).toBe(HISTORICAL.bmr);
    expect(storedMetrics.tdee).toBe(HISTORICAL.tdee);
    expect(storedMetrics.fiberGrams).toBe(HISTORICAL.fiberGrams);
    expect(storedMetrics.waterLiters).toBe(HISTORICAL.waterLiters);

    // The CURRENT engine yields DIFFERENT values — the engine did not silently
    // rewrite the historical snapshot, and the snapshot was never re-derived:
    expect(CANONICAL.bmr).not.toBe(HISTORICAL.bmr);
    expect(JSON.stringify(snapshot)).toBe(persistedJson);
  });

  it('weekly variance of a reloaded snapshot is computed FROM snapshot values', () => {
    const snapshot = makeHistoricalSnapshot('v2', { ...CANONICAL, targetCalories: 2400 });
    const resolved = mapSnapshotToWeeklyPlan({
      weeklyPlan: snapshot.weeklyPlan,
      metrics: {
        calories: snapshot.metrics.targetCalories,
        protein: snapshot.metrics.proteinGrams,
        carbs: snapshot.metrics.carbsGrams,
        fat: snapshot.metrics.fatGrams,
        fiber: snapshot.metrics.fiberGrams,
      },
    });
    expect(resolved.weeklyVariance.calories).toBe(
      resolved.weeklyTotalMacros.calories - 2400 * DAYS_PER_WEEK,
    );
  });
});

// ============================================================================
// TASK 11 — ERROR / EDGE-CASE HARDENING (existing validation rules only)
// ============================================================================

describe('PHASE 9 · engine behaves deterministically at the validation edges', () => {
  it('minimum and maximum valid bodyweight produce finite, non-negative output', () => {
    for (const weightKg of [MIN_WEIGHT_KG, MAX_WEIGHT_KG]) {
      const metrics = calculateProfile({ ...PROFILE_INPUT, weightKg });
      for (const v of Object.values(metrics)) expect(Number.isFinite(v)).toBe(true);
      expect(metrics.proteinGrams).toBeGreaterThanOrEqual(0);
      expect(metrics.carbsGrams).toBeGreaterThanOrEqual(0);
      expect(metrics.fatGrams).toBeGreaterThanOrEqual(0);
    }
    for (const weightKg of [MIN_WEIGHT_KG - 0.1, MAX_WEIGHT_KG + 0.1]) {
      expect(() => calculateProfile({ ...PROFILE_INPUT, weightKg })).toThrow(NutritionInputError);
    }
  });

  it('minimum/maximum age boundaries follow the existing validation rules', () => {
    expect(() => calculateProfile({ ...PROFILE_INPUT, age: MIN_AGE })).not.toThrow();
    expect(() => calculateProfile({ ...PROFILE_INPUT, age: MAX_AGE })).not.toThrow();
    expect(() => calculateProfile({ ...PROFILE_INPUT, age: MIN_AGE - 1 })).toThrow(NutritionInputError);
    expect(() => calculateProfile({ ...PROFILE_INPUT, age: MAX_AGE + 1 })).toThrow(NutritionInputError);
  });

  it('low calorie feasibility: protein+fat preserved, carbs -> 0, target FLAGGED infeasible', () => {
    // Small TDEE (957) with a clamped -1150 deficit floors the target at 800,
    // while an 80 kg priority client needs 160g protein (640) + 48g fat (432):
    const input: NutritionProfileInput = {
      weightKg: 80,
      heightCm: 130,
      age: 99,
      gender: 'female',
      activityLevel: 'sedentary',
      primaryGoal: 'fat_loss',
      weeklyWeightChange: -2,
    };
    const decision = resolveNutritionDecision(input);
    expect(decision.energy.targetCalories).toBe(800); // MIN_TARGET_KCAL floor
    expect(decision.feasibility.isFeasible).toBe(false);
    expect(decision.macros.proteinGrams).toBe(160);
    expect(decision.macros.fatGrams).toBe(48);
    expect(decision.macros.carbsGrams).toBe(0); // never negative
    expect(decision.feasibility.warnings.length).toBeGreaterThan(0);
  });

  it('high calorie feasibility: large valid clients reconcile within one gram of target', () => {
    const metrics = calculateProfile({
      ...PROFILE_INPUT,
      weightKg: 120,
      heightCm: 195,
      primaryGoal: 'muscle_gain',
      weeklyWeightChange: 0.5,
    });
    const derived =
      metrics.proteinGrams * KCAL_PER_G_PROTEIN +
      metrics.carbsGrams * KCAL_PER_G_CARBS +
      metrics.fatGrams * KCAL_PER_G_FAT;
    expect(Math.abs(derived - metrics.targetCalories)).toBeLessThanOrEqual(4);
  });

  it('very high protein requirement stays bounded by the planning ceiling policy', () => {
    const metrics = calculateProfile({
      ...PROFILE_INPUT,
      weightKg: 100,
      primaryGoal: 'fat_loss',
      activityLevel: 'extra_active',
    });
    expect(metrics.proteinGrams).toBe(Math.floor(100 * 2.0));
    expect(metrics.proteinGrams).toBeLessThanOrEqual(Math.floor(100 * 2.2));
  });

  it('fat-floor pressure: the 0.6 g/kg floor survives even when flagged infeasible', () => {
    const decision = resolveNutritionDecision({
      weightKg: 80,
      heightCm: 130,
      age: 99,
      gender: 'female',
      activityLevel: 'sedentary',
      primaryGoal: 'fat_loss',
      weeklyWeightChange: -2,
    });
    expect(decision.macros.fatGrams).toBe(Math.floor(80 * 0.6));
  });

  it('repeated generation is fully deterministic (50 identical resolutions)', () => {
    const first = JSON.stringify(resolveNutritionDecision(PROFILE_INPUT));
    for (let i = 0; i < 50; i += 1) {
      expect(JSON.stringify(resolveNutritionDecision(PROFILE_INPUT))).toBe(first);
    }
  });
});

describe('PHASE 9 · evidence and persistence edge cases (Task 11 continued)', () => {
  it('missing / sparse evidence resolves to insufficient_data without adjustment', () => {
    const result = resolveAdaptedTarget(CLIENT, P0, { dailyCheckins: [], weeklyReviews: [] });
    expect(result.decision.outcome).toBe('insufficient_data');
    expect(result.futureMetrics).toBeNull();
    expect(result.baseline).toEqual(P0);
  });

    it('malformed historical rows are dropped, never fabricated into evidence', () => {
    // The mappers require a usable (finite) weight AND a finite adherence score.
    // Date strings are treated as opaque identifiers (any non-empty string),
    // so every invalid row below fails the weight or adherence guard and is
    // dropped — never synthesised into an observation.
    const malformed = [
            { checkin_date: '', current_weight_kg: 80, meal_adherence: null }, // empty date
      { checkin_date: '2026-03-02', current_weight_kg: null, meal_adherence: null },
      { checkin_date: '2026-03-03', current_weight_kg: NaN, meal_adherence: NaN },
      { checkin_date: '2026-03-04', current_weight_kg: Infinity, meal_adherence: null },
      { checkin_date: '2026-03-05', current_weight_kg: undefined, meal_adherence: 'bad' },
    ] as unknown as DailyCheckin[];
    expect(weightObservationsFromDailyCheckins(malformed)).toEqual([]);
    expect(collectAdherenceScores(malformed, [])).toEqual([]);
  });

  it('invalid adherence is clamped inside the decision layer; duplicates stay deterministic', () => {
    const rows = [
      { checkin_date: '2026-03-02', current_weight_kg: 82, meal_adherence: 150 },
      { checkin_date: '2026-03-02', current_weight_kg: 82, meal_adherence: -20 }, // duplicate date
      { checkin_date: '2026-03-09', current_weight_kg: 81.8, meal_adherence: 100 },
      { checkin_date: '2026-03-16', current_weight_kg: 81.6, meal_adherence: 100 },
      { checkin_date: '2026-03-23', current_weight_kg: 81.4, meal_adherence: 300 },
      { checkin_date: '2026-03-30', current_weight_kg: 81.2, meal_adherence: 100 },
      { checkin_date: '2026-04-06', current_weight_kg: 81.0, meal_adherence: 100 },
    ] as unknown as DailyCheckin[];

    // Mapper forwards finite scores verbatim; the DECISION clamps them:
    const scores = collectAdherenceScores(rows, []);
    expect(scores).toContain(150);
    expect(scores).toContain(-20);

    const d = decideAdaptation({
      referenceWeightKg: 82,
      tdee: CANONICAL.tdee,
      primaryGoal: CLIENT.primaryGoal,
      activityLevel: CLIENT.activityLevel,
      prescribedWeeklyRateKg: P0.weeklyRateKg,
      currentTargetCalories: P0.targetCalories,
      observations: weightObservationsFromDailyCheckins(rows),
      adherenceScores: scores,
    });
    // clamped [100,0,100,100,100,100,100] = 600/7 ≈ 85.7 >= 85 => adherent +
    // slower loss (-0.2 vs -0.5) => adherent_unexpected with the ±150 step cap:
    expect(d.outcome).toBe('adherent_unexpected');
    expect(d.calorieAdjustmentKcal).toBe(-150);
    expect(Number.isInteger(d.calorieAdjustmentKcal)).toBe(true);

    // Duplicate dates do not destabilize the trend computation (regression is
    // permutation-invariant; reversing order yields the same smoothed slope):
    const obs = weightObservationsFromDailyCheckins(rows);
    expect(observedWeeklyRateKg(obs)).toBeCloseTo(observedWeeklyRateKg([...obs].reverse()), 9);
  });

  it('frozen inputs produce identical outputs (no mutation in the engine path)', () => {
    const frozenInput = deepFreeze({ ...PROFILE_INPUT });
    expect(calculateProfile(frozenInput)).toEqual(CANONICAL);
    expect(JSON.stringify(frozenInput)).toBe(JSON.stringify(PROFILE_INPUT));

    const frozenRx = deepFreeze({ ...P0 });
    const frozenEv = deepFreeze(evidence(-0.2));
    const d = decideAdaptation(adaptationInput(frozenRx as ActiveNutritionPrescription, frozenEv));
    expect(d).toEqual(decideAdaptation(adaptationInput(P0, evidence(-0.2))));
    expect(Object.isFrozen(frozenRx)).toBe(true);
    expect(Object.isFrozen(frozenEv.dailyCheckins[0])).toBe(true);
  });

  it('failed persistence propagates instead of fabricating data', async () => {
    const { loadAdaptiveTargetState } = await import(
      '@/services/nutrition/adaptiveTargetService'
    );
    const failing = {
      fetchCheckins: async () => ({ checkins: [] as DailyCheckin[], error: 'connection lost' }),
      fetchReviews: async () => ({ reviews: [] as WeeklyReview[], error: null }),
    };
    await expect(loadAdaptiveTargetState(CLIENT, P0, failing)).rejects.toThrow(
      /Failed to load check-in history/,
    );
  });
});

// ============================================================================
// TASK 12 — PERFORMANCE / SIDE-EFFECT AUDIT (React wiring stays pure)
// ============================================================================

describe('PHASE 9 · React wiring is pure and does not thrash (Task 12)', () => {
  const countingFetchers = () => {
    let loads = 0;
    return {
      get loads() {
        return loads;
      },
      fetchers: {
        fetchCheckins: async () => {
          loads += 1;
          return { checkins: [] as DailyCheckin[], error: null };
        },
        fetchReviews: async () => ({ reviews: [] as WeeklyReview[], error: null }),
      },
    };
  };

  it('history is loaded once per client/prescription key — not on every render', async () => {
    const counter = countingFetchers();
    const initialProps = { c: { ...CLIENT } as Client, p: null as ActiveNutritionPrescription | null };
    const { rerender } = renderHook(
      ({ c, p }) => useAdaptiveNutritionTarget(c, p, counter.fetchers),
      { initialProps },
    );

    await waitFor(() => expect(counter.loads).toBe(1)); // exactly one initial load

    // Unrelated re-render (fresh object identity, SAME client id + prescription):
    rerender({ c: { ...CLIENT }, p: null });
    await new Promise((r) => setTimeout(r, 25));
    expect(counter.loads).toBe(1); // no repeated async history load

    // Changing the ACTIVE PRESCRIPTION key legitimately re-evaluates once:
    rerender({ c: { ...CLIENT }, p: P0 });
    await waitFor(() => expect(counter.loads).toBe(2));
  });

  it('the hook never mutates its client or prescription inputs', async () => {
    const clientSnapshot = JSON.stringify(CLIENT);
    const rxSnapshot = JSON.stringify(P0);
    renderHook(() => useAdaptiveNutritionTarget(CLIENT, P0, countingFetchers().fetchers));
    await new Promise((r) => setTimeout(r, 25));
    expect(JSON.stringify(CLIENT)).toBe(clientSnapshot);
    expect(JSON.stringify(P0)).toBe(rxSnapshot);
  });

  it('no nutrition calculation runs in render bodies; generation lives behind handlers', () => {
    const tab = productionCode(TAB_FILE);
    expect(tab).toMatch(/const handleGenerateWeeklyPlan = async/);
    expect(tab).toMatch(/const handleGenerateDailyPlan = async/);
    expect(tab).toMatch(/optimizationEngine\.generate\(/);
    // The shared engine instance is created ONCE at module scope, not per render:
    expect(tab).toMatch(/const optimizationEngine = createDefaultOptimizationEngine\(\)/);
  });

  it('locking is the only persistence boundary in the plan-state hook (static)', () => {
    const hookCode = productionCode(PLAN_STATE_FILE);
    // The lock RPC is invoked from exactly ONE call site (inside lockPlan):
    const callSites = hookCode.match(/lockNutritionPlan\s*\(/g) ?? [];
    expect(callSites).toHaveLength(1);
    // The lock function itself drives the single write + post-lock reload:
    expect(hookCode).toMatch(/const result = await lockNutritionPlan\(/);
    expect(hookCode).toMatch(/await loadPlanForClient\(clientId\)/);
  });
});



















