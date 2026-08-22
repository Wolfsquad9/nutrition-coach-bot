/**
 * Phase 10 — production lifecycle hardening (regression coverage).
 *
 * Scope: exercises the real `useNutritionPlanState` load/lock path against the
 * existing in-memory mock harness. These tests cover the two lifecycle
 * behaviours that were NOT already asserted by the Phase 8 prescription,
 * Phase 9 lifecycle, and adaptation test suites:
 *
 *  1. Client-switch discards a stale in-flight load (Task 2 / Task 3).
 *  2. Failed reload leaves the previously locked plan + active prescription
 *     intact (Task 6F — reload-failure non-destructiveness).
 *
 * These are integration tests over the real hook; they deliberately do NOT
 * touch the UI aesthetic or re-test anything already covered by
 * `useAdaptiveNutritionTarget.test.ts` (adaptive resolution) or
 * `useNutritionPlanState.prescription.test.ts` (lock→reload versioning).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useNutritionPlanState } from './useNutritionPlanState';
import type { WeeklyMealPlanResult } from '@/services/recipeService';
import type { MacroTargets } from '@/types';
import type { PlanSnapshot } from '@/domain/nutrition/snapshot';

// ─── Mocks (mirror useNutritionPlanState.test.ts) ─────────────────────────────

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
    }),
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u1' } }, error: null }) },
  },
}));

const mockBuildLockedPlanPayload = vi.fn();
const mockLockNutritionPlan = vi.fn();
const mockFetchCurrentPlan = vi.fn();
const mockCheckPlanLockStatus = vi.fn();
const mockFetchPersistedSnapshot = vi.fn();
const mockEmitRuntimeFailure = vi.fn();
const mockEmitRetryTelemetry = vi.fn();
const mockEmitHydrationResetTelemetry = vi.fn();

vi.mock('@/services/supabasePlanService', () => ({
  buildLockedPlanPayload: (...args: Parameters<typeof mockBuildLockedPlanPayload>) =>
    mockBuildLockedPlanPayload(...args),
  hashPlanPayload: vi.fn(() => 'hash_test'),
  lockNutritionPlan: (...args: Parameters<typeof mockLockNutritionPlan>) =>
    mockLockNutritionPlan(...args),
  checkPlanLockStatus: (...args: Parameters<typeof mockCheckPlanLockStatus>) =>
    mockCheckPlanLockStatus(...args),
  fetchCurrentPlan: (...args: Parameters<typeof mockFetchCurrentPlan>) =>
    mockFetchCurrentPlan(...args),
}));

vi.mock('@/services/snapshotPersistence', () => ({
  fetchPersistedSnapshot: (...args: unknown[]) => mockFetchPersistedSnapshot(...args),
  buildAndPersistSnapshot: vi.fn(),
}));

vi.mock('@/domain/nutrition/runtimeTelemetry', () => ({
  emitRuntimeFailure: (...args: unknown[]) => mockEmitRuntimeFailure(...args),
  emitRetryTelemetry: (...args: unknown[]) => mockEmitRetryTelemetry(...args),
  emitHydrationResetTelemetry: (...args: unknown[]) => mockEmitHydrationResetTelemetry(...args),
}));

vi.mock('@/services/supabaseOverrideService', () => ({
  fetchPendingOverrides: vi.fn().mockResolvedValue({ overrides: [], error: null }),
}));

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const macroTargets = (calories: number): MacroTargets =>
  ({ calories, protein: 160, carbs: 200, fat: 60 } as MacroTargets);

const emptyMealData = {
  ingredients: [],
  recipeText: '',
  macros: { protein: 0, carbs: 0, fat: 0, calories: 0, fiber: 0 },
};

const weekPlan = (calories: number): WeeklyMealPlanResult =>
  ({
    days: [
      {
        dayNumber: 1,
        dayName: 'Day 1',
        plan: {
          dailyPlan: {
            breakfast: emptyMealData,
            lunch: emptyMealData,
            dinner: emptyMealData,
            snack: emptyMealData,
          },
          totalMacros: macroTargets(calories),
          targetMacros: macroTargets(calories),
          variance: { calories: 0, protein: 0, carbs: 0, fat: 0 },
        },
      },
    ],
    weeklyTotalMacros: macroTargets(calories),
    weeklyTargetMacros: macroTargets(calories),
    weeklyVariance: { calories: 0, protein: 0, carbs: 0, fat: 0 },
  } as unknown as WeeklyMealPlanResult);

function snapshotForClient(versionId: string, targetCalories: number): PlanSnapshot {
  return {
    identifier: {
      versionId,
      lockedAt: new Date('2026-01-01T10:00:00Z'),
      lockedUntil: new Date('2026-01-08T10:00:00Z'),
      payloadHash: 'hash_test',
    },
    client: { firstName: 'Jane', lastName: 'Doe', goal: 'fat_loss', activityLevel: 'moderate' },
    metrics: {
      tdee: 2300,
      bmr: 1800,
      targetCalories,
      proteinGrams: 160,
      carbsGrams: 200,
      fatGrams: 60,
      fiberGrams: 25,
      waterLiters: 2,
    },
    weeklyPlan: [
      {
        day: 1,
        meals: [],
        totalMacros: { calories: targetCalories, protein: 160, carbs: 200, fat: 60 },
        hydration: 2,
      },
    ],
    groceryList: [],
    meta: {
      planName: 'Phase10 Plan',
      versionNumber: 1,
      createdAt: '2026-01-01T10:00:00Z',
      lockedAt: '2026-01-01T10:00:00Z',
      lockedUntil: '2026-01-08T00:00:00Z',
      generatedBy: 'coach',
    },
  } as unknown as PlanSnapshot;
}

function planResultForClient(
  clientId: string,
  weeklyRateKg: number,
  targetCalories: number,
  versionId: string,
  versionNumber: number = 1,
) {
  return {
    plan: {
      type: 'nutrition' as const,
      generatedAt: '2026-01-01T10:00:00Z',
      lockedAt: '2026-01-01T10:00:00Z',
      macroTargets: macroTargets(targetCalories),
      weeklyPlan: weekPlan(targetCalories),
      likedIngredients: ['chicken'],
      nutritionPrescription: {
        weeklyRateKg,
        establishedAt: '2026-01-01T10:00:00.000Z',
        sourceVersionId: versionId,
      },
    },
    planId: `plan-${clientId}`,
    versionId,
    createdAt: '2026-01-01T10:00:00Z',
    snapshot: snapshotForClient(versionId, targetCalories),
        payloadHash: 'hash_test',
    versionNumber,
    error: null,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('Phase 10 lifecycle hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckPlanLockStatus.mockResolvedValue({
      isLocked: false,
      lockedUntil: null,
      daysRemaining: 0,
    });
    mockFetchPersistedSnapshot.mockResolvedValue({ snapshot: null, error: null });
    mockLockNutritionPlan.mockResolvedValue({
      success: true,
      planId: 'plan-1',
      versionId: 'v1',
      versionNumber: 1,
      error: null,
    });
  });

  it('discards a stale in-flight load for the previous client (no stale target)', async () => {
    // Client A resolves late; client B resolves immediately while A is pending.
    const aResult = planResultForClient('A', -0.5, 2100, 'vA', 1);
    const bResult = planResultForClient('B', -0.7, 1800, 'vB', 1);

    let resolveA: (val: unknown) => void = () => {};
    const aDeferred = new Promise((r) => (resolveA = r));

    mockFetchCurrentPlan
      .mockImplementationOnce(() => aDeferred) // A — slow, controlled
      .mockImplementationOnce(() => Promise.resolve(bResult)); // B — fast

    const { result } = renderHook(() => useNutritionPlanState());

    // Kick off A (slow), then immediately B (fast) while A is still in flight.
    const loadA = result.current.loadPlanForClient('A');
    await act(async () => {
      await result.current.loadPlanForClient('B');
    });

    // B wins the race.
    expect(result.current.versionId).toBe('vB');
    expect(result.current.activePrescription?.weeklyRateKg).toBe(-0.7);
    expect(result.current.activePrescription?.targetCalories).toBe(1800);
    expect(result.current.activePrescription?.source).toBe('locked_plan');
    expect(result.current.snapshot?.identifier.versionId).toBe('vB');
    expect(result.current.error).toBeNull();

    // Now let the stale A load resolve — it must NOT overwrite B's locked state.
    await act(async () => {
      resolveA(aResult);
      await loadA;
    });

    expect(result.current.versionId).toBe('vB');
    expect(result.current.activePrescription?.weeklyRateKg).toBe(-0.7);
    expect(result.current.activePrescription?.targetCalories).toBe(1800);
    expect(result.current.snapshot?.identifier.versionId).toBe('vB');
    expect(result.current.snapshot?.metrics.targetCalories).toBe(1800);
    expect(result.current.error).toBeNull();
  });

  it('a failed reload leaves the previously locked plan and prescription intact (Task 6F)', async () => {
    const v1 = planResultForClient('client-1', -0.5, 2100, 'v1', 1);
    mockFetchCurrentPlan
      .mockResolvedValueOnce(v1) // initial load succeeds
      .mockRejectedValueOnce(new Error('Reload down')); // subsequent reload fails

    const { result } = renderHook(() => useNutritionPlanState());
    await act(async () => {
      await result.current.loadPlanForClient('client-1');
    });
    await act(async () => {
      await waitFor(() => expect(result.current.isLoading).toBe(false));
    });

    expect(result.current.versionId).toBe('v1');
    expect(result.current.activePrescription?.weeklyRateKg).toBe(-0.5);
    expect(result.current.snapshot?.identifier.versionId).toBe('v1');
    const planJson = JSON.stringify(result.current.weeklyPlan);
    const snapshotJson = JSON.stringify(result.current.snapshot);
    const prescriptionJson = JSON.stringify(result.current.activePrescription);

    // Trigger a reload that fails at the persistence layer.
    await act(async () => {
      await result.current.loadPlanForClient('client-1');
    });
    await waitFor(() => expect(result.current.isError).toBe(true));

    // The previous locked plan is authoritative and must be preserved.
    expect(result.current.versionId).toBe('v1');
    expect(result.current.activePrescription?.weeklyRateKg).toBe(-0.5);
    expect(result.current.activePrescription?.source).toBe('locked_plan');
    expect(result.current.snapshot?.identifier.versionId).toBe('v1');
    expect(JSON.stringify(result.current.weeklyPlan)).toBe(planJson);
    expect(JSON.stringify(result.current.snapshot)).toBe(snapshotJson);
    expect(JSON.stringify(result.current.activePrescription)).toBe(prescriptionJson);

    // The failure is surfaced (not swallowed into a fabricated target)...
    expect(result.current.error).toMatch(/reload down|Failed to load plan/i);
    // ...and is retryable, so it does not silently brick future loads.
    expect(result.current.isRetryable).toBe(true);
  });
});


