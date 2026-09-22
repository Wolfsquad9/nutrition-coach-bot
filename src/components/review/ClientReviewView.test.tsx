/**
 * Client Review view — rendering unit tests (Phase 13B).
 *
 * Verifies the read-only review View renders each authoritative review status
 * distinctly, never renders insufficient data / error as an adjustment or
 * maintain, forwards the proposed target verbatim from the model, and exposes
 * no write actions.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ClientReviewView } from './ClientReviewView';
import type { ClientReview, ClientReviewStatus } from '@/domain/review/reviewModel';
import type { AdaptationDecision } from '@/domain/nutrition/adaptation';
import type { Client, NutritionMetrics } from '@/types';
import type { ClientReviewView as ReviewView } from './reviewView';

// ============================================================================
// FIXTURES
// ============================================================================

const CLIENT: Client = {
  id: 'client-13b',
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'j@doe.com',
  phone: '',
  birthDate: '1995-06-15',
  age: 30,
  gender: 'male',
  height: 180,
  weight: 80,
  activityLevel: 'moderately_active',
  primaryGoal: 'fat_loss',
  targetWeight: 75,
  weeklyWeightChange: -0.5,
  trainingExperience: 'intermediate',
  trainingDaysPerWeek: 4,
  sessionDuration: 60,
  preferredTrainingStyle: 'hypertrophy',
  equipment: [],
  equipmentAvailable: [],
  dietType: 'omnivore',
  mealsPerDay: 3,
  intolerances: [],
  allergies: [],
  dislikedFoods: [],
  medicalConditions: [],
  medications: [],
  injuries: [],
  hasRedFlags: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-29T00:00:00.000Z',
};

const SUMMARY_BY_STATUS: Record<ClientReviewStatus, string> = {
  maintain: 'Maintain current prescription.',
  adjustment_recommended:
    'Adjustment recommended based on sufficient adherence and observed trend.',
  review_required:
    'Review adherence and client context before changing the prescription.',
  insufficient_data: 'More data is required before making an adaptation decision.',
};

const CURRENT_METRICS: NutritionMetrics = {
  tdee: 2600,
  bmr: 2000,
  targetCalories: 2200,
  proteinGrams: 150,
  carbsGrams: 200,
  fatGrams: 70,
  fiberGrams: 30,
  waterLiters: 3,
};

function makeDecision(
  outcome: AdaptationDecision['outcome'],
  overrides: Partial<AdaptationDecision> = {},
): AdaptationDecision {
  return {
    outcome,
    sufficientData: outcome !== 'insufficient_data',
    adherent: null,
    observedWeeklyRateKg: -0.5,
    observedWeeklyRatePercentBodyweight: -0.625,
    targetWeeklyRateKg: -0.5,
    targetWeeklyRatePercentBodyweight: -0.625,
    rateToleranceKgPerWeek: 0.125,
    calorieAdjustmentKcal: 0,
    futureWeeklyRateKg: -0.5,
    effectiveFutureWeeklyRateKg: -0.5,
    futureTargetCalories: 2200,
    lockedPlanUntouched: true,
    rationale: ['A deterministic rationale line.'],
    ...overrides,
  };
}

function makeReview(
  status: ClientReviewStatus,
  decision: AdaptationDecision,
): ClientReview {
  return {
    clientId: CLIENT.id,
    status,
    adaptationDecision: decision,
    currentTargetCalories: 2200,
    proposedTargetCalories:
      status === 'adjustment_recommended' ? decision.futureTargetCalories : null,
    observedWeeklyRateKg: decision.observedWeeklyRateKg,
    targetWeeklyRateKg: decision.targetWeeklyRateKg,
    adherenceScore: 92,
    summary: SUMMARY_BY_STATUS[status],
  };
}

function makeView(
  status: 'maintain' | 'adjustment_recommended' | 'review_required' | 'insufficient_data',
  decision: AdaptationDecision,
): ReviewView {
  return {
    status: 'ready',
    error: null,
    review: makeReview(status, decision),
    currentMetrics: CURRENT_METRICS,
    prescription: {
      hasActivePrescription: true,
      state: 'LOCKED',
      isLocked: true,
      daysRemaining: 5,
      versionNumber: 1,
      versionId: 'ver-1',
      lockEstablishedAt: '2026-01-01T00:00:00.000Z',
      source: 'locked_plan',
      weeklyRateKg: -0.5,
    },
    evidence: {
      checkinCount: 8,
      weeklyReviewCount: 1,
      weightObservationCount: 8,
      latestCheckinDate: '2026-01-28',
    },
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('ClientReviewView — rendering', () => {
  it('renders a maintain review with prescription, evidence, status and summary', () => {
    render(
      <ClientReviewView
        client={CLIENT}
        view={makeView('maintain', makeDecision('adherent_expected'))}
      />,
    );

    expect(screen.getAllByText('Maintain').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Maintain current prescription.').length).toBeGreaterThan(0);
    expect(screen.getByText('2,200 kcal/day')).toBeInTheDocument(); // prescription calories
    expect(screen.getByText('Current Prescription')).toBeInTheDocument();
    expect(screen.getByText('What Happened')).toBeInTheDocument();
    expect(screen.getAllByText('A deterministic rationale line.').length).toBeGreaterThan(0);
    // No adjustment is proposed.
    expect(screen.queryByText('Adjustment recommended')).toBeNull();
  });

  it('renders an adjustment recommendation with the proposed target verbatim', () => {
    const decision = makeDecision('adherent_unexpected', {
      adherent: true,
      calorieAdjustmentKcal: -150,
      futureTargetCalories: 2000,
    });
    render(
      <ClientReviewView
        client={CLIENT}
        view={makeView('adjustment_recommended', decision)}
      />,
    );

    expect(screen.getAllByText('Adjustment recommended').length).toBeGreaterThan(0);
    // Proposed target forwarded directly from the model (never recomputed).
    expect(screen.getByText('2,000 kcal/day')).toBeInTheDocument();
    expect(screen.getByText('-150 kcal/day')).toBeInTheDocument();
  });

  it('renders insufficient data distinctly and never as an adjustment', () => {
    render(
      <ClientReviewView
        client={CLIENT}
        view={makeView(
          'insufficient_data',
          makeDecision('insufficient_data', { adherent: null }),
        )}
      />,
    );

    expect(screen.getAllByText('Insufficient data').length).toBeGreaterThan(0);
    expect(screen.queryByText('Adjustment recommended')).toBeNull();
    expect(screen.queryByText('Maintain')).toBeNull();
  });

  it('renders a review-required state distinctly (coach attention)', () => {
    render(
      <ClientReviewView
        client={CLIENT}
        view={makeView(
          'review_required',
          makeDecision('non_adherent_unexpected', { adherent: false }),
        )}
      />,
    );

    expect(screen.getAllByText('Review required').length).toBeGreaterThan(0);
    expect(screen.queryByText('Adjustment recommended')).toBeNull();
    // No invented proposed target on a non-adherent review.
    expect(screen.queryByText('2,000 kcal/day')).toBeNull();
  });
});

describe('ClientReviewView — error & read-only guarantees', () => {
  it('renders an explicit error and never a valid decision', () => {
    render(
      <ClientReviewView
        client={CLIENT}
        view={{ status: 'error', error: 'boom', review: null, currentMetrics: null, prescription: null, evidence: null }}
      />,
    );

    expect(screen.getByText(/Unable to load this review/)).toBeInTheDocument();
    expect(screen.getByText('boom')).toBeInTheDocument();
    expect(screen.queryByText('Maintain')).toBeNull();
    expect(screen.queryByText('Adjustment recommended')).toBeNull();
  });

  it('exposes no write actions when the decision panel is not wired (read-only fallback)', () => {
    render(
      <ClientReviewView
        client={CLIENT}
        view={makeView('maintain', makeDecision('adherent_expected'))}
      />,
    );

    // Without the recording props the view stays a pure read-only review — no
    // buttons at all.
    expect(document.querySelectorAll('button')).toHaveLength(0);
  });
});

describe('ClientReviewView — wired coach decision actions', () => {
  it('renders the decision panel with adjustment actions when wired', () => {
    render(
      <ClientReviewView
        client={CLIENT}
        view={makeView(
          'adjustment_recommended',
          makeDecision('adherent_unexpected', {
            adherent: true,
            calorieAdjustmentKcal: -150,
            futureTargetCalories: 2000,
          }),
        )}
        recording={{ isSaving: false, error: null, recorded: null }}
        onRecord={() => {}}
      />,
    );

    expect(screen.getByText('Coach Decision')).toBeInTheDocument();
    expect(screen.getByText('Accept recommendation')).toBeInTheDocument();
    expect(screen.getByText('Modify')).toBeInTheDocument();
    expect(screen.getByText('Keep current')).toBeInTheDocument();
    expect(screen.getByText('Defer')).toBeInTheDocument();
  });

  it('does not render the decision panel at all unless wired', () => {
    render(
      <ClientReviewView
        client={CLIENT}
        view={makeView('maintain', makeDecision('adherent_expected'))}
      />,
    );
    expect(screen.queryByText('Coach Decision')).toBeNull();
  });
});