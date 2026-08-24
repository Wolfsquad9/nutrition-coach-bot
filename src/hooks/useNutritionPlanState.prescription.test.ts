/**
 * Phase 8 — ACTIVE PRESCRIPTION lifecycle tests for useNutritionPlanState.
 *
 * Proves:
 *  - hydration restores the active prescription from the locked payload
 *  - legacy payloads without a prescription record yield null (lazy init)
 *  - repeated DRAFT generation never changes the active prescription
 *  - an explicit LOCK persists the draft's prescription record and the
 *    post-lock reload establishes the NEW active prescription
 *  - historical snapshots are byte-identical through the whole cycle
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useNutritionPlanState } from './useNutritionPlanState';
import type { WeeklyMealPlanResult } from '@/services/recipeService';
import type { MacroTargets } from '@/types';
import type { PlanSnapshot } from '@/domain/nutrition/snapshot';

// ─── Mocks ───────────────────────────────────────────────────────────────────

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

vi.mock('@/services/supabasePlanService', () => ({
  buildLockedPlanPayload: (...args: Parameters<typeof mockBuildLockedPlanPayload>) =>
    mockBuildLockedPlanPayload(...args),
  hashPlanPayload: vi.fn(() => 'hash_rx'),
  lockNutritionPlan: (...args: Parameters<typeof mockLockNutritionPlan>) =>
    mockLockNutritionPlan(...args),
  checkPlanLockStatus: (...args: Parameters<typeof mockCheckPlanLockStatus>) =>
    mockCheckPlanLockStatus(...args),
  fetchCurrentPlan: (...args: Parameters<typeof mockFetchCurrentPlan>) =>
    mockFetchCurrentPlan(...args),
}));

vi.mock('@/services/snapshotPersistence', () => ({
  fetchPersistedSnapshot: vi.fn().mockResolvedValue({ snapshot: null, error: null }),
  buildAndPersistSnapshot: vi.fn(),
}));

vi.mock('@/domain/nutrition/runtimeTelemetry', () => ({
  emitRuntimeFailure: vi.fn(),
  emitRetryTelemetry: vi.fn(),
  emitHydrationResetTelemetry: vi.fn(),
}));

vi.mock('@/services/supabaseOverrideService', () => ({
  fetchPendingOverrides: vi.fn().mockResolvedValue({ overrides: [], error: null }),
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

const macros: MacroTargets = { calories: 2209, protein: 160, carbs: 284, fat: 48 };

function makeWeeklyPlan(): WeeklyMealPlanResult {
  const emptyMealData = {
    ingredients: [],
    recipeText: '',
    macros: { protein: 0, carbs: 0, fat: 0, calories: 0, fiber: 0 },
  };
  return {
    days: [
      {
        dayNumber: 1,
        dayName: 'Day 1',
        plan: {
          dailyPlan: { breakfast: emptyMealData, lunch: emptyMealData, dinner: emptyMealData, snack: emptyMealData },
          totalMacros: macros,
          targetMacros: macros,
          variance: { calories: 0, protein: 0, carbs: 0, fat: 0 },
        },
      },
    ],
    weeklyTotalMacros: macros,
    weeklyTargetMacros: { ...macros, calories: macros.calories * 7, protein: 1120, carbs: 1988, fat: 336 },
    weeklyVariance: { calories: 0, protein: 0, carbs: 0, fat: 0 },
  } as unknown as WeeklyMealPlanResult;
}

function makeSnapshot(versionId: string, targetCalories: number): PlanSnapshot {
  return {
    identifier: {
      versionId,
      lockedAt: new Date('2026-01-01T10:00:00Z'),
      lockedUntil: new Date('2026-01-08T10:00:00Z'),
      payloadHash: 'hash_rx',
    },
    client: { firstName: 'Jane', lastName: 'Doe', goal: 'fat_loss', activityLevel: 'moderately_active' },
    metrics: {
      tdee: 2759,
      bmr: 1780,
      targetCalories,
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
        totalMacros: { calories: targetCalories, protein: 160, carbs: 284, fat: 48, fiber: 30 },
        hydration: 3,
      },
    ],
    groceryList: [],
    meta: {
      planName: 'Rx Test Plan',
      versionNumber: 1,
      createdAt: '2026-01-01T10:00:00Z',
      lockedAt: '2026-01-01T10:00:00Z',
      lockedUntil: '2026-01-08T10:00:00Z',
      generatedBy: 'coach',
    },
  } as unknown as PlanSnapshot;
}

function payloadWithPrescription(opts: {
  versionId: string;
  weeklyRateKg: number;
  targetCalories: number;
}) {
  return {
    type: 'nutrition' as const,
    generatedAt: '2026-01-01T10:00:00Z',
    lockedAt: '2026-01-01T10:00:00Z',
    macroTargets: { ...macros, calories: opts.targetCalories },
    weeklyPlan: makeWeeklyPlan(),
    likedIngredients: ['chicken'],
    nutritionPrescription: {
      weeklyRateKg: opts.weeklyRateKg,
      establishedAt: '2026-01-01T10:00:00.000Z',
      sourceVersionId: opts.versionId,
    },
  };
}

function planResult(payload: object | null, versionId: string | null, snapshot: PlanSnapshot | null, versionNumber = 1) {
  return {
    plan: payload,
    planId: payload ? 'plan-1' : null,
    versionId,
    createdAt: payload ? '2026-01-01T10:00:00Z' : null,
    snapshot,
    payloadHash: 'hash_rx',
    versionNumber: payload ? versionNumber : null,
    error: null,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('active prescription lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckPlanLockStatus.mockResolvedValue({ isLocked: false, lockedUntil: null, daysRemaining: 0 });
  });

  it('hydrates the active prescription from the locked payload (reload fidelity)', async () => {
    const snapshot = makeSnapshot('v1', macros.calories);
    mockFetchCurrentPlan.mockResolvedValue(
      planResult(
        payloadWithPrescription({ versionId: 'v1', weeklyRateKg: -0.5, targetCalories: macros.calories }),
        'v1',
        snapshot,
      ),
    );

    const { result } = renderHook(() => useNutritionPlanState());
    await act(async () => {
      await result.current.loadPlanForClient('client-1');
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.activePrescription).toEqual({
      targetCalories: macros.calories,
      weeklyRateKg: -0.5,
      source: 'locked_plan',
      versionId: 'v1',
      versionNumber: 1,
      establishedAt: '2026-01-01T10:00:00.000Z',
    });
  });

  it('yields null for legacy payloads without a prescription record (lazy canonical init)', async () => {
    const legacyPayload = {
      type: 'nutrition' as const,
      generatedAt: '2026-01-01T10:00:00Z',
      lockedAt: '2026-01-01T10:00:00Z',
      macroTargets: macros,
      weeklyPlan: makeWeeklyPlan(),
      likedIngredients: [],
    };
    mockFetchCurrentPlan.mockResolvedValue(
      planResult(legacyPayload, 'v-old', makeSnapshot('v-old', macros.calories)),
    );

    const { result } = renderHook(() => useNutritionPlanState());
    await act(async () => {
      await result.current.loadPlanForClient('client-1');
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // No invented history: the consumer derives the initial prescription
    // deterministically from the canonical engine when this is null.
    expect(result.current.activePrescription).toBeNull();
  });

  it('repeated draft generation NEVER changes the active prescription', async () => {
    const v1Snapshot = makeSnapshot('v1', macros.calories);
    mockFetchCurrentPlan.mockResolvedValue(
      planResult(
        payloadWithPrescription({ versionId: 'v1', weeklyRateKg: -0.5, targetCalories: macros.calories }),
        'v1',
        v1Snapshot,
      ),
    );
    mockBuildLockedPlanPayload.mockImplementation((input) => ({ ...input }));

    const { result } = renderHook(() => useNutritionPlanState());
    await act(async () => {
      await result.current.loadPlanForClient('client-1');
    });
    const baselineJson = JSON.stringify(result.current.activePrescription);
    expect(baselineJson).toContain('"source":"locked_plan"');

    // Draft A, B, C — none of them may touch the prescription basis.
    for (const rate of [-0.6363636363636364, -0.7, -0.5]) {
      act(() => {
        result.current.setDraftPlan(makeWeeklyPlan(), macros, ['chicken'], undefined, {
          weeklyRateKg: rate,
        });
      });
      expect(JSON.stringify(result.current.activePrescription)).toBe(baselineJson);
    }

    // Historical snapshot untouched by any draft generation.
    expect(JSON.stringify(v1Snapshot)).toBe(JSON.stringify(makeSnapshot('v1', macros.calories)));
  });
});

describe('lock establishes a new active prescription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckPlanLockStatus.mockResolvedValue({ isLocked: false, lockedUntil: null, daysRemaining: 0 });
    mockBuildLockedPlanPayload.mockImplementation((input) => ({ ...input }));
  });

  it('locking persists the draft prescription record and establishes the new prescription', async () => {
    const v1Snapshot = makeSnapshot('v1', macros.calories);
    const v1Before = JSON.stringify(v1Snapshot);
    mockFetchCurrentPlan
      .mockResolvedValueOnce(
        planResult(
          payloadWithPrescription({ versionId: 'v1', weeklyRateKg: -0.5, targetCalories: macros.calories }),
          'v1',
          v1Snapshot,
        ),
      )
      .mockResolvedValueOnce(
        planResult(
          payloadWithPrescription({ versionId: 'v2', weeklyRateKg: -0.6363636363636364, targetCalories: 2059 }),
          'v2',
          makeSnapshot('v2', 2059),
          2,
        ),
      );
    mockLockNutritionPlan.mockResolvedValue({
      success: true,
      planId: 'plan-1',
      versionId: 'v2',
      versionNumber: 2,
      error: null,
    });

    const { result } = renderHook(() => useNutritionPlanState());
    await act(async () => {
      await result.current.loadPlanForClient('client-1');
    });

    // Coach generates an ADAPTED draft and locks it.
    act(() => {
      result.current.setDraftPlan(
        makeWeeklyPlan(),
        { ...macros, calories: 2059 },
        ['chicken'],
        undefined,
        { weeklyRateKg: -0.6363636363636364 },
      );
    });

    let lockResult!: { success: boolean };
    await act(async () => {
      lockResult = await result.current.lockPlan('client-1', {
        firstName: 'Jane',
        lastName: 'Doe',
        goal: 'fat_loss',
        activityLevel: 'moderately_active',
      });
    });
    expect(lockResult.success).toBe(true);

    // The lock payload carried THIS draft's prescription record.
    expect(mockBuildLockedPlanPayload).toHaveBeenCalledTimes(1);
    const payloadInput = mockBuildLockedPlanPayload.mock.calls[0][0];
    expect(payloadInput.nutritionPrescription).toEqual({
      weeklyRateKg: -0.6363636363636364,
      establishedAt: expect.any(String),
      sourceVersionId: expect.any(String),
    });

    // Post-lock reload established the NEW active prescription.
    await waitFor(() => expect(result.current.activePrescription?.versionId).toBe('v2'));
    expect(result.current.activePrescription).toMatchObject({
      targetCalories: 2059,
      weeklyRateKg: -0.6363636363636364,
      source: 'locked_plan',
      versionNumber: 2,
    });

    // The historical v1 snapshot is byte-for-byte unchanged through everything.
    expect(JSON.stringify(v1Snapshot)).toBe(v1Before);
  });

  it('a failed lock does NOT change the active prescription', async () => {
    mockFetchCurrentPlan.mockResolvedValue(
      planResult(
        payloadWithPrescription({ versionId: 'v1', weeklyRateKg: -0.5, targetCalories: macros.calories }),
        'v1',
        makeSnapshot('v1', macros.calories),
      ),
    );
    mockLockNutritionPlan.mockResolvedValue({
      success: false,
      planId: null,
      versionId: null,
      versionNumber: null,
      error: 'RPC failure',
    });

    const { result } = renderHook(() => useNutritionPlanState());
    await act(async () => {
      await result.current.loadPlanForClient('client-1');
    });
    const before = JSON.stringify(result.current.activePrescription);

    act(() => {
      result.current.setDraftPlan(makeWeeklyPlan(), macros, [], undefined, { weeklyRateKg: -0.8 });
    });
    await act(async () => {
      await result.current.lockPlan('client-1', {
        firstName: 'J',
        lastName: 'D',
        goal: 'fat_loss',
        activityLevel: 'moderate',
      });
    });

    expect(JSON.stringify(result.current.activePrescription)).toBe(before);
  });
});


