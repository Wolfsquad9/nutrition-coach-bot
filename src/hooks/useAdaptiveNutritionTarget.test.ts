/**
 * useAdaptiveNutritionTarget — Phase 8 production-wiring tests.
 *
 * Proves the hook:
 *  - stays 'idle' without a client
 *  - uses the ACTIVE PRESCRIPTION as baseline when one exists, and the
 *    canonical INITIAL prescription otherwise (never a fabricated one)
 *  - exposes an adapted future target ONLY when adaptation is eligible
 *  - keeps prescribing at the active-prescription rate while not eligible
 *    (draft-rate continuity — no target drift)
 *  - surfaces fetch errors instead of fabricating evidence
 */

import { describe, it, expect } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAdaptiveNutritionTarget } from './useAdaptiveNutritionTarget';
import {
  resolveAdaptedTarget,
  type AdaptiveTargetFetchers,
} from '@/services/nutrition/adaptiveTargetService';
import { calculateNutritionMetrics, calculateProfile, buildNutritionProfileInput } from '@/domain/nutrition/engine';
import {
  deriveInitialPrescription,
  prescriptionFromLockedPlan,
  reconstructMetricsFromPrescription,
} from '@/domain/nutrition/prescription';
import type { Client } from '@/types';
import type { DailyCheckin } from '@/types/checkin';

const buildClient = (overrides: Partial<Client> = {}): Client =>
  ({
    id: 'c-hook',
    firstName: 'Ada',
    lastName: 'Lift',
    email: 'a@b.co',
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

const CLIENT = buildClient();
const CANONICAL_TARGET = calculateNutritionMetrics(CLIENT).targetCalories;
const LOCKED_RX = prescriptionFromLockedPlan({
  weeklyRateKg: -0.5,
  targetCalories: CANONICAL_TARGET,
  versionId: 'v-hook-1',
  versionNumber: 1,
  establishedAt: '2026-01-01T10:00:00.000Z',
});

function isoAddDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function slowLossCheckins(): DailyCheckin[] {
  // -0.2 kg/wk vs prescribed -0.5 with high adherence -> adherent_unexpected.
  return Array.from({ length: 28 }, (_, i) => ({
    id: `chk-${i}`,
    client_id: CLIENT.id,
    checkin_date: isoAddDays('2026-01-01', i),
    meal_adherence: 92,
    workout_completed: true,
    energy_level: null,
    mood: null,
    sleep_hours: null,
    water_intake_liters: null,
    current_weight_kg: CLIENT.weight - (i * 0.8) / 27,
    notes: null,
    created_by: 'coach',
    created_at: '',
    updated_at: '',
  })) as unknown as DailyCheckin[];
}

const eligibleFetchers: AdaptiveTargetFetchers = {
  fetchCheckins: async () => ({ checkins: slowLossCheckins(), error: null }),
  fetchReviews: async () => ({ reviews: [], error: null }),
};
const emptyFetchers: AdaptiveTargetFetchers = {
  fetchCheckins: async () => ({ checkins: [], error: null }),
  fetchReviews: async () => ({ reviews: [], error: null }),
};

describe('useAdaptiveNutritionTarget', () => {
  it('is idle without a client', () => {
    const { result } = renderHook(() =>
      useAdaptiveNutritionTarget(null, LOCKED_RX, eligibleFetchers),
    );
    expect(result.current.status).toBe('idle');
    expect(result.current.futureMetrics).toBeNull();
  });

  it('uses the ACTIVE PRESCRIPTION as baseline when one exists', async () => {
    const { result } = renderHook(() =>
      useAdaptiveNutritionTarget(CLIENT, LOCKED_RX, eligibleFetchers),
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.baseline).toEqual(LOCKED_RX);
    expect(result.current.decision?.outcome).toBe('adherent_unexpected');
    expect(result.current.futureMetrics).not.toBeNull();

    // The exposed future target is exactly what the pure service computes.
    const expected = resolveAdaptedTarget(CLIENT, LOCKED_RX, {
      dailyCheckins: slowLossCheckins(),
      weeklyReviews: [],
    });
    expect(result.current.futureMetrics).toEqual(expected.futureMetrics);
    expect(result.current.effectiveMetrics).toEqual(expected.futureMetrics);
    // Eligible -> generation must prescribe the ADJUSTED rate.
    expect(result.current.effectiveWeeklyRateKg).toBe(expected.decision.futureWeeklyRateKg);
  });

  it('falls back to the canonical INITIAL prescription without one', async () => {
    const { result } = renderHook(() =>
      useAdaptiveNutritionTarget(CLIENT, null, eligibleFetchers),
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.baseline).toEqual(deriveInitialPrescription(CLIENT));
    expect(result.current.baseline.source).toBe('initial_profile');
  });

  it('keeps prescribing at the active-prescription rate while not eligible', async () => {
    const { result } = renderHook(() =>
      useAdaptiveNutritionTarget(CLIENT, LOCKED_RX, emptyFetchers),
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.decision?.outcome).toBe('insufficient_data');
    expect(result.current.futureMetrics).toBeNull();
    // No drift: effective target/rate stay on the active prescription.
    expect(result.current.effectiveMetrics).toEqual(calculateNutritionMetrics(CLIENT));
    expect(result.current.effectiveWeeklyRateKg).toBe(LOCKED_RX.weeklyRateKg);
  });

  it('surfaces fetch errors instead of fabricating evidence (rate continuity kept)', async () => {
    const failing: AdaptiveTargetFetchers = {
      fetchCheckins: async () => ({ checkins: [], error: 'db down' }),
      fetchReviews: async () => ({ reviews: [], error: null }),
    };
    const { result } = renderHook(() =>
      useAdaptiveNutritionTarget(CLIENT, LOCKED_RX, failing),
    );
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toMatch(/db down/);
    expect(result.current.futureMetrics).toBeNull();
    // Fallback remains canonical profile metrics at the prescription rate.
    expect(result.current.effectiveMetrics).toEqual(calculateNutritionMetrics(CLIENT));
    expect(result.current.effectiveWeeklyRateKg).toBe(LOCKED_RX.weeklyRateKg);
  });
});

// ============================================================================
// P0 — effectiveMetrics AND effectiveWeeklyRateKg MUST describe the SAME basis
// ============================================================================

const RX_DIFF = prescriptionFromLockedPlan({
  weeklyRateKg: -0.7,
  targetCalories: calculateProfile({
    ...buildNutritionProfileInput(CLIENT),
    weeklyWeightChange: -0.7,
  }).targetCalories,
  versionId: 'v-diff-1',
  versionNumber: 2,
  establishedAt: '2026-01-01T10:00:00.000Z',
});

describe('P0 · effective metrics agree with the effective weekly rate (same prescription)', () => {
  it('a prescription whose rate differs from the profile is the basis, not the profile', async () => {
    const { result } = renderHook(() =>
      useAdaptiveNutritionTarget(CLIENT, RX_DIFF, emptyFetchers),
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.decision?.outcome).toBe('insufficient_data');
    // The exposed metrics are reconstructed from the ACTIVE prescription (-0.7),
    // NOT recomputed from the current profile request (-0.5).
    const expected = reconstructMetricsFromPrescription(CLIENT, RX_DIFF);
    expect(result.current.effectiveMetrics).toEqual(expected);
    expect(result.current.effectiveWeeklyRateKg).toBe(RX_DIFF.weeklyRateKg);
    // They plainly differ from the raw current-profile metrics.
    expect(result.current.effectiveMetrics).not.toEqual(calculateNutritionMetrics(CLIENT));
  });

  it('a current client profile change cannot silently override the active prescription', async () => {
    const changed = buildClient({ weight: 90, weeklyWeightChange: 0.5 });
    const { result } = renderHook(() =>
      useAdaptiveNutritionTarget(changed, RX_DIFF, emptyFetchers),
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    // Still prescribes the ACTIVE prescription's rate...
    expect(result.current.effectiveWeeklyRateKg).toBe(RX_DIFF.weeklyRateKg);
    // ...and its metrics are that prescription reconstructed through the engine.
    expect(result.current.effectiveMetrics!.targetCalories).toBeCloseTo(
      calculateProfile({
        ...buildNutritionProfileInput(changed),
        weeklyWeightChange: RX_DIFF.weeklyRateKg,
      }).targetCalories,
      4,
    );
  });

  it('repeated rendering exposes the same effective target/rate (deterministic)', async () => {
    const first = renderHook(() => useAdaptiveNutritionTarget(CLIENT, RX_DIFF, emptyFetchers));
    const second = renderHook(() => useAdaptiveNutritionTarget(CLIENT, RX_DIFF, emptyFetchers));
    await waitFor(() => expect(first.result.current.status).toBe('ready'));
    await waitFor(() => expect(second.result.current.status).toBe('ready'));
    expect(first.result.current.effectiveMetrics).toEqual(second.result.current.effectiveMetrics);
    expect(first.result.current.effectiveWeeklyRateKg).toBe(
      second.result.current.effectiveWeeklyRateKg,
    );
  });
});

