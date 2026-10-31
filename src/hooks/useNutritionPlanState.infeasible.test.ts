import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNutritionPlanState } from '@/hooks/useNutritionPlanState';
import type { NutritionMetrics } from '@/types';

// Mock the supabase plan service
vi.mock('@/services/supabasePlanService', () => ({
  fetchCurrentPlan: vi.fn().mockResolvedValue({
    plan: null, planId: null, versionId: null, createdAt: null,
    snapshot: null, payloadHash: null, versionNumber: null, error: null,
  }),
  checkPlanLockStatus: vi.fn().mockResolvedValue({ isLocked: false, lockedUntil: null, daysRemaining: 0 }),
  lockNutritionPlan: vi.fn().mockResolvedValue({ success: true, planId: 'p1', versionId: 'v1', versionNumber: 1, error: null }),
  buildLockedPlanPayload: vi.fn().mockReturnValue({}),
  hashPlanPayload: vi.fn().mockReturnValue('hash_123'),
}));

vi.mock('@/services/snapshotPersistence', () => ({
  fetchPersistedSnapshot: vi.fn().mockResolvedValue({ snapshot: null, error: null }),
}));

vi.mock('@/services/supabaseOverrideService', () => ({
  fetchPendingOverrides: vi.fn().mockResolvedValue({ overrides: [], error: null }),
}));

vi.mock('@/services/plan/loadPrescription', () => ({
  loadActivePrescription: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/hooks/useAdaptiveNutritionTarget', () => ({
  useAdaptiveNutritionTarget: () => ({ status: 'idle', decision: null, baseline: null, futureMetrics: null, effectiveMetrics: null, effectiveWeeklyRateKg: null, error: null }),
}));

const fakeWeeklyPlan = {
  days: [],
  weeklyTotalMacros: { calories: 2000, protein: 150, carbs: 200, fat: 70, fiber: 0 },
  weeklyTargetMacros: { calories: 2000, protein: 150, carbs: 200, fat: 70 },
  weeklyVariance: { calories: 0, protein: 0, carbs: 0, fat: 0 },
};

const fakeMacros = { calories: 2000, protein: 150, carbs: 200, fat: 70 };

const fakeClientInfo = {
  firstName: 'Test',
  lastName: 'Client',
  goal: 'fat_loss',
  activityLevel: 'moderately_active',
};

describe('Infeasible nutrition target blocking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks lock when clientMetrics.isFeasible is false', async () => {
    const infeasibleMetrics: NutritionMetrics = {
      tdee: 3656,
      bmr: 3000,
      targetCalories: 3656,
      proteinGrams: 600,
      carbsGrams: 0,
      fatGrams: 180,
      fiberGrams: 0,
      waterLiters: 3,
      isFeasible: false,
    };

    const { result } = renderHook(() => useNutritionPlanState());

    act(() => {
      result.current.setDraftPlan(fakeWeeklyPlan, fakeMacros, ['poulet'], infeasibleMetrics);
    });

    expect(result.current.isDraft).toBe(true);

    let lockResult: { success: boolean; error: string | null } = { success: true, error: null };
    await act(async () => {
      lockResult = await result.current.lockPlan('client-1', fakeClientInfo);
    });

    expect(lockResult.success).toBe(false);
    expect(lockResult.error).toContain('Infeasible nutrition target');
    expect(result.current.isLocked).toBe(false);
  });

  it('allows lock when clientMetrics.isFeasible is true', async () => {
    const feasibleMetrics: NutritionMetrics = {
      tdee: 2759,
      bmr: 1780,
      targetCalories: 2209,
      proteinGrams: 160,
      carbsGrams: 284,
      fatGrams: 48,
      fiberGrams: 30,
      waterLiters: 3,
      isFeasible: true,
    };

    const { result } = renderHook(() => useNutritionPlanState());

    act(() => {
      result.current.setDraftPlan(fakeWeeklyPlan, fakeMacros, ['poulet'], feasibleMetrics);
    });

    let lockResult: { success: boolean; error: string | null } = { success: false, error: 'init' };
    await act(async () => {
      lockResult = await result.current.lockPlan('client-1', fakeClientInfo);
    });

    expect(lockResult.success).toBe(true);
    expect(lockResult.error).toBeNull();
  });

  it('blocks lock when clientMetrics.isFeasible is undefined (missing feasibility)', async () => {
    const incompleteMetrics: NutritionMetrics = {
      tdee: 2759,
      bmr: 1780,
      targetCalories: 2209,
      proteinGrams: 160,
      carbsGrams: 284,
      fatGrams: 48,
      fiberGrams: 30,
      waterLiters: 3,
      // isFeasible deliberately undefined — should now be blocked
    };

    const { result } = renderHook(() => useNutritionPlanState());

    act(() => {
      result.current.setDraftPlan(fakeWeeklyPlan, fakeMacros, ['poulet'], incompleteMetrics);
    });

    let lockResult: { success: boolean; error: string | null } = { success: true, error: null };
    await act(async () => {
      lockResult = await result.current.lockPlan('client-1', fakeClientInfo);
    });

    expect(lockResult.success).toBe(false);
    expect(lockResult.error).toContain('Infeasible nutrition target');
    expect(result.current.isLocked).toBe(false);
  });

  it('blocks lock when clientMetrics is null but macroTargets indicate infeasibility', async () => {
    // When no clientMetrics are provided, the lock proceeds (backward compat)
    // This tests that the check doesn't break when metrics are missing
    const { result } = renderHook(() => useNutritionPlanState());

    act(() => {
      result.current.setDraftPlan(fakeWeeklyPlan, fakeMacros, ['poulet']);
    });

    let lockResult: { success: boolean; error: string | null } = { success: false, error: 'init' };
    await act(async () => {
      lockResult = await result.current.lockPlan('client-1', fakeClientInfo);
    });

    // Missing feasibility must now be blocked (fail-closed)
    expect(lockResult.success).toBe(false);
  });
  it('blocks lock when clientMetrics.isFeasible is undefined', async () => {
    const incompleteMetrics: NutritionMetrics = {
      tdee: 2759,
      bmr: 1780,
      targetCalories: 2209,
      proteinGrams: 160,
      carbsGrams: 284,
      fatGrams: 48,
      fiberGrams: 30,
      waterLiters: 3,
      // isFeasible deliberately undefined
    };

    const { result } = renderHook(() => useNutritionPlanState());

    act(() => {
      result.current.setDraftPlan(fakeWeeklyPlan, fakeMacros, ['poulet'], incompleteMetrics);
    });

    let lockResult: { success: boolean; error: string | null } = { success: true, error: null };
    await act(async () => {
      lockResult = await result.current.lockPlan('client-1', fakeClientInfo);
    });

    expect(lockResult.success).toBe(false);
    expect(lockResult.error).toContain('Infeasible nutrition target');
    expect(result.current.isLocked).toBe(false);
  });

  it('blocks lock when clientMetrics is null', async () => {
    const { result } = renderHook(() => useNutritionPlanState());

    act(() => {
      result.current.setDraftPlan(fakeWeeklyPlan, fakeMacros, ['poulet']);
    });

    let lockResult: { success: boolean; error: string | null } = { success: true, error: null };
    await act(async () => {
      lockResult = await result.current.lockPlan('client-1', fakeClientInfo);
    });

    expect(lockResult.success).toBe(false);
    expect(lockResult.error).toContain('Infeasible nutrition target');
    expect(result.current.isLocked).toBe(false);
  });
});
