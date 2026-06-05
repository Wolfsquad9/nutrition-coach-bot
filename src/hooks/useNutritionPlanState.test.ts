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
const mockEmitRuntimeFailure = vi.fn();
const mockEmitRetryTelemetry = vi.fn();
const mockEmitHydrationResetTelemetry = vi.fn();

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
vi.mock('@/domain/nutrition/runtimeTelemetry', () => ({
  emitRuntimeFailure: (...args: Parameters<typeof mockEmitRuntimeFailure>) => mockEmitRuntimeFailure(...args),
  emitRetryTelemetry: (...args: Parameters<typeof mockEmitRetryTelemetry>) => mockEmitRetryTelemetry(...args),
  emitHydrationResetTelemetry: (...args: Parameters<typeof mockEmitHydrationResetTelemetry>) => mockEmitHydrationResetTelemetry(...args),
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


const cloneSnapshot = (): PlanSnapshot => structuredClone(fakeSnapshot) as PlanSnapshot;

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
    expect(Object.isFrozen(result.current.snapshot)).toBe(true);
    expect(Object.isFrozen(result.current.snapshot?.metrics)).toBe(true);
    expect(Object.isFrozen(result.current.snapshot?.weeklyPlan)).toBe(true);
    expect(Object.isFrozen(result.current.snapshot?.meta)).toBe(true);
    expect(result.current.resolvedWeeklyPlan).not.toBe(fakeWeeklyPlan);
    expect(result.current.resolvedWeeklyPlan).not.toBeNull();
  });


  it('rejects invalid fetchCurrentPlan snapshot before state commit', async () => {
    const invalidSnapshot = { ...cloneSnapshot(), metrics: { ...cloneSnapshot().metrics, targetCalories: Number.NaN } };
    mockFetchCurrentPlan.mockResolvedValue({
      plan: fakeLockedPlanPayload,
      planId: 'p1',
      versionId: 'v1',
      createdAt: lockedAtIso,
      snapshot: invalidSnapshot,
      payloadHash: 'hash_test',
      versionNumber: 1,
      error: null,
    });

    const { result } = renderHook(() => useNutritionPlanState());
    act(() => {
      result.current.setDraftPlan(fakeWeeklyPlan, fakeMacros, ['poulet']);
    });

    await act(async () => {
      await result.current.loadPlanForClient('client-1');
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.error).toContain('Snapshot validation failed (fetchCurrentPlan.snapshot): metrics.targetCalories must be a finite number');
    expect(result.current.snapshot).toBeNull();
    expect(result.current.resolvedWeeklyPlan).toBeNull();
    expect(result.current.weeklyPlan).toBeNull();
  });

  it('rejects invalid fetchPersistedSnapshot snapshot before state commit', async () => {
    const invalidSnapshot = { ...cloneSnapshot(), groceryList: [{ ingredient: '', totalAmount: 1, unit: 'g', category: 'carb' }] };
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
    mockFetchPersistedSnapshot.mockResolvedValue({ snapshot: invalidSnapshot, error: null });

    const { result } = renderHook(() => useNutritionPlanState());

    await act(async () => {
      await result.current.loadPlanForClient('client-1');
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.error).toContain('Snapshot validation failed (fetchPersistedSnapshot): groceryList[0].ingredient must be a non-empty string');
    expect(result.current.snapshot).toBeNull();
  });

  it('rejects malformed nested ingredient during load', async () => {
    const baseSnapshot = cloneSnapshot();
    const malformedMeals = [{ id: 'm1', mealNumber: 1, mealType: 'breakfast', time: '07:00', totalMacros: { calories: 1, protein: 1, carbs: 1, fat: 1 }, recipes: [{ servings: 1, adjustedMacros: { calories: 1, protein: 1, carbs: 1, fat: 1 }, recipe: { id: 'r1', name: 'R', category: 'breakfast', prepTime: 1, cookTime: 1, servings: 1, ingredients: [{ id: 'i1', name: '', amount: 1, unit: 'g', category: 'carb', macrosPer100g: { calories: 1, protein: 1, carbs: 1, fat: 1 } }], instructions: [], macrosPerServing: { calories: 1, protein: 1, carbs: 1, fat: 1 }, tags: [], dietTypes: [], allergens: [], equipment: [], difficulty: 'easy' } }] }];
    const invalid = {
      ...baseSnapshot,
      weeklyPlan: [{ ...baseSnapshot.weeklyPlan[0], meals: malformedMeals }],
    };

    mockFetchCurrentPlan.mockResolvedValue({ plan: fakeLockedPlanPayload, planId: 'p1', versionId: 'v1', createdAt: lockedAtIso, snapshot: invalid, payloadHash: 'hash_test', versionNumber: 1, error: null });

    const { result } = renderHook(() => useNutritionPlanState());
    await act(async () => {
      await result.current.loadPlanForClient('client-1');
    });

    expect(result.current.error).toContain('weeklyPlan[0].meals[0].recipes[0].recipe.ingredients[0].name must be a non-empty string');
    expect(result.current.snapshot).toBeNull();
  });

  it('retries successfully after invalid snapshot becomes valid', async () => {
    const invalidSnapshot = { ...cloneSnapshot(), metrics: { ...cloneSnapshot().metrics, targetCalories: Number.NaN } };
    mockFetchCurrentPlan
      .mockResolvedValueOnce({ plan: fakeLockedPlanPayload, planId: 'p1', versionId: 'v1', createdAt: lockedAtIso, snapshot: invalidSnapshot, payloadHash: 'hash_test', versionNumber: 1, error: null })
      .mockResolvedValueOnce({ plan: fakeLockedPlanPayload, planId: 'p1', versionId: 'v1', createdAt: lockedAtIso, snapshot: cloneSnapshot(), payloadHash: 'hash_test', versionNumber: 1, error: null });

    const { result } = renderHook(() => useNutritionPlanState());
    await act(async () => { await result.current.loadPlanForClient('client-1'); });
    expect(result.current.isRetryable).toBe(true);

    await act(async () => { await result.current.retryLastAction(); });
    expect(result.current.error).toBeNull();
    expect(result.current.snapshot).not.toBeNull();
    expect(result.current.resolvedWeeklyPlan).not.toBeNull();
  });


  it('classifies unknown load failures safely as non-retryable', async () => {
    mockFetchCurrentPlan.mockRejectedValue('non-error failure');

    const { result } = renderHook(() => useNutritionPlanState());

    await act(async () => {
      await result.current.loadPlanForClient('client-1');
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.error).toBe('Failed to load plan');
    expect(result.current.isRetryable).toBe(false);
  });

  it('keeps transient load failures retryable', async () => {
    mockFetchCurrentPlan.mockRejectedValueOnce(new Error('Network timeout')).mockResolvedValueOnce({
      plan: fakeLockedPlanPayload,
      planId: 'p1',
      versionId: 'v1',
      createdAt: lockedAtIso,
      snapshot: cloneSnapshot(),
      payloadHash: 'hash_test',
      versionNumber: 1,
      error: null,
    });

    const { result } = renderHook(() => useNutritionPlanState());

    await act(async () => {
      await result.current.loadPlanForClient('client-1');
    });

    expect(result.current.isRetryable).toBe(true);

    await act(async () => {
      await result.current.retryLastAction();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.snapshot).not.toBeNull();
  });

  it('emits runtime telemetry for snapshot validation failure', async () => {
    const invalidSnapshot = { ...cloneSnapshot(), metrics: { ...cloneSnapshot().metrics, targetCalories: Number.NaN } };
    mockFetchCurrentPlan.mockResolvedValueOnce({
      plan: fakeLockedPlanPayload, planId: 'p1', versionId: 'v1', createdAt: lockedAtIso,
      snapshot: invalidSnapshot, payloadHash: 'hash_test', versionNumber: 1, error: null,
    });
    const { result } = renderHook(() => useNutritionPlanState());
    await act(async () => { await result.current.loadPlanForClient('client-1'); });
    expect(mockEmitRuntimeFailure).toHaveBeenCalled();
    expect(mockEmitHydrationResetTelemetry).toHaveBeenCalled();
  });

  it('emits retry attempted and succeeded telemetry', async () => {
    mockFetchCurrentPlan
      .mockRejectedValueOnce(new Error('Network timeout'))
      .mockResolvedValueOnce({
        plan: fakeLockedPlanPayload, planId: 'p1', versionId: 'v1', createdAt: lockedAtIso,
        snapshot: cloneSnapshot(), payloadHash: 'hash_test', versionNumber: 1, error: null,
      });
    const { result } = renderHook(() => useNutritionPlanState());
    await act(async () => { await result.current.loadPlanForClient('client-1'); });
    await act(async () => { await result.current.retryLastAction(); });
    expect(mockEmitRetryTelemetry).toHaveBeenCalledWith(expect.objectContaining({ phase: 'attempted' }));
    expect(mockEmitRetryTelemetry).toHaveBeenCalledWith(expect.objectContaining({ phase: 'succeeded' }));
  });

  it('emits retry failed telemetry when retry does not recover', async () => {
    mockFetchCurrentPlan.mockRejectedValue(new Error('Still down'));
    const { result } = renderHook(() => useNutritionPlanState());
    await act(async () => { await result.current.loadPlanForClient('client-1'); });
    await act(async () => { await result.current.retryLastAction(); });
    expect(mockEmitRetryTelemetry).toHaveBeenCalledWith(expect.objectContaining({ phase: 'failed' }));
  });

  it('keeps draft weeklyPlan data mutable', () => {
    const draftPlan = JSON.parse(JSON.stringify(fakeWeeklyPlan)) as WeeklyMealPlanResult;
    const { result } = renderHook(() => useNutritionPlanState());

    act(() => {
      result.current.setDraftPlan(draftPlan, fakeMacros, ['poulet']);
    });

    expect(Object.isFrozen(result.current.weeklyPlan)).toBe(false);
    expect(Object.isFrozen(result.current.weeklyPlan?.days)).toBe(false);

    expect(() => {
      result.current.weeklyPlan!.days[0].dayName = 'Changed draft day';
    }).not.toThrow();

    expect(result.current.weeklyPlan!.days[0].dayName).toBe('Changed draft day');
  });

});
