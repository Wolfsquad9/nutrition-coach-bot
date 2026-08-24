/**
 * Adaptive Target Service — Phase 8 production-integration tests.
 *
 * Proves the wiring between the application data flow and the domain layer
 * with the ACTIVE PRESCRIPTION as the adaptation baseline:
 *  - production nutrition targets originate from the canonical engine
 *    (resolveNutritionDecision === calculateNutritionMetrics parity)
 *  - the adapted FUTURE target is produced ONLY through the canonical engine
 *  - the ACTIVE PRESCRIPTION (not the static profile) is the baseline once one
 *    exists; without one, the canonical initial prescription is used
 *  - insufficient evidence / poor adherence NEVER change the target
 *  - repeated adaptation does NOT compound corrections against an obsolete
 *    baseline (convergence proof)
 */

import { describe, it, expect } from 'vitest';
import {
  resolveAdaptedTarget,
  buildNutritionProfileInput,
  loadAdaptiveTargetState,
  type AdaptationEvidence,
} from './adaptiveTargetService';
import {
  weightObservationsFromDailyCheckins,
  collectAdherenceScores,
} from '@/domain/nutrition/adaptation';
import {
  deriveInitialPrescription,
  prescriptionFromLockedPlan,
  type ActiveNutritionPrescription,
} from '@/domain/nutrition/prescription';
import {
  calculateNutritionMetrics,
  calculateProfile,
  calculateTargetCalories,
} from '@/domain/nutrition/engine';
import { deepFreeze } from '@/domain/nutrition/snapshot';
import type { Client } from '@/types';
import type { DailyCheckin, WeeklyReview } from '@/types/checkin';

// ============================================================================
// FIXTURES
// ============================================================================

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

const CLIENT = buildClient();

function isoAddDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Daily check-in rows following an exact linear weight trend. */
function trendCheckins(
  totalKgChange: number,
  days: number,
  adherence: number,
  startWeight = CLIENT.weight,
): DailyCheckin[] {
  const perDay = totalKgChange / days;
  return Array.from({ length: days }, (_, i) => ({
    id: `chk-${i}`,
    client_id: CLIENT.id,
    checkin_date: isoAddDays('2026-01-01', i),
    meal_adherence: adherence,
    workout_completed: true,
    energy_level: null,
    mood: null,
    sleep_hours: null,
    water_intake_liters: null,
    current_weight_kg: startWeight + perDay * i,
    notes: null,
    created_by: 'coach',
    created_at: '',
    updated_at: '',
  })) as unknown as DailyCheckin[];
}

const adherentEvidence = (weeklyKgChange: number, days = 28): AdaptationEvidence => ({
  // A weekly rate r over `days` days needs a total change of r * days / 7.
  dailyCheckins: trendCheckins((weeklyKgChange * days) / 7, days, 92),
  weeklyReviews: [],
});

const poorEvidence = (weeklyKgChange: number): AdaptationEvidence => ({
  dailyCheckins: trendCheckins(weeklyKgChange * 4, 28, 40),
  weeklyReviews: [],
});

/** Canonical current target for the fixture client (fat_loss default). */
const CANONICAL_TARGET = calculateNutritionMetrics(CLIENT).targetCalories;

/** Prescription P0: the initially locked plan (profile-derived rate/target). */
const LOCKED_RX: ActiveNutritionPrescription = prescriptionFromLockedPlan({
  weeklyRateKg: -0.5,
  targetCalories: CANONICAL_TARGET,
  versionId: 'v-phase8-1',
  versionNumber: 1,
  establishedAt: '2026-01-01T10:00:00.000Z',
});

// ============================================================================
// PRODUCTION TARGETS ORIGINATE FROM THE CANONICAL ENGINE
// ============================================================================

describe('canonical engine is the single production target source', () => {
  it('resolveNutritionDecision produces the same target as calculateNutritionMetrics', () => {
    for (const primaryGoal of ['fat_loss', 'muscle_gain', 'recomposition', 'maintenance'] as const) {
      for (const weeklyWeightChange of [-0.5, -0.25, 0.25, undefined] as const) {
        const client = buildClient({ primaryGoal, weeklyWeightChange });
        const viaMetrics = calculateNutritionMetrics(client);
        const { profileInput } = resolveAdaptedTarget(client, null, {
          dailyCheckins: [],
          weeklyReviews: [],
        });
        expect(viaMetrics).toEqual(calculateProfile(profileInput));
      }
    }
  });

  it('buildNutritionProfileInput maps the client exactly like the canonical shortcut', () => {
    expect(buildNutritionProfileInput(CLIENT)).toEqual({
      weightKg: CLIENT.weight,
      heightCm: CLIENT.height,
      age: CLIENT.age,
      gender: CLIENT.gender,
      activityLevel: CLIENT.activityLevel,
      primaryGoal: CLIENT.primaryGoal,
      weeklyWeightChange: CLIENT.weeklyWeightChange,
    });
  });

  it('derives age from birthDate when client.age is absent (same as the engine)', () => {
    const client = buildClient({ age: undefined, birthDate: '2000-06-15' });
    expect(buildNutritionProfileInput(client).age).toBeGreaterThan(0);
    expect(calculateNutritionMetrics(client)).toEqual(
      calculateProfile(buildNutritionProfileInput(client)),
    );
  });
});

// ============================================================================
// MAPPERS: persisted check-in rows -> adaptation evidence
// ============================================================================

describe('check-in evidence mappers (pure plumbing, no nutrition math)', () => {
  it('maps dated weigh-ins and drops null/non-finite weights', () => {
    const checkins = [
      { checkin_date: '2026-01-01', current_weight_kg: 80.2 },
      { checkin_date: '2026-01-02', current_weight_kg: null },
      { checkin_date: '2026-01-03', current_weight_kg: Number.NaN },
      { checkin_date: '2026-01-04', current_weight_kg: 79.8 },
    ];
    expect(weightObservationsFromDailyCheckins(checkins)).toEqual([
      { date: '2026-01-01', weightKg: 80.2 },
      { date: '2026-01-04', weightKg: 79.8 },
    ]);
  });

  it('collects adherence from both daily check-ins and weekly reviews', () => {
    const daily = [{ meal_adherence: 90 }, { meal_adherence: 88 }, { meal_adherence: null }];
    const reviews = [{ adherence_score: 95 }, { adherence_score: null }];
    expect(collectAdherenceScores(daily as never[], reviews as never[])).toEqual([90, 88, 95]);
  });
});

// ============================================================================
// BASELINE SEMANTICS: active prescription vs canonical initial prescription
// ============================================================================

describe('adaptation baseline is the ACTIVE PRESCRIPTION', () => {
  it('uses the active prescription rate/target, not the static profile', () => {
    // Prescription drifted from the profile: adapted earlier to -0.7 kg/wk.
    const driftedRx = prescriptionFromLockedPlan({
      weeklyRateKg: -0.7,
      targetCalories: calculateTargetCalories(
        calculateNutritionMetrics(CLIENT).tdee,
        'fat_loss',
        -0.7,
      ),
      versionId: 'v-9',
      versionNumber: 9,
      establishedAt: '2026-03-01T10:00:00.000Z',
    });

    const result = resolveAdaptedTarget(CLIENT, driftedRx, adherentEvidence(-0.7));
    // On-trend vs the DRIFTED prescription -> expected, maintain.
    expect(result.decision.outcome).toBe('adherent_expected');
    expect(result.decision.targetWeeklyRateKg).toBeCloseTo(-0.7, 10);
    expect(result.decision.futureTargetCalories).toBe(driftedRx.targetCalories);
    expect(result.baseline).toEqual(driftedRx);
  });

  it('without an active prescription, the canonical initial prescription is the baseline', () => {
    const result = resolveAdaptedTarget(CLIENT, null, adherentEvidence(-0.5));
    const initial = deriveInitialPrescription(CLIENT);
    expect(result.baseline).toEqual(initial);
    expect(result.baseline.source).toBe('initial_profile');
    expect(result.decision.targetWeeklyRateKg).toBeCloseTo(initial.weeklyRateKg, 10);
    expect(result.decision.outcome).toBe('adherent_expected');
    expect(result.decision.futureTargetCalories).toBe(initial.targetCalories);
  });
});

// ============================================================================
// ELIGIBILITY: when the future target may and may not change
// ============================================================================

describe('adaptation eligibility through the production service', () => {
  it('insufficient data -> no future target, current prescription unchanged', () => {
    const result = resolveAdaptedTarget(CLIENT, LOCKED_RX, {
      dailyCheckins: trendCheckins((-0.4 * 3) / 28, 3, 92),
      weeklyReviews: [],
    });
    expect(result.decision.outcome).toBe('insufficient_data');
    expect(result.decision.sufficientData).toBe(false);
    expect(result.futureMetrics).toBeNull();
    expect(result.decision.futureTargetCalories).toBe(LOCKED_RX.targetCalories);
  });

  it('poor adherence + unexpected trend -> no future target', () => {
    const result = resolveAdaptedTarget(CLIENT, LOCKED_RX, poorEvidence(-0.2));
    expect(result.decision.outcome).toBe('non_adherent_unexpected');
    expect(result.futureMetrics).toBeNull();
    expect(result.decision.calorieAdjustmentKcal).toBe(0);
    expect(result.decision.futureTargetCalories).toBe(LOCKED_RX.targetCalories);
  });

  it('successful adherence + expected trend -> no adjustment (maintain)', () => {
    const result = resolveAdaptedTarget(CLIENT, LOCKED_RX, adherentEvidence(-0.5));
    expect(result.decision.outcome).toBe('adherent_expected');
    expect(result.futureMetrics).toBeNull();
    expect(result.decision.futureTargetCalories).toBe(LOCKED_RX.targetCalories);
  });

  it('expected trend with poor adherence also maintains', () => {
    const result = resolveAdaptedTarget(CLIENT, LOCKED_RX, poorEvidence(-0.5));
    expect(result.decision.outcome).toBe('non_adherent_expected');
    expect(result.futureMetrics).toBeNull();
    expect(result.decision.futureTargetCalories).toBe(LOCKED_RX.targetCalories);
  });

  it('successful adherence + unexpected trend -> adapted FUTURE metrics only', () => {
    const result = resolveAdaptedTarget(CLIENT, LOCKED_RX, adherentEvidence(-0.2));
    expect(result.decision.outcome).toBe('adherent_unexpected');
    expect(result.futureMetrics).not.toBeNull();
    expect(result.decision.calorieAdjustmentKcal).toBeLessThan(0);
    expect(result.decision.lockedPlanUntouched).toBe(true);
  });
});

// ============================================================================
// FUTURE TARGETS GO BACK THROUGH THE CANONICAL ENGINE
// ============================================================================

describe('future targets are recomputed by the canonical engine', () => {
  it('slow fat loss -> future target equals canonical recomputation for the adjusted rate', () => {
    const result = resolveAdaptedTarget(CLIENT, LOCKED_RX, adherentEvidence(-0.2));
    expect(result.futureMetrics).not.toBeNull();
    const baseTdee = calculateNutritionMetrics(CLIENT).tdee;

    // EXACT canonical proof: future calories are what the engine returns for
    // the adjusted weekly rate — nothing else.
    expect(result.futureMetrics!.targetCalories).toBe(
      calculateTargetCalories(baseTdee, CLIENT.primaryGoal, result.decision.futureWeeklyRateKg),
    );

    // The adjusted rate is exactly the prescription rate + clamped step.
    const stepKg = (result.decision.calorieAdjustmentKcal * 7) / 7700;
    expect(result.decision.futureWeeklyRateKg).toBeCloseTo(LOCKED_RX.weeklyRateKg + stepKg, 10);

    // Deficit deepens because loss was SLOWER than prescribed.
    expect(result.futureMetrics!.targetCalories).toBeLessThan(LOCKED_RX.targetCalories);
  });

  it('deficit/surplus directions preserved through the prescription baseline', () => {
    // Deficit client losing FASTER than prescribed -> ease off (target rises).
    const fastLoss = resolveAdaptedTarget(CLIENT, LOCKED_RX, adherentEvidence(-1.8));
    expect(fastLoss.decision.calorieAdjustmentKcal).toBeGreaterThan(0);
    expect(fastLoss.futureMetrics!.targetCalories).toBeGreaterThan(LOCKED_RX.targetCalories);
    expect(fastLoss.futureMetrics!.targetCalories).toBe(
      calculateTargetCalories(
        calculateNutritionMetrics(CLIENT).tdee,
        'fat_loss',
        fastLoss.decision.futureWeeklyRateKg,
      ),
    );
  });

  it('surplus client gaining slower than prescribed -> surplus increases', () => {
    const gainer = buildClient({ primaryGoal: 'muscle_gain', weeklyWeightChange: 0.25 });
    const gainerRx = prescriptionFromLockedPlan({
      weeklyRateKg: 0.25,
      targetCalories: calculateNutritionMetrics(gainer).targetCalories,
      versionId: 'v-gain',
      versionNumber: 1,
      establishedAt: '2026-01-01T10:00:00.000Z',
    });
    const gainResult = resolveAdaptedTarget(
      gainer,
      gainerRx,
      adherentEvidenceFor(gainer, 0.1), // +0.1 kg/wk vs +0.25 target
    );
    expect(gainResult.decision.outcome).toBe('adherent_unexpected');
    expect(gainResult.decision.calorieAdjustmentKcal).toBeGreaterThan(0);
    expect(gainResult.futureMetrics!.targetCalories).toBeGreaterThan(gainerRx.targetCalories);
    expect(gainResult.futureMetrics!.targetCalories).toBe(
      calculateTargetCalories(
        calculateNutritionMetrics(gainer).tdee,
        'muscle_gain',
        gainResult.decision.futureWeeklyRateKg,
      ),
    );
  });

  it('adapted future metrics obey every frozen Phase-6 invariant', () => {
    const result = resolveAdaptedTarget(CLIENT, LOCKED_RX, adherentEvidence(-0.2));
    const m = result.futureMetrics!;
    const kcal = m.proteinGrams * 4 + m.carbsGrams * 4 + m.fatGrams * 9;
    expect(Math.abs(kcal - m.targetCalories)).toBeLessThanOrEqual(4);
    expect(m.proteinGrams).toBe(Math.floor(CLIENT.weight * 2.0)); // priority 2.0 g/kg
    expect(m.fatGrams).toBe(Math.floor(CLIENT.weight * 0.6)); // 0.6 g/kg floor
    expect(m.carbsGrams).toBeGreaterThanOrEqual(0);
    expect(m.fiberGrams).toBe(Math.min(Math.floor((m.targetCalories * 14) / 1000), m.carbsGrams));
  });
});

// ============================================================================
// NO TARGET DRIFT: repeated adaptation never compounds against the old baseline
// ============================================================================

describe('adaptation does not compound against an obsolete baseline', () => {
  it('cycle 2 compares against the NEW prescription and converges', () => {
    const baseTdee = calculateNutritionMetrics(CLIENT).tdee;

    // Cycle 1: baseline P0 (-0.5 kg/wk, canonical target).
    // Observed -0.2 kg/wk, successful adherence -> -150 kcal step.
    const c1 = resolveAdaptedTarget(CLIENT, LOCKED_RX, adherentEvidence(-0.2));
    expect(c1.decision.calorieAdjustmentKcal).toBe(-150);

    // The coach locks the adapted plan -> prescription P1 becomes active.
    const p1 = prescriptionFromLockedPlan({
      weeklyRateKg: c1.decision.futureWeeklyRateKg,
      targetCalories: c1.futureMetrics!.targetCalories,
      versionId: 'v-phase8-2',
      versionNumber: 2,
      establishedAt: '2026-02-01T10:00:00.000Z',
    });

    // Cycle 2: client now progresses EXACTLY as P1 prescribes.
    const c2 = resolveAdaptedTarget(CLIENT, p1, adherentEvidence(p1.weeklyRateKg));

    // Compared against P1 (not P0): on-trend -> maintain, no new correction.
    expect(c2.decision.targetWeeklyRateKg).toBeCloseTo(p1.weeklyRateKg, 10);
    expect(c2.decision.outcome).toBe('adherent_expected');
    expect(c2.decision.calorieAdjustmentKcal).toBe(0);
    expect(c2.decision.futureTargetCalories).toBe(p1.targetCalories);

    // The old correction is NOT re-applied on top of the new prescription.
    expect(c2.decision.futureTargetCalories).not.toBe(
      p1.targetCalories + c1.decision.calorieAdjustmentKcal,
    );
    expect(c2.decision.futureTargetCalories).toBe(
      calculateTargetCalories(baseTdee, 'fat_loss', c2.decision.futureWeeklyRateKg),
    );
  });

  it('a still-drifting client adjusts from the NEW prescription, not the original', () => {
    const c1 = resolveAdaptedTarget(CLIENT, LOCKED_RX, adherentEvidence(-0.2));
    const p1 = prescriptionFromLockedPlan({
      weeklyRateKg: c1.decision.futureWeeklyRateKg,
      targetCalories: c1.futureMetrics!.targetCalories,
      versionId: 'v-phase8-2',
      versionNumber: 2,
      establishedAt: '2026-02-01T10:00:00.000Z',
    });

    // Evidence unchanged (-0.2 kg/wk): still slower than P1 -> further small step
    // measured against P1's rate (NOT a blind re-application of the P0 step).
    const c2 = resolveAdaptedTarget(CLIENT, p1, adherentEvidence(-0.2));
    expect(c2.decision.outcome).toBe('adherent_unexpected');
    expect(Math.abs(c2.decision.calorieAdjustmentKcal)).toBeLessThanOrEqual(150);
    expect(c2.decision.futureWeeklyRateKg).toBeCloseTo(
      p1.weeklyRateKg + (c2.decision.calorieAdjustmentKcal * 7) / 7700,
      10,
    );
    expect(c2.futureMetrics!.targetCalories).toBe(
      calculateTargetCalories(
        calculateNutritionMetrics(CLIENT).tdee,
        'fat_loss',
        c2.decision.futureWeeklyRateKg,
      ),
    );
  });
});

// ============================================================================
// IMMUTABILITY: prescriptions and inputs are never mutated
// ============================================================================

describe('active-prescription flow is side-effect free', () => {
  it('a deep-frozen active prescription is not mutated by resolution', () => {
    const frozenRx = deepFreeze({ ...LOCKED_RX });
    const before = JSON.stringify(frozenRx);
    const result = resolveAdaptedTarget(CLIENT, frozenRx, adherentEvidence(-0.2));
    expect(JSON.stringify(frozenRx)).toBe(before);
    expect(Object.isFrozen(frozenRx)).toBe(true);
    expect(result.decision.futureTargetCalories).not.toBeNaN();
  });

  it('resolution never mutates the evidence arrays', () => {
    const evidence = adherentEvidence(-0.2);
    const checkinsBefore = JSON.stringify(evidence.dailyCheckins);
    resolveAdaptedTarget(CLIENT, LOCKED_RX, evidence);
    expect(JSON.stringify(evidence.dailyCheckins)).toBe(checkinsBefore);
  });
});

// ============================================================================
// ASYNC LOADER (real persisted data sources, fetchers injected for determinism)
// ============================================================================

describe('loadAdaptiveTargetState (wiring to persisted check-ins)', () => {
  it('fetches real check-in/review history and resolves the adapted state', async () => {
    const fetchedCheckins = trendCheckins(-0.2 * 4, 28, 92);
    let askedClientId = '';
    const fetchers = {
      fetchCheckins: async (clientId: string) => {
        askedClientId = clientId;
        return { checkins: fetchedCheckins, error: null };
      },
      fetchReviews: async () => ({ reviews: [] as WeeklyReview[], error: null }),
    };

    const result = await loadAdaptiveTargetState(CLIENT, LOCKED_RX, fetchers);
    expect(askedClientId).toBe(CLIENT.id);
    expect(result.decision.outcome).toBe('adherent_unexpected');
    expect(result.futureMetrics).not.toBeNull();

    // Identical evidence must produce an identical decision via the pure core.
    expect(result.decision).toEqual(
      resolveAdaptedTarget(CLIENT, LOCKED_RX, {
        dailyCheckins: fetchedCheckins,
        weeklyReviews: [],
      }).decision,
    );
  });

  it('propagates fetch failures instead of inventing evidence', async () => {
    const fetchers = {
      fetchCheckins: async () => ({ checkins: [], error: 'database unavailable' }),
      fetchReviews: async () => ({ reviews: [], error: null }),
    };
    await expect(loadAdaptiveTargetState(CLIENT, LOCKED_RX, fetchers)).rejects.toThrow(
      /database unavailable/,
    );
  });

  it('empty persisted history yields insufficient_data with the prescription unchanged', async () => {
    const fetchers = {
      fetchCheckins: async () => ({ checkins: [], error: null }),
      fetchReviews: async () => ({ reviews: [], error: null }),
    };
    const result = await loadAdaptiveTargetState(CLIENT, LOCKED_RX, fetchers);
    expect(result.decision.outcome).toBe('insufficient_data');
    expect(result.futureMetrics).toBeNull();
    expect(result.decision.futureTargetCalories).toBe(LOCKED_RX.targetCalories);
    expect(result.baseline).toEqual(LOCKED_RX);
  });
});



// Helper for client-specific evidence (used by the gainer fixtures).
function adherentEvidenceFor(client: Client, weeklyKgChange: number): AdaptationEvidence {
  return {
    dailyCheckins: trendCheckins(weeklyKgChange * 4, 28, 92, client.weight).map((c) => ({
      ...c,
      client_id: client.id,
    })),
    weeklyReviews: [],
  };
}



