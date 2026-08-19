import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ClientMyPlanPage from './ClientMyPlanPage';
import type { PlanPayload } from '@/services/supabasePlanService';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ clientId: 'client-1', isAuthenticated: true, isLoading: false }),
}));

vi.mock('@/services/supabasePlanService', () => ({
  fetchCurrentPlan: vi.fn(),
}));

vi.mock('@/components/WeeklyMealPlanDisplay', () => ({
  WeeklyMealPlanDisplay: () => <div data-testid="weekly-meal-plan" />,
}));

import { fetchCurrentPlan } from '@/services/supabasePlanService';

const mockFetchPlan = vi.mocked(fetchCurrentPlan);

beforeEach(() => {
  vi.clearAllMocks();
  const plan: PlanPayload = {
    type: 'nutrition',
    generatedAt: '2026-01-01T00:00:00.000Z',
    macroTargets: { calories: 2100, protein: 150, carbs: 200, fat: 60 },
    weeklyPlan: {
      days: [],
      weeklyTotalMacros: { calories: 2100, protein: 150, carbs: 200, fat: 60 },
      weeklyTargetMacros: { calories: 2100, protein: 150, carbs: 200, fat: 60 },
      weeklyVariance: { calories: 0, protein: 0, carbs: 0, fat: 0 },
    },
    likedIngredients: [],
  };
  mockFetchPlan.mockResolvedValue({
    plan,
    planId: 'plan-1',
    versionId: null,
    createdAt: null,
    snapshot: null,
    payloadHash: null,
    versionNumber: null,
    error: null,
  });
});

describe('ClientMyPlanPage (nutrition-only My Plan — no duplicate training plan)', () => {
  it('renders the nutrition plan and NEVER any training-plan presentation', async () => {
    // NOTE: fetchActiveTrainingPlan / TrainingPlanDisplay are deliberately not
    // mocked/imported. If ClientMyPlanPage still loaded or rendered the training
    // plan, this page would fail to resolve it or would render its labels.
    render(<ClientMyPlanPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /My Plan/i })).toBeInTheDocument();
    });
    expect(screen.getByTestId('weekly-meal-plan')).toBeInTheDocument();
    expect(screen.getByText(/Daily Nutrition Targets/i)).toBeInTheDocument();

    // The obsolete "Plan d'entraînement" must not appear on the My Plan page.
    expect(screen.queryByText(/Plan d[''\u2019]Entra/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Training Plan/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Barbell Bench Press/i)).not.toBeInTheDocument();
  });
});