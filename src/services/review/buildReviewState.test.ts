/**
 * Client Review builder — unit tests (Phase 13B).
 *
 * Locks down that `buildReviewState` wires the existing adaptive layer + the
 * Phase 13A review model correctly, is deterministic and immutable, and never
 * invents a proposal the adaptation engine did not produce.
 */

import { describe, it, expect } from 'vitest';
import {
  buildReviewState,
  meanAdherenceScore,
  summarizeEvidence,
} from './buildReviewState';
import {
  deriveInitialPrescription,
  prescriptionFromLockedPlan,
  type ActiveNutritionPrescription,
} from '@/domain/nutrition/prescription';
import { calculateNutritionMetrics } from '@/domain/nutrition/engine';
import { deepFreeze } from '@/domain/nutrition/snapshot';
import type { Client } from '@/types';
import type { DailyCheckin } from '@/types/checkin';
import type { AdaptationEvidence } from '@/services/nutrition/adaptiveTargetService';

// ============================================================================
// FIXTURES
// ============================================================================

const buildClient = (overrides: Partial<Client> = {}): Client =>
  ({
    id: 'client-13b',
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
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-29T00:00:00.000Z',
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
    current_weight_kg: CLIENT.weight + perDay * i,
    notes: null,
    created_by: 'coach',
    created_at: '',
    updated_at: '',
  })) as unknown as DailyCheckin[];
}

const adherent = (weeklyKgChange: number, days = 28): AdaptationEvidence => ({
  dailyCheckins: trendCheckins((weeklyKgChange * days) / 7, days, 92),
  weeklyReviews: [],
});

const poor = (weeklyKgChange: number): AdaptationEvidence => ({
  dailyCheckins: trendCheckins(weeklyKgChange * 4, 28, 40),
  weeklyReviews: [],
});

/** A locked prescription baseline (explicit active prescription). */
const INITIAL_RX = deriveInitialPrescription(CLIENT);
const LOCKED_RX: ActiveNutritionPrescription = prescriptionFromLockedPlan({
  weeklyRateKg: INITIAL_RX.weeklyRateKg,
  targetCalories: INITIAL_RX.targetCalories,
  versionId: 'v1',
  versionNumber: 1,
  establishedAt: '2026-01-01T00:00:00.000Z',
});
// ============================================================================
// TESTS
// ============================================================================

describe('buildReviewState — evidence wiring', () => {
  it('maps sufficient adherence on-trend to a maintain review', () => {
    const result = buildReviewState({
      client: CLIENT,
      activePrescription: null,
      evidence: adherent(-0.5),
    });

    expect(result.review.status).toBe('maintain');
    expect(result.review.summary).toBe('Maintain current prescription.');
    expect(result.review.proposedTargetCalories).toBeNull();
    // Baseline for a client with no explicit prescription is the initial one.
    expect(result.baseline.source).toBe('initial_profile');
    // Current prescription macros reconstruct through the canonical engine.
    expect(result.currentMetrics.targetCalories).toBe(result.baseline.targetCalories);
  });

  it('produces an adjustment review from the existing decision with the proposed target preserved', () => {
    const result = buildReviewState({
      client: CLIENT,
      activePrescription: LOCKED_RX,
      evidence: adherent(-0.2), // losing slower than target while adherent
    });

    expect(result.review.status).toBe('adjustment_recommended');
    // The proposed target comes verbatim from the decision — never recomputed.
    expect(result.review.proposedTargetCalories).not.toBeNull();
    expect(result.review.proposedTargetCalories).toBe(
      result.review.adaptationDecision.futureTargetCalories,
    );
  });

  it('maps poor adherence + unexpected trend to review_required with no invented target', () => {
    const result = buildReviewState({
      client: CLIENT,
      activePrescription: null,
      evidence: poor(-0.2),
    });

    expect(result.review.status).toBe('review_required');
    expect(result.review.proposedTargetCalories).toBeNull();
    expect(result.review.adaptationDecision.calorieAdjustmentKcal).toBe(0);
  });

  it('maps insufficient evidence to insufficient_data with no proposed target', () => {
    const result = buildReviewState({
      client: CLIENT,
      activePrescription: null,
      evidence: { dailyCheckins: [], weeklyReviews: [] },
    });

    expect(result.review.status).toBe('insufficient_data');
    expect(result.review.proposedTargetCalories).toBeNull();
    expect(result.review.adaptationDecision.sufficientData).toBe(false);
  });

  it('forwards the current target and rate from the baseline prescription', () => {
    const result = buildReviewState({
      client: CLIENT,
      activePrescription: null,
      evidence: adherent(-0.5),
    });

    expect(result.review.clientId).toBe(CLIENT.id);
    expect(result.review.currentTargetCalories).toBe(result.baseline.targetCalories);
    expect(result.review.targetWeeklyRateKg).toBe(result.baseline.weeklyRateKg);
  });
});
describe('buildReviewState — determinism & immutability', () => {
  it('returns deeply-equivalent output for identical input', () => {
    const input = { client: CLIENT, activePrescription: LOCKED_RX, evidence: adherent(-0.2) };
    expect(buildReviewState(input)).toEqual(buildReviewState(input));
  });

  it('is read-only and does not mutate client, prescription or evidence', () => {
    const input = deepFreeze({
      client: CLIENT,
      activePrescription: null,
      evidence: adherent(-0.5),
    });

    // Deep-frozen input => any mutation would throw in strict mode.
    const result = buildReviewState(input);

    expect(result.review.status).toBe('maintain');
    expect(input.client.id).toBe(CLIENT.id);
    expect(input.evidence.dailyCheckins.length).toBe(28);
  });
});

describe('buildReviewState — helpers', () => {
  it('computes display-only adherence from the same engine evidence', () => {
    expect(meanAdherenceScore({ dailyCheckins: trendCheckins(0, 5, 92), weeklyReviews: [] })).toBe(92);
    expect(meanAdherenceScore({ dailyCheckins: [], weeklyReviews: [] })).toBeNull();
  });

  it('summarizes the evidence actually seen', () => {
    const summary = summarizeEvidence(adherent(-0.5));
    expect(summary.checkinCount).toBe(28);
    expect(summary.weightObservationCount).toBe(28);
    expect(summary.weeklyReviewCount).toBe(0);
    expect(summary.latestCheckinDate).not.toBeNull();
  });
});

describe('buildReviewState — calories are never independently derived', () => {
  it('never adds/subtracts calories of its own on top of the decision', () => {
    const result = buildReviewState({
      client: CLIENT,
      activePrescription: null,
      evidence: adherent(-0.5),
    });

    // On a maintain the review proposes nothing even though a target exists.
    expect(result.review.proposedTargetCalories).toBeNull();
    // Current metrics equal the canonical engine reconstruction, unchanged.
    expect(result.currentMetrics.targetCalories).toBe(
      calculateNutritionMetrics(CLIENT).targetCalories,
    );
  });
});