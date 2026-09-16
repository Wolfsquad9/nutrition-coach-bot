/**
 * Coach Decision workflow tests (Phase 13F)
 *
 * Verifies the completion workflow on the decision panel: only a successfully
 * persisted decision (in-session) or a decision hydrated from persistence
 * (hard refresh) puts the panel in its recorded state; a failed save leaves
 * the decision outstanding with retry controls; controls are disabled while
 * the persisted state is being checked (duplicate-submission protection).
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CoachDecisionPanel, type CoachingDecisionRecordProps } from './CoachDecisionPanel';
import type { ClientReview, ClientReviewStatus } from '@/domain/review/reviewModel';
import type { AdaptationDecision } from '@/domain/nutrition/adaptation';
import type { Client } from '@/types';
import type { ReviewPrescriptionInfo } from './reviewView';
import type { CoachingDecision } from '@/domain/coaching/coachingDecision';
import type { CreateCoachingDecisionInput } from '@/services/review/coachingDecisionService';

// ============================================================================
// FIXTURES (matching the Phase 13C test conventions)
// ============================================================================

const CLIENT: Client = {
  id: 'client-13f',
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

const PRESCRIPTION: ReviewPrescriptionInfo = {
  hasActivePrescription: true,
  state: 'LOCKED',
  isLocked: true,
  daysRemaining: 5,
  versionNumber: 1,
  versionId: 'ver-1',
  lockEstablishedAt: '2026-01-01T00:00:00.000Z',
  source: 'locked_plan',
  weeklyRateKg: -0.5,
};

function makeDecision(): AdaptationDecision {
  return {
    outcome: 'adherent_unexpected',
    sufficientData: true,
    adherent: true,
    observedWeeklyRateKg: -0.5,
    observedWeeklyRatePercentBodyweight: -0.625,
    targetWeeklyRateKg: -0.5,
    targetWeeklyRatePercentBodyweight: -0.625,
    rateToleranceKgPerWeek: 0.125,
    calorieAdjustmentKcal: -150,
    futureWeeklyRateKg: -0.5,
    effectiveFutureWeeklyRateKg: -0.5,
    futureTargetCalories: 2000,
    lockedPlanUntouched: true,
    rationale: ['A deterministic rationale line.'],
  };
}

function makeReview(status: ClientReviewStatus = 'adjustment_recommended'): ClientReview {
  return {
    clientId: CLIENT.id,
    status,
    adaptationDecision: makeDecision(),
    currentTargetCalories: 2200,
    proposedTargetCalories: status === 'adjustment_recommended' ? 2000 : null,
    observedWeeklyRateKg: -0.5,
    targetWeeklyRateKg: -0.5,
    adherenceScore: 92,
    summary: 'Adjustment recommended based on sufficient adherence and observed trend.',
  };
}

function recordedDecision(overrides: Partial<CoachingDecision> = {}): CoachingDecision {
  return {
    id: 'd-today',
    coachId: 'coach-1',
    createdAt: '2026-09-16T09:00:00Z',
    clientId: 'client-13f',
    decisionDate: '2026-09-16',
    recommendationStatus: 'adjustment_recommended',
    coachAction: 'modified',
    baselinePrescriptionVersionId: 'ver-1',
    observedWeeklyRateKg: -0.5,
    targetWeeklyRateKg: -0.5,
    adherenceScore: 90,
    recommendedCalorieAdjustment: -150,
    recommendedTargetCalories: 2000,
    finalTargetCalories: 2050,
    coachNote: 'Reduced the adjustment because adherence was improving.',
    ...overrides,
  };
}

const UNRESOLVED: CoachingDecisionRecordProps = {
  isSaving: false,
  error: null,
  recorded: null,
};

function renderPanel(
  recording: CoachingDecisionRecordProps,
  extra: { persistedRecorded?: CoachingDecision | null; isCheckingRecorded?: boolean } = {},
  onRecord: (input: CreateCoachingDecisionInput) => void = vi.fn(),
) {
  return render(
    <CoachDecisionPanel
      client={CLIENT}
      review={makeReview()}
      prescription={PRESCRIPTION}
      recording={recording}
      onRecord={onRecord}
      {...extra}
    />,
  );
}

// ============================================================================
// TESTS
// ============================================================================

describe('CoachDecisionPanel — Phase 13F workflow states', () => {
  it('shows decision controls in the unresolved state', () => {
    renderPanel(UNRESOLVED);
    expect(screen.getByRole('button', { name: /Accept recommendation/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Modify/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Defer/ })).toBeEnabled();
    expect(screen.queryByText('Decision recorded')).toBeNull();
  });

  it('shows the recorded state from the PERSISTED decision (hard-refresh reconstruction)', () => {
    renderPanel(UNRESOLVED, { persistedRecorded: recordedDecision() });
    expect(screen.getByText('Decision recorded')).toBeInTheDocument();
    expect(screen.getByText(/Modify/)).toBeInTheDocument();
    expect(screen.getByText(/2,050 kcal\/day/)).toBeInTheDocument();
    expect(screen.getByText(/Recorded on 2026-09-16/)).toBeInTheDocument();
    // No action controls remain once the decision is recorded.
    expect(screen.queryByRole('button', { name: /Accept recommendation/ })).toBeNull();
  });

  it('the in-session successful recording takes precedence over the hydrated state', () => {
    renderPanel(
      {
        isSaving: false,
        error: null,
        recorded: recordedDecision({
          id: 'd-fresh',
          coachAction: 'deferred',
          finalTargetCalories: null,
        }),
      },
      { persistedRecorded: recordedDecision() },
    );
    // Fresh recording is a deferral (no final target).
    expect(screen.getByText(/Defer/)).toBeInTheDocument();
    expect(screen.queryByText(/2,050 kcal\/day/)).toBeNull();
  });

  it('a FAILED save never shows the recorded state and preserves retry capability', () => {
    renderPanel({ isSaving: false, error: 'database write failed', recorded: null });
    expect(screen.queryByText('Decision recorded')).toBeNull();
    expect(screen.getByText(/database write failed/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Accept recommendation/ })).toBeEnabled();
    expect(screen.getByText(/You can retry below/)).toBeInTheDocument();
  });

  it('disables the decision controls while the persisted state is being checked', () => {
    renderPanel(UNRESOLVED, { isCheckingRecorded: true });
    expect(screen.getByRole('button', { name: /Accept recommendation/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Modify/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Keep current/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Defer/ })).toBeDisabled();
  });

  it('each action submits through the existing Phase 13C write path only', () => {
    const onRecord = vi.fn();
    renderPanel(UNRESOLVED, {}, onRecord);

    fireEvent.click(screen.getByRole('button', { name: /Accept recommendation/ }));
    expect(onRecord).toHaveBeenCalledTimes(1);
    expect(onRecord.mock.calls[0][0].coachAction).toBe('accepted');
    expect(onRecord.mock.calls[0][0].finalTargetCalories).toBe(2000);

    fireEvent.click(screen.getByRole('button', { name: /Keep current/ }));
    expect(onRecord.mock.calls[1][0].coachAction).toBe('maintained');
    expect(onRecord.mock.calls[1][0].finalTargetCalories).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Defer/ }));
    expect(onRecord.mock.calls[2][0].coachAction).toBe('deferred');
    expect(onRecord.mock.calls[2][0].finalTargetCalories).toBeNull();
  });
});

