/**
 * Integration tests for useNutritionPlanState — snapshot atomicity with lock
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
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

const mockLockNutritionPlan = vi.fn();
const mockFetchCurrentPlan = vi.fn();
const mockCheckPlanLockStatus = vi.fn();
const mockFetchPersistedSnapshot = vi.fn();

vi.mock('@/services/supabasePlanService', () => ({
  buildLockedPlanPayload: vi.fn((input) => ({
    type: 'nutrition',
    generatedAt: input.lockedAt.toISOString(),
    lockedAt: input.lockedAt.toISOString(),
    macroTargets: input.macroTargets,
    weeklyPlan: input.weeklyPlan,
    likedIngredients: input.likedIngredients,
  })),
  hashPlanPayload: vi.fn(() => 'hash_test'),
  lockNutritionPlan: (...args: Parameters<typeof mockLockNutritionPlan>) => mockLockNutritionPlan(...args),
  checkPlanLockStatus: (...args: Parameters<typeof mockCheckPlanLockStatus>) => mockCheckPlanLockStatus(...args),
  fetchCurrentPlan: (...args: Parameters<typeof mockFetchCurrentPlan>) => mockFetchCurrentPlan(...args),
}));

vi.mock('@/services/snapshotPersistence', () => ({
  fetchPersistedSnapshot: (...args: Parameters<typeof mockFetchPersistedSnapshot>) => mockFetchPersistedSnapshot(...args),
  buildAndPersistSnapshot: vi.fn(),
}));

vi.mock('@/services/supabaseOverrideService', () => ({
  fetchPendingOverrides: vi.fn().mockResolvedValue({ overrides: [], error: null }),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fakeMacros: MacroTargets = { calories: 2000, protein: 150, carbs: 200, fat: 70 };

const fakeMealData = {
  ingredients: [
    {
      id: 'chicken',
      name: 'Chicken',
      category: 'protein' as const,
      macros: { protein: 30, carbs: 0, fat: 4, calories: 160, fiber: 0 },
      allowedMeals: ['lunch' as const],
      typical_serving_size_g: 150,
      tags: [],
    },
  ],
  recipeText: 'Grilled Chicken',
  macros: { protein: 30, carbs: 0, fat: 4, calories: 160, fiber: 0 },
};

const emptyMealData = {
  ingredients: [],
  recipeText: '',
  macros: { protein: 0, carbs: 0, fat: 0, calories: 0, fiber: 0 },
};

const fakeWeeklyPlan: WeeklyMealPlanResult = {
  days: [
    {
      dayNumber: 1,
      dayName: 'Day 1',
      plan: {
        dailyPlan: {
          breakfast: emptyMealData,
          lunch: fakeMealData,
          dinner: emptyMealData,
          snack: emptyMealData,
        },
        totalMacros: { calories: 160, protein: 30, carbs: 0, fat: 4, fiber: 0 },
        targetMacros: { calories: 2000, protein: 150, carbs: 200, fat: 70 },
        variance: { calories: 0, protein: 0, carbs: 0, fat: 0 },
      },
    },
  ],
  weeklyTotalMacros: { calories: 160, protein: 30, carbs: 0, fat: 4, fiber: 0 },
  weeklyTargetMacros: { calories: 2000, protein: 150, carbs: 200, fat: 70 },
  weeklyVariance: { calories: 0, protein: 0, carbs: 0, fat: 0 },
};

const fakeClientInfo = {
  firstName: 'Jean',
  lastName: 'Dupont',
  goal: 'Weight loss',
  activityLevel: 'Moderate',
};

const lockedAtIso = '2026-05-01T00:00:00.000Z';

const fakeLockedPlanPayload = {
  type: 'nutrition' as const,
  generatedAt: lockedAtIso,
  lockedAt: lockedAtIso,
  macroTargets: fakeMacros,
  weeklyPlan: fakeWeeklyPlan,
  likedIngredients: ['poulet'],
};

const fakeSnapshot: PlanSnapshot = {
  identifier: {
    versionId: 'v1',
    lockedAt: new Date(lockedAtIso),
    lockedUntil: new Date('2026-05-08T00:00:00.000Z'),
    payloadHash: 'hash_test',
  },
  client: fakeClientInfo,
  metrics: {
    tdee: 0,
    bmr: 0,
    targetCalories: 2000,
    proteinGrams: 150,
    carbsGrams: 200,
    fatGrams: 70,
    fiberGrams: 0,
    waterLiters: 0,
  },
  weeklyPlan: [
    {
      day: 1,
      meals: [],
      totalMacros: { calories: 160, protein: 30, carbs: 0, fat: 4, fiber: 0 },
      hydration: 0,
    },
  ],
  groceryList: [],
  meta: {
    planName: 'Plan – Jean Dupont',
    versionNumber: 1,
    createdAt: lockedAtIso,
    lockedAt: lockedAtIso,
    lockedUntil: '2026-05-08T00:00:00.000Z',
    generatedBy: 'coach',
  },
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('lockPlan snapshot atomicity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckPlanLockStatus.mockResolvedValue({ isLocked: false, lockedUntil: null, daysRemaining: 0 });
    mockFetchCurrentPlan.mockResolvedValue({ plan: null, planId: null, versionId: null, createdAt: null, snapshot: null, error: null });
    mockFetchPersistedSnapshot.mockResolvedValue({ snapshot: null, error: null });
  });

  it('returns failure when atomic lock RPC fails', async () => {
    mockLockNutritionPlan.mockResolvedValue({ success: false, planId: null, versionId: null, versionNumber: null, error: 'DB write failed' });

    const { result } = renderHook(() => useNutritionPlanState());

    act(() => {
      result.current.setDraftPlan(fakeWeeklyPlan, fakeMacros, ['poulet']);
    });

    expect(result.current.isDraft).toBe(true);

    let lockResult: { success: boolean; error: string | null } = { success: true, error: null };
    await act(async () => {
      lockResult = await result.current.lockPlan('client-1', fakeClientInfo);
    });

    expect(lockResult.success).toBe(false);
    expect(lockResult.error).toContain('DB write failed');
    expect(result.current.isError).toBe(true);
    expect(result.current.lastPersistenceFailed).toBe(true);
    expect(result.current.isLocked).toBe(false);
  });

  it('returns success when atomic lock RPC succeeds', async () => {
    mockLockNutritionPlan.mockResolvedValue({ success: true, planId: 'p1', versionId: 'v1', versionNumber: 1, error: null });

    const { result } = renderHook(() => useNutritionPlanState());

    act(() => {
      result.current.setDraftPlan(fakeWeeklyPlan, fakeMacros, ['poulet']);
    });

    let lockResult: { success: boolean; error: string | null } = { success: false, error: 'init' };
    await act(async () => {
      lockResult = await result.current.lockPlan('client-1', fakeClientInfo);
    });

    expect(lockResult.success).toBe(true);
    expect(lockResult.error).toBeNull();
    expect(result.current.lastPersistenceFailed).toBe(false);
  });

  it('returns failure when atomic lock RPC throws', async () => {
    mockLockNutritionPlan.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useNutritionPlanState());

    act(() => {
      result.current.setDraftPlan(fakeWeeklyPlan, fakeMacros, ['poulet']);
    });

    let lockResult: { success: boolean; error: string | null } = { success: true, error: null };
    await act(async () => {
      lockResult = await result.current.lockPlan('client-1', fakeClientInfo);
    });

    expect(lockResult.success).toBe(false);
    expect(lockResult.error).toContain('Network error');
    expect(result.current.isError).toBe(true);
    expect(result.current.isLocked).toBe(false);
  });

  it('deduplicates concurrent lock attempts while a lock is in flight', async () => {
    let resolveLock: (value: { success: boolean; planId: string; versionId: string; versionNumber: number; error: null }) => void;
    const lockPromise = new Promise<{ success: boolean; planId: string; versionId: string; versionNumber: number; error: null }>((resolve) => {
      resolveLock = resolve;
    });

    mockLockNutritionPlan.mockReturnValue(lockPromise);

    const { result } = renderHook(() => useNutritionPlanState());

    act(() => {
      result.current.setDraftPlan(fakeWeeklyPlan, fakeMacros, ['poulet']);
    });

    let firstLock: Promise<{ success: boolean; error: string | null }>;
    let secondLock: Promise<{ success: boolean; error: string | null }>;

    await act(async () => {
      firstLock = result.current.lockPlan('client-1', fakeClientInfo);
      secondLock = result.current.lockPlan('client-1', fakeClientInfo);
    });

    expect(mockLockNutritionPlan).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveLock!({ success: true, planId: 'p1', versionId: 'v1', versionNumber: 1, error: null });
      await Promise.all([firstLock!, secondLock!]);
    });
  });

  it('retries failed atomic lock with the same idempotency key', async () => {
    mockLockNutritionPlan
      .mockResolvedValueOnce({ success: false, planId: null, versionId: null, versionNumber: null, error: 'Transient write failed' })
      .mockResolvedValueOnce({ success: true, planId: 'p1', versionId: 'v1', versionNumber: 1, error: null });

    const { result } = renderHook(() => useNutritionPlanState());

    act(() => {
      result.current.setDraftPlan(fakeWeeklyPlan, fakeMacros, ['poulet']);
    });

    await act(async () => {
      await result.current.lockPlan('client-1', fakeClientInfo);
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.isRetryable).toBe(true);

    let retryResult: { success: boolean; error: string | null } = { success: false, error: 'init' };
    await act(async () => {
      retryResult = await result.current.retryLastAction();
    });

    expect(retryResult.success).toBe(true);
    expect(retryResult.error).toBeNull();
    expect(mockLockNutritionPlan).toHaveBeenCalledTimes(2);
    expect(mockLockNutritionPlan.mock.calls[1][3]).toEqual(mockLockNutritionPlan.mock.calls[0][3]);
  });


  it('hard-fails when a locked plan resolves without a snapshot', async () => {
    mockFetchCurrentPlan.mockResolvedValue({
      plan: fakeLockedPlanPayload,
      planId: 'p1',
      versionId: 'v1',
      createdAt: lockedAtIso,
      snapshot: null,
      payloadHash: 'hash_test',
      versionNumber: 1,
      error: null,
    });
    mockFetchPersistedSnapshot.mockResolvedValue({ snapshot: null, error: null });

    const { result } = renderHook(() => useNutritionPlanState());

    await act(async () => {
      await result.current.loadPlanForClient('client-1');
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.error).toBe('Locked plan is missing immutable snapshot.');
    expect(result.current.isRetryable).toBe(true);
  });

  it('does not commit locked plan state on missing snapshot invariant failure', async () => {
    mockFetchCurrentPlan.mockResolvedValue({
      plan: fakeLockedPlanPayload,
      planId: 'p1',
      versionId: 'v1',
      createdAt: lockedAtIso,
      snapshot: null,
      payloadHash: 'hash_test',
      versionNumber: 1,
      error: null,
    });
    mockFetchPersistedSnapshot.mockResolvedValue({ snapshot: null, error: null });

    const { result } = renderHook(() => useNutritionPlanState());

    await act(async () => {
      await result.current.loadPlanForClient('client-1');
    });

    expect(result.current.weeklyPlan).toBeNull();
    expect(result.current.snapshot).toBeNull();
    expect(result.current.versionId).toBeNull();
    expect(result.current.lockedAt).toBeNull();
    expect(result.current.resolvedWeeklyPlan).toBeNull();
  });

  it('never renders mutable fallback data after a locked plan missing snapshot load', async () => {
    mockFetchCurrentPlan.mockResolvedValue({
      plan: fakeLockedPlanPayload,
      planId: 'p1',
      versionId: 'v1',
      createdAt: lockedAtIso,
      snapshot: null,
      payloadHash: 'hash_test',
      versionNumber: 1,
      error: null,
    });
    mockFetchPersistedSnapshot.mockResolvedValue({ snapshot: null, error: null });

    const { result } = renderHook(() => useNutritionPlanState());

    act(() => {
      result.current.setDraftPlan(fakeWeeklyPlan, fakeMacros, ['poulet']);
    });

    expect(result.current.resolvedWeeklyPlan).toBe(fakeWeeklyPlan);

    await act(async () => {
      await result.current.loadPlanForClient('client-1');
    });

    expect(result.current.error).toBe('Locked plan is missing immutable snapshot.');
    expect(result.current.resolvedWeeklyPlan).toBeNull();
  });

  it('retries loading successfully after locked plan snapshot invariant failure', async () => {
    mockFetchCurrentPlan
      .mockResolvedValueOnce({
        plan: fakeLockedPlanPayload,
        planId: 'p1',
        versionId: 'v1',
        createdAt: lockedAtIso,
        snapshot: null,
        payloadHash: 'hash_test',
        versionNumber: 1,
        error: null,
      })
      .mockResolvedValueOnce({
        plan: fakeLockedPlanPayload,
        planId: 'p1',
        versionId: 'v1',
        createdAt: lockedAtIso,
        snapshot: fakeSnapshot,
        payloadHash: 'hash_test',
        versionNumber: 1,
        error: null,
      });
    mockFetchPersistedSnapshot.mockResolvedValue({ snapshot: null, error: null });

    const { result } = renderHook(() => useNutritionPlanState());

    await act(async () => {
      await result.current.loadPlanForClient('client-1');
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.isRetryable).toBe(true);

    await act(async () => {
      await result.current.retryLastAction();
    });

    expect(result.current.isError).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.snapshot).toBe(fakeSnapshot);
    expect(result.current.resolvedWeeklyPlan).not.toBe(fakeWeeklyPlan);
    expect(result.current.resolvedWeeklyPlan).not.toBeNull();
  });

});
