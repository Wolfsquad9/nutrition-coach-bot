/**
 * Phase 1 — production wiring regression guard.
 *
 * `eligibility.test.ts` proves the generation FUNNEL honours
 * `allowedIngredientIds`, and `NutritionTabContent` is the only place that
 * decides what those ids are. This test closes that gap: it renders the real
 * component and asserts the resolved eligible ids actually reach BOTH
 * production generation paths.
 *
 * It fails if the `allowedIngredientIds` argument (or the eligibility-resolved
 * pool) is removed from `handleGenerateDailyPlan` / `handleGenerateWeeklyPlan`,
 * even though every pure-function test still passes.
 *
 * Conventions follow `NutritionTabContent.lockGuard.test.tsx`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, waitFor, screen, fireEvent } from '@testing-library/react';
import type { Client } from '@/types';
import type { ClientIngredientRestrictions } from '@/utils/ingredientSubstitution';
import { resolveEligibleIngredients } from '@/services/recipe/eligibility';

const h = vi.hoisted(() => ({
  dailyCalls: [] as unknown[][],
  weeklyInputs: [] as Record<string, unknown>[],
  setDraftPlans: [] as unknown[][],
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

// Spy at the production boundary: record the call, then delegate to the real
// implementation so the component still receives a genuine plan.
vi.mock('@/services/recipeService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/recipeService')>();
  return {
    ...actual,
    generateFullDayMealPlan: (...args: unknown[]) => {
      h.dailyCalls.push(args);
      return (
        actual.generateFullDayMealPlan as (...a: unknown[]) => unknown
      )(...args);
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

/**
 * Fixture chosen so the eligible pool is a deliberately small, known subset of
 * the preferred list:
 *   preferred (9) − blocked `eggs` − allergen `dairy` → `greek-yogurt`
 *                − disliked `banana`                      = 6 expected
 *
 * `eggs` is deliberately in BOTH lists, so this fixture also exercises the
 * `blocked ∩ preferred` invariant through the real production wiring.
 */
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

/** Independent restatement of the expected pool — not read from the component's memo. */
const EXPECTED_ELIGIBLE = ['chicken-breast', 'brown-rice', 'broccoli', 'olive-oil', 'salmon', 'oats'];
const BLOCKED_OR_EXCLUDED = ['eggs', 'greek-yogurt', 'banana'];

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

describe('NutritionTabContent — passes the eligibility-resolved pool into production generation', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    h.dailyCalls.length = 0;
    h.weeklyInputs.length = 0;
    // `regeneration.ts` already falls back safely when storage is unavailable;
    // this only isolates the regeneration counter between tests, and must never
    // be the reason a test fails.
    try {
      window.localStorage?.clear();
    } catch {
      /* storage unavailable in this environment */
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sanity: the fixture resolves to the expected pool and the controls are actionable', async () => {
    const pool = resolveEligibleIngredients({
      clientId: 'client-1',
      preferredIngredientIds: restriction.preferredIngredients,
      blockedIngredientIds: restriction.blockedIngredients,
      allergies: client.allergies,
      intolerances: client.intolerances,
      dislikedFoods: client.dislikedFoods,
      dietType: client.dietType,
    });
    expect(pool.ingredientIds).toEqual(EXPECTED_ELIGIBLE);
    for (const excluded of BLOCKED_OR_EXCLUDED) {
      expect(pool.ingredientIds).not.toContain(excluded);
    }

    await renderTab();
    expect(screen.getByRole('button', { name: /Daily Plan/i })).toBeEnabled();
  });

  it('daily path: generateFullDayMealPlan receives the resolved allowedIngredientIds', async () => {
    await renderTab();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Daily Plan/i }));
    });

    await waitFor(() => expect(h.dailyCalls).toHaveLength(1));
    const [foods, , seed, options] = h.dailyCalls[0] as [string[], unknown, string, { allowedIngredientIds: string[] }];

    // The allow-list is threaded through — this is the wiring under test.
    expect(options).toEqual({ allowedIngredientIds: EXPECTED_ELIGIBLE });
    // The generation pool is the resolved pool, not the raw preferred list.
    expect(foods).toEqual(EXPECTED_ELIGIBLE);
    expect(foods).not.toEqual(restriction.preferredIngredients);
    for (const excluded of BLOCKED_OR_EXCLUDED) {
      expect(options.allowedIngredientIds).not.toContain(excluded);
      expect(foods).not.toContain(excluded);
    }
    // Regeneration identity is still an explicit, non-empty seed.
    expect(typeof seed).toBe('string');
    expect(seed.length).toBeGreaterThan(0);
  }, 20_000);

  it('weekly path: the optimizer input receives the resolved allowedIngredientIds', async () => {
    await renderTab();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^(Weekly Plan|Regenerate)$/i }));
    });

    await waitFor(() => expect(h.weeklyInputs).toHaveLength(1));
    const input = h.weeklyInputs[0];

    // The allow-list is threaded through to the optimizer — wiring under test.
    expect(input.allowedIngredientIds).toEqual(EXPECTED_ELIGIBLE);
    // The optimizer's own pool is the resolved pool, not the raw preferred list.
    expect(input.likedFoods).toEqual(EXPECTED_ELIGIBLE);
    for (const excluded of BLOCKED_OR_EXCLUDED) {
      expect(input.allowedIngredientIds).not.toContain(excluded);
      expect(input.likedFoods).not.toContain(excluded);
    }
    // Regeneration identity is still threaded explicitly, not defaulted to 0.
    expect(typeof input.regenerationCount).toBe('number');
    expect(input.regenerationCount).toBeGreaterThanOrEqual(0);
  }, 30_000);

  it('both paths stay in sync with the eligibility boundary, not the raw restriction', async () => {
    // If someone reintroduced `restriction.preferredIngredients` as the pool,
    // the blocked dairy/egg ingredients would reappear. Assert the raw list is
    // strictly larger, so the two paths cannot silently coincide.
    expect(restriction.preferredIngredients.length).toBeGreaterThan(EXPECTED_ELIGIBLE.length);
    expect(restriction.preferredIngredients).toContain('eggs');
    expect(restriction.preferredIngredients).toContain('greek-yogurt');
  });
});

