/**
 * CoachDecisionPanel — rendering/interaction tests (Phase 13C)
 *
 * Verifies the decision actions exposed per review status, that the correct
 * action / final target is submitted, that review states never offer an
 * adjustment acceptance flow, and that a recorded decision renders a success
 * state (never implying a prescription change).
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CoachDecisionPanel } from './CoachDecisionPanel';
import type { ClientReview, ClientReviewStatus } from '@/domain/review/reviewModel';
import type { AdaptationDecision } from '@/domain/nutrition/adaptation';
import type { Client } from '@/types';
import type { ReviewPrescriptionInfo } from './reviewView';
import type { CoachingDecision } from '@/domain/coaching/coachingDecision';
import type { CreateCoachingDecisionInput } from '@/services/review/coachingDecisionService';

const CLIENT: Client = {
  id: 'client-13c',
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

function makeReview(status: ClientReviewStatus, decision: AdaptationDecision): ClientReview {
  return {
    clientId: CLIENT.id,
    status,
    adaptationDecision: decision,
    currentTargetCalories: 2200,
    proposedTargetCalories:
      status === 'adjustment_recommended' ? decision.futureTargetCalories : null,
    observedWeeklyRateKg: decision.observedWeeklyRateKg,
    targetWeeklyRateKg: decision.targetWeeklyRateKg,
    adherenceScore: 90,
    summary: 'summary',
  };
}

const IDLE_RECORDING = { isSaving: false, error: null, recorded: null };

function adjustmentReview(): ClientReview {
  return makeReview(
    'adjustment_recommended',
    makeDecision('adherent_unexpected', {
      adherent: true,
      calorieAdjustmentKcal: -150,
      futureTargetCalories: 2000,
    }),
  );
}

function lastCall(cb: ReturnType<typeof vi.fn>): CreateCoachingDecisionInput {
  return cb.mock.calls[cb.mock.calls.length - 1][0] as CreateCoachingDecisionInput;
}

describe('CoachDecisionPanel — actions per status', () => {
  it('exposes Accept / Modify / Keep current / Defer for an adjustment recommendation', () => {
    render(
      <CoachDecisionPanel
        client={CLIENT}
        review={adjustmentReview()}
        prescription={PRESCRIPTION}
        recording={IDLE_RECORDING}
        onRecord={() => {}}
      />,
    );
    expect(screen.getByText('Accept recommendation')).toBeInTheDocument();
    expect(screen.getByText('Modify')).toBeInTheDocument();
    expect(screen.getByText('Keep current')).toBeInTheDocument();
    expect(screen.getByText('Defer')).toBeInTheDocument();
  });

  it('exposes Maintain + Defer for a maintain recommendation (no accept)', () => {
    render(
      <CoachDecisionPanel
        client={CLIENT}
        review={makeReview('maintain', makeDecision('adherent_expected'))}
        prescription={PRESCRIPTION}
        recording={IDLE_RECORDING}
        onRecord={() => {}}
      />,
    );
    expect(screen.getByText('Confirm maintain')).toBeInTheDocument();
    expect(screen.getByText('Defer')).toBeInTheDocument();
    expect(screen.queryByText('Accept recommendation')).toBeNull();
    expect(screen.queryByText('Modify')).toBeNull();
  });

  it('does NOT expose an adjustment acceptance flow for review-required / insufficient-data', () => {
    const statuses: Array<'review_required' | 'insufficient_data'> = [
      'review_required',
      'insufficient_data',
    ];
    for (const status of statuses) {
      const review = makeReview(status, makeDecision('non_adherent_unexpected'));
      const { unmount } = render(
        <CoachDecisionPanel
          client={CLIENT}
          review={review}
          prescription={PRESCRIPTION}
          recording={IDLE_RECORDING}
          onRecord={() => {}}
        />,
      );
      expect(screen.queryByText('Accept recommendation')).toBeNull();
      expect(screen.queryByText('Modify')).toBeNull();
      // Only a deferral is offered.
      expect(screen.getByText('Defer')).toBeInTheDocument();
      unmount();
    }
  });
});

describe('CoachDecisionPanel — interaction submits the correct action', () => {
  it('Accept persists action=accepted with the proposed final target', () => {
    const onRecord = vi.fn();
    render(
      <CoachDecisionPanel
        client={CLIENT}
        review={adjustmentReview()}
        prescription={PRESCRIPTION}
        recording={IDLE_RECORDING}
        onRecord={onRecord}
      />,
    );
    fireEvent.click(screen.getByText('Accept recommendation'));
    const sent = lastCall(onRecord);
    expect(sent.coachAction).toBe('accepted');
    expect(sent.finalTargetCalories).toBe(2000);
    expect(sent.recommendedTargetCalories).toBe(2000);
  });

  it('Modify captures the coach-entered target independently of the recommendation', () => {
    const onRecord = vi.fn();
    render(
      <CoachDecisionPanel
        client={CLIENT}
        review={adjustmentReview()}
        prescription={PRESCRIPTION}
        recording={IDLE_RECORDING}
        onRecord={onRecord}
      />,
    );
    fireEvent.click(screen.getByText('Modify'));
    const inputEl = screen.getByLabelText('Your target (kcal/day)') as HTMLInputElement;
    fireEvent.change(inputEl, { target: { value: '2050' } });
    fireEvent.click(screen.getByText('Save modified decision'));
    const sent = lastCall(onRecord);
    expect(sent.coachAction).toBe('modified');
    expect(sent.finalTargetCalories).toBe(2050);
    expect(sent.recommendedTargetCalories).toBe(2000); // recommendation untouched
  });

  it('Keep current records maintained with no final target', () => {
    const onRecord = vi.fn();
    render(
      <CoachDecisionPanel
        client={CLIENT}
        review={adjustmentReview()}
        prescription={PRESCRIPTION}
        recording={IDLE_RECORDING}
        onRecord={onRecord}
      />,
    );
    fireEvent.click(screen.getByText('Keep current'));
    const sent = lastCall(onRecord);
    expect(sent.coachAction).toBe('maintained');
    expect(sent.finalTargetCalories).toBeNull();
  });

  it('Defer records deferred with no final target', () => {
    const onRecord = vi.fn();
    render(
      <CoachDecisionPanel
        client={CLIENT}
        review={adjustmentReview()}
        prescription={PRESCRIPTION}
        recording={IDLE_RECORDING}
        onRecord={onRecord}
      />,
    );
    fireEvent.click(screen.getByText('Defer'));
    const sent = lastCall(onRecord);
    expect(sent.coachAction).toBe('deferred');
    expect(sent.finalTargetCalories).toBeNull();
  });
});

describe('CoachDecisionPanel — save state', () => {
  it('disables actions while saving', () => {
    render(
      <CoachDecisionPanel
        client={CLIENT}
        review={adjustmentReview()}
        prescription={PRESCRIPTION}
        recording={{ isSaving: true, error: null, recorded: null }}
        onRecord={() => {}}
      />,
    );
    expect(screen.getByText('Accept recommendation').closest('button')).toBeDisabled();
    expect(screen.getByText('Recording decision…')).toBeInTheDocument();
  });

  it('shows a success state with the recorded decision instead of actions when a decision exists', () => {
    const recorded: CoachingDecision = {
      id: 'd-1',
      coachId: 'coach-1',
      createdAt: '2026-09-15T09:00:00Z',
      clientId: CLIENT.id,
      decisionDate: '2026-09-15',
      recommendationStatus: 'adjustment_recommended',
      coachAction: 'modified',
      baselinePrescriptionVersionId: 'ver-1',
      observedWeeklyRateKg: -0.5,
      targetWeeklyRateKg: -0.5,
      adherenceScore: 90,
      recommendedCalorieAdjustment: -150,
      recommendedTargetCalories: 2000,
      finalTargetCalories: 2050,
      coachNote: null,
    };
    render(
      <CoachDecisionPanel
        client={CLIENT}
        review={adjustmentReview()}
        prescription={PRESCRIPTION}
        recording={{ isSaving: false, error: null, recorded }}
        onRecord={() => {}}
      />,
    );
    expect(screen.getByText('Decision recorded')).toBeInTheDocument();
    expect(screen.getByText('Final target: 2,050 kcal/day')).toBeInTheDocument();
    // No action buttons are offered after recording.
    expect(screen.queryByText('Accept recommendation')).toBeNull();
    // It never claims a prescription change.
    expect(screen.queryByText('Prescription updated')).toBeNull();
  });
});