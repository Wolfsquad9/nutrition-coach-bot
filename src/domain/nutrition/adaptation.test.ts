/**
 * Adaptive Nutrition Layer — unit tests (Phase 6, sections K/L/M/N)
 *
 * Locks down:
 *  - deterministic smoothing + observed weekly trend from dated weigh-ins
 *  - sufficient-evidence gates (observation count, window span, adherence data)
 *  - the adherence gate: poor adherence is NEVER interpreted as adaptation
 *  - only "successful adherence + unexpected trend" adjusts calories
 *  - adjustments are small, clamped, and deterministic
 *  - adaptation produces ONLY a future target (never mutates a locked plan)
 *  - future targets are recomputed through the canonical engine
 */

import { describe, it, expect } from 'vitest';
import {
  decideAdaptation,
  observedWeeklyRateKg,
  weeklyRateToleranceKgPerWeek,
  isAdherent,
  ADHERENT_THRESHOLD,
  MAX_ADAPTATION_STEP_KCAL,
  MIN_ADAPTATION_OBSERVATIONS,
  MIN_ADHERENCE_SAMPLES,
  type AdaptiveTargetingInput,
  type WeightObservation,
} from './adaptation';
import { calculateTargetCalories, effectiveWeeklyRateForTarget } from './engine';
import { buildPlanSnapshot, deepFreeze, type SnapshotBuildInput } from './snapshot';

// ============================================================================
// FIXTURES
// ============================================================================

const REFERENCE_WEIGHT_KG = 80;
const TDEE = 2759;
const PRESCRIBED_RATE = -0.5; // kg/week
const CURRENT_TARGET = calculateTargetCalories(TDEE, 'fat_loss', PRESCRIBED_RATE); // 2209

/** Add N days to an ISO date string (pure, no Date.now). */
function isoAddDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Daily weigh-ins following an exact linear trend (fully deterministic). */
function linearWeighIns(
  totalKgChange: number,
  days: number,
  startWeight = REFERENCE_WEIGHT_KG,
  startDate = '2026-01-01',
): WeightObservation[] {
  const perDay = totalKgChange / days;
  return Array.from({ length: days + 1 }, (_, i) => ({
    date: isoAddDays(startDate, i),
    weightKg: startWeight + perDay * i,
  }));
}

const adherentScores = (n: number, score = 92): number[] => Array.from({ length: n }, () => score);
const poorScores = (n: number, score = 45): number[] => Array.from({ length: n }, () => score);

function baseInput(overrides: Partial<AdaptiveTargetingInput> = {}): AdaptiveTargetingInput {
  return {
    referenceWeightKg: REFERENCE_WEIGHT_KG,
    tdee: TDEE,
    primaryGoal: 'fat_loss',
    activityLevel: 'moderately_active',
    prescribedWeeklyRateKg: PRESCRIBED_RATE,
    currentTargetCalories: CURRENT_TARGET,
    observations: linearWeighIns(-2, 28), // -0.5 kg/week for 4 weeks
    adherenceScores: adherentScores(10),
    ...overrides,
  };
}

// ============================================================================
// OBSERVED TREND (smoothing + weekly rate)
// ============================================================================

describe('observedWeeklyRateKg (deterministic smoothed trend)', () => {
  it('recovers an exact linear weekly trend', () => {
    const obs = linearWeighIns(-2, 28); // -2 kg over 28 days = -0.5 kg/week
    expect(observedWeeklyRateKg(obs)).toBeCloseTo(-0.5, 6);
  });

  it('recovers a positive gain trend with sign preserved', () => {
    const obs = linearWeighIns(0.6, 28); // +0.15 kg/week
    expect(observedWeeklyRateKg(obs)).toBeCloseTo(0.15, 6);
  });

  it('returns null when there are too few observations', () => {
    expect(observedWeeklyRateKg(linearWeighIns(-0.5, 3))).toBeNull();
  });

  it('returns null when the window is shorter than the minimum span', () => {
    // Plenty of points, but all inside a ~6.5-day window (< minimum span).
    const dense = Array.from({ length: 14 }, (_, i) => ({
      date: `${isoAddDays('2026-01-01', Math.floor(i / 2))}T${i % 2 === 0 ? '07' : '19'}:00:00Z`,
      weightKg: REFERENCE_WEIGHT_KG - (i * 0.4) / 13,
    }));
    expect(observedWeeklyRateKg(dense)).toBeNull();
  });

  it('ignores invalid entries and sorts unsorted input deterministically', () => {
    const obs = linearWeighIns(-2, 28);
    const shuffled = [...obs].reverse();
    shuffled.push({ date: 'not-a-date', weightKg: 70 });
    shuffled.push({ date: isoAddDays('2026-01-01', 29), weightKg: NaN });
    expect(observedWeeklyRateKg(shuffled)).toBeCloseTo(-0.5, 6);
    expect(observedWeeklyRateKg(shuffled)).toBe(observedWeeklyRateKg(obs));
  });

  it('is deterministic across repeated calls', () => {
    const obs = linearWeighIns(-2, 28);
    expect(observedWeeklyRateKg(obs)).toBe(observedWeeklyRateKg(obs));
  });
});

// ============================================================================
// SUFFICIENT EVIDENCE + ADHERENCE GATE (section M)
// ============================================================================

describe('evidence gates', () => {
  it('requires at least the minimum number of weight observations', () => {
    expect(MIN_ADAPTATION_OBSERVATIONS).toBeGreaterThanOrEqual(7);
    const result = decideAdaptation(baseInput({ observations: linearWeighIns(-2, 3) }));
    expect(result.outcome).toBe('insufficient_data');
    expect(result.sufficientData).toBe(false);
    expect(result.calorieAdjustmentKcal).toBe(0);
  });

  it('requires a minimum observation window (daily noise cannot drive decisions)', () => {
    // Plenty of points, but all inside a short window.
    const dense = Array.from({ length: 14 }, (_, i) => ({
      date: `${isoAddDays('2026-01-01', Math.floor(i / 2))}T${i % 2 === 0 ? '07' : '19'}:00:00Z`,
      weightKg: REFERENCE_WEIGHT_KG - (i * 0.4) / 13,
    }));
    const result = decideAdaptation(baseInput({ observations: dense }));
    expect(result.outcome).toBe('insufficient_data');
    expect(result.calorieAdjustmentKcal).toBe(0);
  });

  it('requires sufficient adherence evidence before interpreting the trend', () => {
    const result = decideAdaptation(
      baseInput({ adherenceScores: [90, 90] }), // below MIN_ADHERENCE_SAMPLES
    );
    expect(MIN_ADHERENCE_SAMPLES).toBeGreaterThan(2);
    expect(result.outcome).toBe('insufficient_data');
    expect(result.adherent).toBeNull();
    expect(result.calorieAdjustmentKcal).toBe(0);
  });

  it('classifies unexpected trend with unknown adherence as insufficient evidence', () => {
    // Observed trend far from prescribed, but no adherence data at all.
    const result = decideAdaptation(baseInput({ adherenceScores: [] }));
    expect(result.outcome).toBe('insufficient_data');
    expect(result.calorieAdjustmentKcal).toBe(0);
    expect(result.futureTargetCalories).toBe(CURRENT_TARGET);
  });
});

// ============================================================================
// OUTCOME CLASSIFICATION (the four spec categories)
// ============================================================================

describe('outcome classification', () => {
  it('successful adherence + expected trend -> maintain calories', () => {
    const result = decideAdaptation(baseInput()); // observed -0.5 vs prescribed -0.5
    expect(result.outcome).toBe('adherent_expected');
    expect(result.adherent).toBe(true);
    expect(result.observedWeeklyRateKg).toBeCloseTo(-0.5, 6);
    expect(result.calorieAdjustmentKcal).toBe(0);
    expect(result.futureTargetCalories).toBe(CURRENT_TARGET);
  });

  it('successful adherence + unexpected trend -> small corrective adjustment', () => {
    // Losing only -0.2 kg/week while adherent: cut calories modestly.
    const result = decideAdaptation(baseInput({ observations: linearWeighIns(-0.8, 28) }));
    expect(result.outcome).toBe('adherent_unexpected');
    expect(result.adherent).toBe(true);
    expect(result.observedWeeklyRateKg).toBeCloseTo(-0.2, 6);
    expect(result.calorieAdjustmentKcal).toBeLessThan(0);
    expect(result.calorieAdjustmentKcal).toBeGreaterThanOrEqual(-MAX_ADAPTATION_STEP_KCAL);
    expect(result.futureTargetCalories).toBeLessThan(CURRENT_TARGET);
  });

  it('poor adherence + unexpected trend -> NO adjustment (not metabolic adaptation)', () => {
    const result = decideAdaptation(
      baseInput({ observations: linearWeighIns(-0.2, 28), adherenceScores: poorScores(10) }),
    );
    expect(result.outcome).toBe('non_adherent_unexpected');
    expect(result.adherent).toBe(false);
    expect(result.calorieAdjustmentKcal).toBe(0);
    expect(result.futureTargetCalories).toBe(CURRENT_TARGET);
    expect(result.rationale.join(' ')).toMatch(/adherence/i);
  });

  it('poor adherence + expected trend -> maintain calories', () => {
    const result = decideAdaptation(
      baseInput({ observations: linearWeighIns(-2, 28), adherenceScores: poorScores(10) }),
    );
    expect(result.outcome).toBe('non_adherent_expected');
    expect(result.calorieAdjustmentKcal).toBe(0);
    expect(result.futureTargetCalories).toBe(CURRENT_TARGET);
  });
});

// ============================================================================
// F-03 REGRESSION — maintain outcomes must echo the standing prescription
// ============================================================================
// Once the client's bodyweight drifts, the CURRENT TDEE differs from the TDEE
// the locked prescription was built against. The maintain paths must therefore
// echo the standing prescription's rate+target verbatim instead of recomputing
// them against the drifted TDEE (which would contradict the "the current
// prescription stands" rationale and break the effective-rate <> target pairing).

describe('F-03 · maintain outcomes carry the standing prescription forward', () => {
  // Lock-time TDEE 2759 produced 2209 kcal @-0.5. After a weight drop the
  // current TDEE is 2600, which the engine alone would resolve to 2050 kcal.
  const DRIFT_TDEE = 2600;
  const LOCKED_TARGET = calculateTargetCalories(2759, 'fat_loss', -0.5); // 2209
  const driftedEngineTarget = calculateTargetCalories(DRIFT_TDEE, 'fat_loss', -0.5); // 2050

  it('precondition: the drifted TDEE would change the engine result (regression is meaningful)', () => {
    expect(LOCKED_TARGET).not.toBe(driftedEngineTarget);
  });

  it('adherent + expected trend -> future target/rate remain the standing prescription', () => {
    const result = decideAdaptation(
      baseInput({
        tdee: DRIFT_TDEE,
        currentTargetCalories: LOCKED_TARGET,
        observations: linearWeighIns(-2, 28), // exactly on the prescribed -0.5
        adherenceScores: adherentScores(10),
      }),
    );
    expect(result.outcome).toBe('adherent_expected');
    expect(result.calorieAdjustmentKcal).toBe(0);
    expect(result.futureTargetCalories).toBe(LOCKED_TARGET);
    expect(result.futureWeeklyRateKg).toBe(-0.5);
    expect(result.effectiveFutureWeeklyRateKg).toBe(-0.5);
    expect(result.rationale.join(' ')).toMatch(/carried forward/);
  });

  it('poor adherence + unexpected trend (maintain) -> standing prescription echoed, not recomputed', () => {
    const result = decideAdaptation(
      baseInput({
        tdee: DRIFT_TDEE,
        currentTargetCalories: LOCKED_TARGET,
        observations: linearWeighIns(-0.8, 28), // observed -0.2 ≠ prescribed -0.5
        adherenceScores: poorScores(10),
      }),
    );
    expect(result.outcome).toBe('non_adherent_unexpected');
    expect(result.calorieAdjustmentKcal).toBe(0);
    // The target must NOT be the drifted-tdee recompute (2050).
    expect(result.futureTargetCalories).toBe(LOCKED_TARGET);
    expect(result.futureTargetCalories).not.toBe(driftedEngineTarget);
    expect(result.effectiveFutureWeeklyRateKg).toBe(-0.5);
  });

  it('adherent + unexpected trend (ADJUST) still recomputes through the canonical engine', () => {
    const result = decideAdaptation(
      baseInput({
        tdee: DRIFT_TDEE,
        currentTargetCalories: LOCKED_TARGET,
        observations: linearWeighIns(-0.8, 28), // slow loss -> deeper deficit
        adherenceScores: adherentScores(10),
      }),
    );
    expect(result.outcome).toBe('adherent_unexpected');
    expect(result.calorieAdjustmentKcal).not.toBe(0);
    // Canonical delegation: the future target is EXACTLY the engine's output for
    // the adjusted requested rate against the drifted (current) TDEE.
    expect(result.futureTargetCalories).toBe(
      Math.round(calculateTargetCalories(DRIFT_TDEE, 'fat_loss', result.futureWeeklyRateKg)),
    );
    expect(result.futureTargetCalories).not.toBe(LOCKED_TARGET);
    expect(result.effectiveFutureWeeklyRateKg).toBe(
      effectiveWeeklyRateForTarget(DRIFT_TDEE, result.futureTargetCalories),
    );
  });

  it('is deterministic across repeated evaluation of the same drifted input', () => {
    const input = baseInput({
      tdee: DRIFT_TDEE,
      currentTargetCalories: LOCKED_TARGET,
      observations: linearWeighIns(-0.8, 28),
      adherenceScores: poorScores(10),
    });
    const a = decideAdaptation(input);
    const b = decideAdaptation(input);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

// ============================================================================
// ADJUSTMENT MAGNITUDE + FUTURE TARGET (sections K/L)
// ============================================================================

describe('adaptation adjustments are small, signed, and engine-derived', () => {
  it('loss too slow -> small deficit increase through the canonical engine', () => {
    const result = decideAdaptation(baseInput({ observations: linearWeighIns(-0.8, 28) }));
    expect(result.calorieAdjustmentKcal).toBe(-MAX_ADAPTATION_STEP_KCAL);
    // Future target is exactly what the canonical engine produces for the
    // adjusted weekly rate.
    expect(result.futureTargetCalories).toBe(
      calculateTargetCalories(TDEE, 'fat_loss', result.futureWeeklyRateKg),
    );
    expect(result.futureTargetCalories).toBeLessThan(CURRENT_TARGET);
  });

  it('loss too fast -> small adjustment in the opposite direction', () => {
    // -1.8 kg/week observed vs -0.5 prescribed: ease off, never punish.
    const result = decideAdaptation(baseInput({ observations: linearWeighIns(-7.2, 28) }));
    expect(result.observedWeeklyRateKg).toBeCloseTo(-1.8, 6);
    expect(result.outcome).toBe('adherent_unexpected');
    expect(result.calorieAdjustmentKcal).toBe(MAX_ADAPTATION_STEP_KCAL);
    expect(result.futureTargetCalories).toBeGreaterThan(CURRENT_TARGET);
  });

  it('never exceeds the small-step clamp in either direction', () => {
    const fast = decideAdaptation(baseInput({ observations: linearWeighIns(-14, 28) }));
    const slow = decideAdaptation(baseInput({ observations: linearWeighIns(0, 28) }));
    expect(Math.abs(fast.calorieAdjustmentKcal)).toBeLessThanOrEqual(MAX_ADAPTATION_STEP_KCAL);
    expect(Math.abs(slow.calorieAdjustmentKcal)).toBeLessThanOrEqual(MAX_ADAPTATION_STEP_KCAL);
  });

  it('keeps the adjusted weekly rate inside the validated +/-2 kg/week domain', () => {
    const result = decideAdaptation(baseInput({ observations: linearWeighIns(-14, 28) }));
    expect(Math.abs(result.futureWeeklyRateKg)).toBeLessThanOrEqual(2);
  });

  it('expresses both rates relative to bodyweight', () => {
    const result = decideAdaptation(baseInput({ observations: linearWeighIns(-0.8, 28) }));
    expect(result.targetWeeklyRatePercentBodyweight).toBeCloseTo(-0.625, 6);
    expect(result.observedWeeklyRatePercentBodyweight).toBeCloseTo(-0.25, 6); // -0.2 / 80 * 100
  });

  it('uses the documented tolerance band for "expected"', () => {
    const tolerance = weeklyRateToleranceKgPerWeek(PRESCRIBED_RATE);
    expect(tolerance).toBeCloseTo(0.125, 10); // max(0.1, |-0.5| * 0.25)
    expect(isAdherent(adherentScores(10))).toBe(true);
    expect(isAdherent([ADHERENT_THRESHOLD - 1, ADHERENT_THRESHOLD - 1])).toBe(false);
  });
});

// ============================================================================
// LOCKED PLANS + DETERMINISM (sections L, V)
// ============================================================================

describe('adaptation never touches locked plans and is deterministic', () => {
  const snapshotInput: SnapshotBuildInput = {
    identifier: {
      versionId: 'v-phase6-1',
      lockedAt: new Date('2026-01-01T10:00:00Z'),
      lockedUntil: new Date('2026-01-08T10:00:00Z'),
      payloadHash: 'sha256-phase6',
    },
    client: {
      firstName: 'Jane',
      lastName: 'Doe',
      goal: 'fat_loss',
      activityLevel: 'moderately_active',
    },
    metrics: {
      bmr: 1780,
      tdee: TDEE,
      targetCalories: CURRENT_TARGET,
      proteinGrams: 160,
      carbsGrams: 284,
      fatGrams: 48,
      fiberGrams: 30,
      waterLiters: 3,
    },
    weeklyPlan: [
      {
        day: 1,
        meals: [],
        totalMacros: { calories: CURRENT_TARGET, protein: 160, carbs: 284, fat: 48, fiber: 30 },
        hydration: 3,
      },
    ],
    groceryList: [],
    planName: 'Phase 6 Locked Plan',
    versionNumber: 1,
    createdAt: '2026-01-01T10:00:00Z',
    generatedBy: 'coach',
  };

  it('running adaptation leaves a locked snapshot byte-for-byte unchanged', () => {
    const snapshot = buildPlanSnapshot(snapshotInput); // deep-frozen
    const before = JSON.stringify(snapshot);

    decideAdaptation(
      baseInput({
        observations: linearWeighIns(-0.8, 28),
        currentTargetCalories: snapshot.metrics.targetCalories,
      }),
    );

    expect(JSON.stringify(snapshot)).toBe(before);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.metrics)).toBe(true);
    expect(snapshot.metrics.targetCalories).toBe(CURRENT_TARGET);
  });

  it('does not mutate its (frozen) input context', () => {
    const input = deepFreeze(baseInput({ observations: linearWeighIns(-0.8, 28) }));
    const before = JSON.stringify(input);
    const result = decideAdaptation(input);
    expect(JSON.stringify(input)).toBe(before);
    expect(result.futureTargetCalories).not.toBeNaN();
  });

  it('is fully deterministic - identical inputs produce identical decisions', () => {
    const a = decideAdaptation(baseInput({ observations: linearWeighIns(-0.8, 28) }));
    const b = decideAdaptation(baseInput({ observations: linearWeighIns(-0.8, 28) }));
    expect(a).toEqual(b);
  });

  it('produces only a future target: current prescription is echoed, never rewritten', () => {
    const result = decideAdaptation(baseInput({ observations: linearWeighIns(-0.8, 28) }));
    expect(result.futureTargetCalories).toBeTypeOf('number');
    // The decision carries the future target as data; the current target input
    // is untouched and remains the locked prescription.
    expect(baseInput().currentTargetCalories).toBe(CURRENT_TARGET);
    expect(result.futureWeeklyRateKg).toBeCloseTo(PRESCRIBED_RATE - (150 * 7) / 7700, 10);
  });
});


