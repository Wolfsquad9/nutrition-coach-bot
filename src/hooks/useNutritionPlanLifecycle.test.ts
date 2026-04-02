/**
 * Integration test: Nutrition plan lifecycle
 * EMPTY → DRAFT → LOCKED → discard → reload → identical snapshot
 *
 * All persistence is mocked with an in-memory store.
 * No Supabase auth, no browser, fully deterministic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNutritionPlanState } from './useNutritionPlanState';
import type { WeeklyMealPlanResult } from '@/services/recipeService';
import type { MacroTargets } from '@/types';
import type { PlanSnapshot } from '@/domain/nutrition/snapshot';

// ─── In-memory snapshot store ────────────────────────────────────────────────

const snapshotStore = new Map<string, PlanSnapshot>();

function resetStore() {
  snapshotStore.clear();
}

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    }),
    auth: {
      getUser: () =>
        Promise.resolve({ data: { user: { id: 'u-lifecycle' } }, error: null }),
    },
  },
}));

// Track lock calls and return deterministic IDs
const mockLockNutritionPlan = vi.fn();
const mockFetchCurrentPlan = vi.fn();
const mockCheckPlanLockStatus = vi.fn();

vi.mock('@/services/supabasePlanService', () => ({
  lockNutritionPlan: (...args: unknown[]) => mockLockNutritionPlan(...args),
  checkPlanLockStatus: (...args: unknown[]) => mockCheckPlanLockStatus(...args),
  fetchCurrentPlan: (...args: unknown[]) => mockFetchCurrentPlan(...args),
}));

// Snapshot persistence backed by in-memory store
const mockPersistSnapshot = vi.fn();
const mockFetchPersistedSnapshot = vi.fn();

vi.mock('@/services/snapshotPersistence', () => ({
  persistSnapshot: (...args: unknown[]) => mockPersistSnapshot(...args),
  fetchPersistedSnapshot: (...args: unknown[]) => mockFetchPersistedSnapshot(...args),
  buildAndPersistSnapshot: vi.fn(),
}));

vi.mock('@/services/supabaseOverrideService', () => ({
  fetchPendingOverrides: vi.fn().mockResolvedValue({ overrides: [], error: null }),
}));

// ─── Test data ───────────────────────────────────────────────────────────────

const CLIENT_ID = 'client-lifecycle-1';
const PLAN_ID = 'plan-lc-1';
const VERSION_ID = 'ver-lc-1';
const VERSION_NUMBER = 1;
const PAYLOAD_HASH = 'hash-abc123';

const fakeMacros: MacroTargets = {
  calories: 2200,
  protein: 165,
  carbs: 220,
  fat: 75,
};

const makeMealData = (name: string, cals: number) => ({
  ingredients: [
    {
      id: name.toLowerCase(),
      name,
      category: 'protein' as const,
      macros: { protein: 30, carbs: 10, fat: 5, calories: cals, fiber: 2 },
      allowedMeals: ['lunch' as const],
      typical_serving_size_g: 150,
      tags: [],
    },
  ],
  recipeText: `${name} recipe`,
  macros: { protein: 30, carbs: 10, fat: 5, calories: cals, fiber: 2 },
});

const emptyMealData = {
  ingredients: [],
  recipeText: '',
  macros: { protein: 0, carbs: 0, fat: 0, calories: 0, fiber: 0 },
};

const fakeWeeklyPlan: WeeklyMealPlanResult = {
  days: [
    {
      dayNumber: 1,
      dayName: 'Monday',
      plan: {
        dailyPlan: {
          breakfast: makeMealData('Eggs', 300),
          lunch: makeMealData('Chicken', 500),
          dinner: makeMealData('Salmon', 450),
          snack: makeMealData('Yogurt', 150),
        },
        totalMacros: { calories: 1400, protein: 120, carbs: 40, fat: 20, fiber: 8 },
        targetMacros: { calories: 2200, protein: 165, carbs: 220, fat: 75 },
        variance: { calories: 0, protein: 0, carbs: 0, fat: 0 },
      },
    },
  ],
  weeklyTotalMacros: { calories: 1400, protein: 120, carbs: 40, fat: 20, fiber: 8 },
  weeklyTargetMacros: { calories: 2200, protein: 165, carbs: 220, fat: 75 },
  weeklyVariance: { calories: 0, protein: 0, carbs: 0, fat: 0 },
};

const clientInfo = {
  firstName: 'Test',
  lastName: 'Client',
  goal: 'Muscle gain',
  activityLevel: 'High',
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Nutrition plan lifecycle: EMPTY → DRAFT → LOCKED → discard → reload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();

    // Lock always succeeds with deterministic IDs
    mockLockNutritionPlan.mockResolvedValue({
      success: true,
      planId: PLAN_ID,
      versionId: VERSION_ID,
      error: null,
    });

    // persistSnapshot writes to in-memory store
    mockPersistSnapshot.mockImplementation(
      async (versionId: string, snapshot: PlanSnapshot) => {
        snapshotStore.set(versionId, structuredClone(snapshot) as PlanSnapshot);
        return { success: true, error: null };
      }
    );

    // fetchPersistedSnapshot reads from in-memory store
    mockFetchPersistedSnapshot.mockImplementation(async (versionId: string) => {
      const stored = snapshotStore.get(versionId);
      return {
        snapshot: stored ? (structuredClone(stored) as PlanSnapshot) : null,
        error: null,
      };
    });

    // Default: no existing plan
    mockCheckPlanLockStatus.mockResolvedValue({
      isLocked: false,
      lockedUntil: null,
      daysRemaining: 0,
    });

    mockFetchCurrentPlan.mockResolvedValue({
      plan: null,
      planId: null,
      versionId: null,
      versionNumber: null,
      createdAt: null,
      payloadHash: null,
      error: null,
    });
  });

  it('locked plan snapshot is restored identically after discard + reload', async () => {
    const { result } = renderHook(() => useNutritionPlanState());

    // ── Step 1: Verify EMPTY ──
    expect(result.current.lifecycleState).toBe('EMPTY');
    expect(result.current.weeklyPlan).toBeNull();

    // ── Step 2: Set draft plan ──
    act(() => {
      result.current.setDraftPlan(fakeWeeklyPlan, fakeMacros, ['chicken', 'eggs']);
    });

    expect(result.current.lifecycleState).toBe('DRAFT');
    expect(result.current.isDraft).toBe(true);
    expect(result.current.weeklyPlan).not.toBeNull();

    // ── Step 3: Pre-configure reload mock (lockPlan calls loadPlanForClient internally) ──
    // We need a stable lockedAt for the mock; use a fixed date.
    const lockedAtDate = new Date();

    mockFetchCurrentPlan.mockResolvedValue({
      plan: {
        weeklyPlan: fakeWeeklyPlan,
        macroTargets: fakeMacros,
        likedIngredients: ['chicken', 'eggs'],
        lockedAt: lockedAtDate.toISOString(),
      },
      planId: PLAN_ID,
      versionId: VERSION_ID,
      versionNumber: VERSION_NUMBER,
      createdAt: lockedAtDate.toISOString(),
      payloadHash: PAYLOAD_HASH,
      error: null,
    });

    mockCheckPlanLockStatus.mockResolvedValue({
      isLocked: true,
      lockedUntil: new Date(lockedAtDate.getTime() + 28 * 24 * 60 * 60 * 1000),
      daysRemaining: 28,
    });

    // ── Step 4: Lock the plan ──
    let lockResult: { success: boolean; error: string | null } = { success: false, error: 'init' };
    await act(async () => {
      lockResult = await result.current.lockPlan(CLIENT_ID, clientInfo);
    });

    expect(lockResult.success).toBe(true);
    expect(lockResult.error).toBeNull();
    expect(mockPersistSnapshot).toHaveBeenCalledTimes(1);

    // Verify snapshot was stored
    expect(snapshotStore.has(VERSION_ID)).toBe(true);

    // ── Step 5: Capture the persisted snapshot ──
    const persistedSnapshot = structuredClone(snapshotStore.get(VERSION_ID)!) as PlanSnapshot;
    expect(persistedSnapshot.meta.versionNumber).toBe(1);
    expect(persistedSnapshot.client.firstName).toBe('Test');
    expect(persistedSnapshot.client.lastName).toBe('Client');

    // ── Step 6: Discard draft (triggers reload) ──
    // State is now LOCKED after lockPlan's internal reload, so discardDraft
    // won't clear (isDraft is false). Instead, call loadPlanForClient directly
    // to simulate the "discard and reload" flow for a locked plan.
    await act(async () => {
      await result.current.loadPlanForClient(CLIENT_ID);
    });

    // ── Step 7: Verify state is LOCKED after reload ──
    expect(result.current.lifecycleState).toBe('LOCKED');
    expect(result.current.isLocked).toBe(true);
    expect(result.current.isDraft).toBe(false);

    // ── Step 8: Verify plan data integrity ──
    expect(result.current.planId).toBe(PLAN_ID);
    expect(result.current.versionId).toBe(VERSION_ID);
    expect(result.current.versionNumber).toBe(VERSION_NUMBER);
    expect(result.current.payloadHash).toBe(PAYLOAD_HASH);

    // ── Step 9: Verify snapshot was fetched from store ──
    expect(mockFetchPersistedSnapshot).toHaveBeenCalledWith(VERSION_ID);

    // ── Step 10: Verify restored snapshot matches persisted ──
    const restoredSnapshot = result.current.snapshot;
    expect(restoredSnapshot).not.toBeNull();
    expect(restoredSnapshot).toEqual(persistedSnapshot);

    // ── Step 11: Verify specific snapshot fields for deep integrity ──
    expect(restoredSnapshot!.identifier.versionId).toBe(VERSION_ID);
    expect(restoredSnapshot!.meta.versionNumber).toBe(persistedSnapshot.meta.versionNumber);
    expect(restoredSnapshot!.client).toEqual(persistedSnapshot.client);
    expect(restoredSnapshot!.metrics).toEqual(persistedSnapshot.metrics);
    expect(restoredSnapshot!.weeklyPlan).toEqual(persistedSnapshot.weeklyPlan);
    expect(restoredSnapshot!.groceryList).toEqual(persistedSnapshot.groceryList);
  });

  it('snapshot persistence failure prevents lock completion', async () => {
    // Override persist to fail
    mockPersistSnapshot.mockResolvedValue({ success: false, error: 'Disk full' });

    const { result } = renderHook(() => useNutritionPlanState());

    act(() => {
      result.current.setDraftPlan(fakeWeeklyPlan, fakeMacros, ['chicken']);
    });

    let lockResult: { success: boolean; error: string | null } = { success: true, error: null };
    await act(async () => {
      lockResult = await result.current.lockPlan(CLIENT_ID, clientInfo);
    });

    expect(lockResult.success).toBe(false);
    expect(lockResult.error).toContain('Disk full');
    expect(result.current.lastPersistenceFailed).toBe(true);
    expect(result.current.isLocked).toBe(false);
    expect(snapshotStore.size).toBe(0);
  });
});
