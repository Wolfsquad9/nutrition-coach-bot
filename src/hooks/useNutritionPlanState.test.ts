/**
 * Integration tests for useNutritionPlanState — snapshot atomicity with lock
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNutritionPlanState } from './useNutritionPlanState';
import type { WeeklyMealPlanResult } from '@/services/recipeService';
import type { MacroTargets } from '@/types';

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
vi.mock('@/services/supabasePlanService', () => ({
  lockNutritionPlan: (...args: Parameters<typeof mockLockNutritionPlan>) => mockLockNutritionPlan(...args),
  checkPlanLockStatus: vi.fn().mockResolvedValue({ isLocked: false, lockedUntil: null, daysRemaining: 0 }),
  fetchCurrentPlan: vi.fn().mockResolvedValue({ plan: null, planId: null, versionId: null, createdAt: null, error: null }),
}));

const mockPersistSnapshot = vi.fn();
vi.mock('@/services/snapshotPersistence', () => ({
  persistSnapshot: (...args: Parameters<typeof mockPersistSnapshot>) => mockPersistSnapshot(...args),
  fetchPersistedSnapshot: vi.fn().mockResolvedValue({ snapshot: null, error: null }),
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

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('lockPlan snapshot atomicity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns failure when persistSnapshot fails', async () => {
    mockLockNutritionPlan.mockResolvedValue({ success: true, planId: 'p1', versionId: 'v1', error: null });
    mockPersistSnapshot.mockResolvedValue({ success: false, error: 'DB write failed' });

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

  it('returns success when both lock and snapshot succeed', async () => {
    mockLockNutritionPlan.mockResolvedValue({ success: true, planId: 'p1', versionId: 'v1', error: null });
    mockPersistSnapshot.mockResolvedValue({ success: true, error: null });

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

  it('returns failure when persistSnapshot throws', async () => {
    mockLockNutritionPlan.mockResolvedValue({ success: true, planId: 'p1', versionId: 'v1', error: null });
    mockPersistSnapshot.mockRejectedValue(new Error('Network error'));

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
    let resolveLock: (value: { success: boolean; planId: string; versionId: string; error: null }) => void;
    const lockPromise = new Promise<{ success: boolean; planId: string; versionId: string; error: null }>((resolve) => {
      resolveLock = resolve;
    });

    mockLockNutritionPlan.mockReturnValue(lockPromise);
    mockPersistSnapshot.mockResolvedValue({ success: true, error: null });

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
      resolveLock!({ success: true, planId: 'p1', versionId: 'v1', error: null });
      await Promise.all([firstLock!, secondLock!]);
    });
  });

  it('exposes a retry action after snapshot persistence fails', async () => {
    mockLockNutritionPlan.mockResolvedValue({ success: true, planId: 'p1', versionId: 'v1', error: null });
    mockPersistSnapshot
      .mockResolvedValueOnce({ success: false, error: 'Transient write failed' })
      .mockResolvedValueOnce({ success: true, error: null });

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
    expect(mockPersistSnapshot).toHaveBeenCalledTimes(2);
  });

});
