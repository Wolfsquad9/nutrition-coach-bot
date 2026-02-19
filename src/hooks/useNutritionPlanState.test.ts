/**
 * Integration tests for useNutritionPlanState — snapshot atomicity with lock
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNutritionPlanState } from './useNutritionPlanState';

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Mock supabase client (required by transitive deps)
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
  lockNutritionPlan: (...args: any[]) => mockLockNutritionPlan(...args),
  checkPlanLockStatus: vi.fn().mockResolvedValue({ isLocked: false, lockedUntil: null, daysRemaining: 0 }),
  fetchCurrentPlan: vi.fn().mockResolvedValue({ plan: null, planId: null, versionId: null, createdAt: null, error: null }),
}));

const mockPersistSnapshot = vi.fn();
vi.mock('@/services/snapshotPersistence', () => ({
  persistSnapshot: (...args: any[]) => mockPersistSnapshot(...args),
  fetchPersistedSnapshot: vi.fn().mockResolvedValue({ snapshot: null, error: null }),
  buildAndPersistSnapshot: vi.fn(),
}));

vi.mock('@/services/supabaseOverrideService', () => ({
  fetchPendingOverrides: vi.fn().mockResolvedValue({ overrides: [], error: null }),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fakeMacros = { calories: 2000, protein: 150, carbs: 200, fat: 70 };
const fakeWeeklyPlan = {
  days: [
    {
      dayNumber: 1,
      plan: {
        totalMacros: { calories: 2000, protein: 150, carbs: 200, fat: 70 },
        meals: [],
      },
    },
  ],
};
const fakeClientInfo = { firstName: 'Jean', lastName: 'Dupont', goal: 'Perte de poids', activityLevel: 'Modéré' };

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('lockPlan snapshot atomicity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns failure when persistSnapshot fails', async () => {
    // Lock succeeds
    mockLockNutritionPlan.mockResolvedValue({ success: true, planId: 'p1', versionId: 'v1', error: null });
    // Snapshot fails
    mockPersistSnapshot.mockResolvedValue({ success: false, error: 'DB write failed' });

    const { result } = renderHook(() => useNutritionPlanState());

    // Set a draft first
    act(() => {
      result.current.setDraftPlan(fakeWeeklyPlan as any, fakeMacros, ['poulet']);
    });

    expect(result.current.isDraft).toBe(true);

    // Attempt to lock
    let lockResult: { success: boolean; error: string | null } = { success: true, error: null };
    await act(async () => {
      lockResult = await result.current.lockPlan('client-1', fakeClientInfo);
    });

    // Lock must report failure
    expect(lockResult.success).toBe(false);
    expect(lockResult.error).toContain('DB write failed');

    // UI state must be ERROR
    expect(result.current.isError).toBe(true);
    expect(result.current.lastPersistenceFailed).toBe(true);

    // Plan must NOT be in LOCKED state
    expect(result.current.isLocked).toBe(false);
  });

  it('returns success when both lock and snapshot succeed', async () => {
    mockLockNutritionPlan.mockResolvedValue({ success: true, planId: 'p1', versionId: 'v1', error: null });
    mockPersistSnapshot.mockResolvedValue({ success: true, error: null });

    const { result } = renderHook(() => useNutritionPlanState());

    act(() => {
      result.current.setDraftPlan(fakeWeeklyPlan as any, fakeMacros, ['poulet']);
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
      result.current.setDraftPlan(fakeWeeklyPlan as any, fakeMacros, ['poulet']);
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
});
