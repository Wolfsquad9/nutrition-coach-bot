/**
 * Nutrition tab — generation/lock controls must be disabled while the
 * authoritative plan load is pending (secondary protection for the proven
 * draft-loss race: a draft generated during an in-flight load would be
 * clobbered by that load's older response).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, waitFor, screen } from '@testing-library/react';
import type { Client } from '@/types';
import type { ClientIngredientRestrictions } from '@/utils/ingredientSubstitution';

const h = vi.hoisted(() => {
  const deferreds: ((r: unknown) => void)[] = [];
  let deferredPending = 0;
  return {
    fetchCurrentPlan: () => {
      if (deferredPending > 0) {
        deferredPending -= 1;
        return new Promise((resolve) => deferreds.push(resolve));
      }
      return Promise.resolve({
        plan: null, planId: null, versionId: null, createdAt: null,
        snapshot: null, payloadHash: null, versionNumber: null, error: null,
      });
    },
    deferNext: () => { deferredPending += 1; },
    resolveNext: (r: unknown) => {
      const resolve = deferreds.shift();
      if (!resolve) throw new Error('resolveNext: no pending load');
      resolve(r);
    },
    reset: () => { deferreds.length = 0; deferredPending = 0; },
  };
});

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/services/supabasePlanService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/supabasePlanService')>();
  return {
    ...actual,
    fetchCurrentPlan: h.fetchCurrentPlan,
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
// Adaptive targeting does its own DB reads; irrelevant to this guard test.
vi.mock('@/hooks/useAdaptiveNutritionTarget', () => ({
  useAdaptiveNutritionTarget: () => ({
    status: 'ready',
    decision: null,
    baseline: null,
    futureMetrics: null,
    effectiveMetrics: null,
    effectiveWeeklyRateKg: null,
  }),
}));

import { NutritionTabContent } from './NutritionTabContent';

const restriction: ClientIngredientRestrictions = {
  clientId: 'client-1',
  clientName: 'Test Client',
  blockedIngredients: [],
  preferredIngredients: ['ing-1', 'ing-2', 'ing-3', 'ing-4', 'ing-5'],
  substitutionRules: {},
};

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
  allergies: [],
  dislikedFoods: [],
  medicalConditions: [],
  medications: [],
  injuries: [],
  hasRedFlags: false,
} as unknown as Client;

describe('NutritionTabContent — generation/lock disabled while the plan load is pending', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    h.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('disables the Weekly Plan and Lock controls while loading, re-enables them once settled', async () => {
    h.deferNext();
    render(
      <NutritionTabContent
        activeClientId="client-1"
        activeClient={client}
        clientRestrictions={[restriction]}
      />,
    );

    const weeklyButton = await screen.findByRole('button', { name: /^(Weekly Plan|Regenerate)$/i });
    // The authoritative plan load is pending → generation must not start.
    expect(weeklyButton).toBeDisabled();

    await act(async () => {
      h.resolveNext({
        plan: null, planId: null, versionId: null, createdAt: null,
        snapshot: null, payloadHash: null, versionNumber: null, error: null,
      });
    });

    // Load settled → the control is actionable again, and the settled empty
    // state is the legitimate application-level readiness signal.
    await waitFor(() => expect(weeklyButton).toBeEnabled());
    expect(await screen.findByText('No nutrition plan')).toBeInTheDocument();
  });
});