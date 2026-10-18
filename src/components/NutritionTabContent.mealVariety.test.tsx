/**
 * Meal variety — production wiring regression guard.
 *
 * Closes the same gap the eligibility wiring test closes, for the coach-facing
 * meal-variety preference: it renders the REAL component and asserts that the
 * selection the coach makes actually reaches the optimizer's candidate
 * generation call (weekly only), is recorded on the draft, and is persisted
 * into the locked plan payload. It fails if the control is removed, becomes
 * decorative (UI-only), or if regeneration stops honouring the latest value.
 *
 * Conventions follow `NutritionTabContent.eligibilityWiring.test.tsx`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, waitFor, screen, fireEvent } from '@testing-library/react';
import type { Client } from '@/types';
import type { ClientIngredientRestrictions } from '@/utils/ingredientSubstitution';

const h = vi.hoisted(() => ({
  dailyCalls: [] as unknown[][],
  weeklyInputs: [] as Record<string, unknown>[],
  lockedPayloads: [] as Record<string, unknown>[],
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/services/supabasePlanService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/supabasePlanService')>();
  return {
    ...actual,
    fetchCurrentPlan: async () => ({
      plan: null, planId: null, versionId: null, createdAt: null,
      snapshot: null, payloadHash: null, versionNumber: null, error: null,
    }),
    checkPlanLockStatus: async () => ({ isLocked: false, lockedUntil: null, daysRemaining: 0 }),
    // Record the REAL buildLockedPlanPayload output, then report success —
    // this is where the generation-time preference must surface at persistence.
    lockNutritionPlan: async (_clientId: string, payload: Record<string, unknown>) => {
      h.lockedPayloads.push(payload);
      return { success: true, planId: 'plan-1', versionId: 'version-1', versionNumber: 1, error: null };
    },
  };
});
vi.mock('@/services/snapshotPersistence', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/snapshotPersistence')>();
  return { ...actual, fetchPersistedSnapshot: async () => ({ snapshot: null, error: null }) };
});
vi.mock('@/services/supabaseOverrideService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/supabaseOverrideService')>();
  return { ...actual, fetchPendingOverrides: async () => ({ overrides: [], error: null }) };
});
vi.mock('@/hooks/useAdaptiveNutritionTarget', () => ({
  useAdaptiveNutritionTarget: () => ({
    status: 'ready', decision: null, baseline: null, futureMetrics: null,
    effectiveMetrics: null, effectiveWeeklyRateKg: null,
  }),
}));

// Spy at the production boundary: record the daily call, then delegate to the
// real implementation so the component still receives a genuine plan.
vi.mock('@/services/recipeService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/recipeService')>();
  return {
    ...actual,
    generateFullDayMealPlan: (...args: unknown[]) => {
      h.dailyCalls.push(args);
      return (actual.generateFullDayMealPlan as (...a: unknown[]) => unknown)(...args);
    },
  };
});

vi.mock('@/services/optimization/OptimizationEngine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/optimization/OptimizationEngine')>();
  return {
    ...actual,
    createDefaultOptimizationEngine: () => {
      const engine = actual.createDefaultOptimizationEngine();
      return {
        ...engine,
        generate: (input: Record<string, unknown>) => {
          h.weeklyInputs.push(input);
          return engine.generate(input as never);
        },
      };
    },
  };
});

import { NutritionTabContent } from './NutritionTabContent';

const restriction: ClientIngredientRestrictions = {
  clientId: 'client-1',
  clientName: 'Test Client',
  blockedIngredients: ['eggs'],
  preferredIngredients: [
    'chicken-breast', 'brown-rice', 'broccoli', 'olive-oil',
    'eggs', 'greek-yogurt', 'banana', 'salmon', 'oats',
  ],
  substitutionRules: {},
};

const EXPECTED_ELIGIBLE = ['chicken-breast', 'brown-rice', 'broccoli', 'olive-oil', 'salmon', 'oats'];

const client = {
  id: 'client-1',
  firstName: 'Test',
  lastName: 'Client',
  email: 'test@example.com',
  phone: '',
  birthDate: '1990-01-01',
  gender: 'male',
  age: 36,
  height: 180,
  weight: 75,
  activityLevel: 'moderately_active',
  primaryGoal: 'maintenance',
  trainingExperience: 'intermediate',
  trainingDaysPerWeek: 4,
  dietType: 'omnivore',
  mealsPerDay: 4,
  intolerances: [],
  allergies: ['dairy'],
  dislikedFoods: ['banana'],
  medicalConditions: [],
  medications: [],
  injuries: [],
  hasRedFlags: false,
} as unknown as Client;

const renderTab = async () => {
  render(
    <NutritionTabContent
      activeClientId="client-1"
      activeClient={client}
      clientRestrictions={[restriction]}
    />,
  );
  await waitFor(() =>
    expect(screen.getByRole('button', { name: /^(Weekly Plan|Regenerate)$/i })).toBeEnabled(),
  );
};

const clickWeekly = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /^(Weekly Plan|Regenerate)$/i }));
  });
  await waitFor(() => expect(h.weeklyInputs.length).toBeGreaterThan(0));
};

const selectVariety = (name: 'More variety' | 'Traditional variety') => {
  act(() => {
    fireEvent.click(screen.getByRole('radio', { name }));
  });
};

describe('NutritionTabContent — meal variety reaches real generation', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    h.dailyCalls.length = 0;
    h.weeklyInputs.length = 0;
    h.lockedPayloads.length = 0;
    try {
      window.localStorage?.clear();
    } catch {
      /* storage unavailable in this environment */
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults to More variety (the established optimizer behaviour)', async () => {
    await renderTab();

    expect(screen.getByRole('radio', { name: 'More variety' }))
      .toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Traditional variety' }))
      .toHaveAttribute('aria-checked', 'false');
  });

  it('default selection sends weekIngredientDiversity=true to the optimizer', async () => {
    await renderTab();
    await clickWeekly();

    expect(h.weeklyInputs[0].weekIngredientDiversity).toBe(true);
    // Eligibility stays authoritative alongside the preference.
    expect(h.weeklyInputs[0].allowedIngredientIds).toEqual(EXPECTED_ELIGIBLE);
    // The generation-time preference is recorded on the draft for review/persist.
    expect(screen.getByText(/Meal variety:\s*More variety/i)).toBeInTheDocument();
  }, 30_000);

  it('Traditional variety sends weekIngredientDiversity=false (legacy contract)', async () => {
    await renderTab();
    selectVariety('Traditional variety');
    await clickWeekly();

    expect(h.weeklyInputs[0].weekIngredientDiversity).toBe(false);
    expect(h.weeklyInputs[0].allowedIngredientIds).toEqual(EXPECTED_ELIGIBLE);
    expect(screen.getByText(/Meal variety:\s*Traditional variety/i)).toBeInTheDocument();
  }, 30_000);

  it('regeneration honours the LATEST selection', async () => {
    await renderTab();
    await clickWeekly();
    expect(h.weeklyInputs[0].weekIngredientDiversity).toBe(true);

    selectVariety('Traditional variety');
    await clickWeekly();
    expect(h.weeklyInputs).toHaveLength(2);
    expect(h.weeklyInputs[1].weekIngredientDiversity).toBe(false);

    selectVariety('More variety');
    await clickWeekly();
    expect(h.weeklyInputs).toHaveLength(3);
    expect(h.weeklyInputs[2].weekIngredientDiversity).toBe(true);
  }, 45_000);

  it('daily generation is unaffected by the weekly-only control', async () => {
    await renderTab();
    selectVariety('Traditional variety');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Daily Plan/i }));
    });
    await waitFor(() => expect(h.dailyCalls).toHaveLength(1));

    const [, , , options] = h.dailyCalls[0] as [unknown, unknown, unknown, Record<string, unknown>];
    expect(options).not.toHaveProperty('weekIngredientDiversity');
  }, 30_000);

  it('locking persists the generation-time preference into plan_payload', async () => {
    await renderTab();
    selectVariety('Traditional variety');
    await clickWeekly();

    // Draft review is available before locking (real draft banner is rendered).
    expect(screen.getByText(/not yet saved/i)).toBeInTheDocument();

    // Real UX: "Lock Plan" opens the confirmation dialog, the confirm action
    // is what actually persists.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Lock Plan/i }));
    });
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Confirm lock/i }));
    });
    await waitFor(() => expect(h.lockedPayloads).toHaveLength(1));

    // Real buildLockedPlanPayload output — not a UI-only label.
    expect(h.lockedPayloads[0].mealVariety).toBe('traditional');
    expect(h.lockedPayloads[0].weeklyPlan).toBeTruthy();
  }, 30_000);
});
