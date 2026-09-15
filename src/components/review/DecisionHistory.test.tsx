/**
 * DecisionHistory — rendering tests (Phase 13D)
 *
 * Verifies the read-only history presentation: populated entries newest-first,
 * multiple decisions in chronological order, empty state, loading state, error
 * state, final target / note / recommendation rendered ONLY when persisted, no
 * invented values, and no write/plan controls.
 */

import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { DecisionHistory } from './DecisionHistory';
import type { CoachingDecision } from '@/domain/coaching/coachingDecision';

function decision(overrides: Partial<CoachingDecision> = {}): CoachingDecision {
  return {
    id: 'd-1',
    coachId: 'coach-1',
    createdAt: '2026-09-15T09:00:00Z',
    clientId: 'client-13d',
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
    coachNote: 'Reduced the adjustment because adherence was improving.',
    ...overrides,
  };
}

const READY = {
  status: 'ready' as const,
  decisions: [] as CoachingDecision[],
  error: null,
};

describe('DecisionHistory — states', () => {
  it('renders the section heading', () => {
    render(<DecisionHistory {...READY} />);
    expect(screen.getByText('Decision History')).toBeInTheDocument();
  });

  it('renders the empty state when no decisions are persisted', () => {
    render(<DecisionHistory {...READY} />);
    expect(screen.getByText('No coaching decisions recorded yet.')).toBeInTheDocument();
  });

  it('renders the loading state', () => {
    const { container } = render(
      <DecisionHistory status="loading" decisions={[]} error={null} />,
    );
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.getByLabelText('Loading decision history')).toBeInTheDocument();
  });

  it('renders the error state and no fabricated history', () => {
    render(<DecisionHistory status="error" decisions={[]} error="network down" />);
    expect(screen.getByText(/Unable to load the decision history/)).toBeInTheDocument();
    expect(screen.getByText(/network down/)).toBeInTheDocument();
    expect(screen.queryByText('No coaching decisions recorded yet.')).toBeNull();
  });
});

describe('DecisionHistory — populated rendering', () => {
  it('renders a decision with date, status, system recommendation, action, target and note', () => {
    render(<DecisionHistory {...READY} decisions={[decision()]} />);

    const entry = screen.getByText('2026-09-15').closest('div.rounded-md') as HTMLElement;
    const scope = within(entry);
    expect(scope.getByText('Adjustment recommended')).toBeInTheDocument();
    expect(scope.getByText(/-150 kcal\/day adjustment/)).toBeInTheDocument();
    expect(scope.getByText(/2,000 kcal\/day/)).toBeInTheDocument();
    expect(entry.textContent).toContain('Modify');
    expect(scope.getByText(/2,050 kcal\/day/)).toBeInTheDocument();
    expect(
      scope.getByText(/Reduced the adjustment because adherence was improving./),
    ).toBeInTheDocument();
  });

  it('renders multiple decisions newest-first (persisted order preserved)', () => {
    render(
      <DecisionHistory
        {...READY}
        decisions={[
          decision({ id: 'd-new', decisionDate: '2026-09-15', coachAction: 'accepted', finalTargetCalories: 2000, coachNote: null }),
          decision({ id: 'd-mid', decisionDate: '2026-09-08', recommendationStatus: 'maintain', coachAction: 'maintained', recommendedCalorieAdjustment: null, recommendedTargetCalories: null, finalTargetCalories: null, coachNote: null }),
          decision({ id: 'd-old', decisionDate: '2026-09-01', recommendationStatus: 'insufficient_data', coachAction: 'deferred', recommendedCalorieAdjustment: null, recommendedTargetCalories: null, finalTargetCalories: null, coachNote: null }),
        ]}
      />,
    );

    const dates = screen.getAllByText(/^\d{4}-\d{2}-\d{2}$/).map((el) => el.textContent);
    expect(dates).toEqual(['2026-09-15', '2026-09-08', '2026-09-01']);

    // Historical coach actions are shown as facts, never as prescription writes.
    const historyText = document.body.textContent ?? '';
    expect(historyText).toContain('Keep current');
    expect(historyText).toContain('Defer');
  });

  it('does not invent a recommendation for a maintain entry without persisted values', () => {
    render(
      <DecisionHistory
        {...READY}
        decisions={[
          decision({
            recommendationStatus: 'maintain',
            coachAction: 'maintained',
            recommendedCalorieAdjustment: null,
            recommendedTargetCalories: null,
            finalTargetCalories: null,
            coachNote: null,
          }),
        ]}
      />,
    );
    const entry = screen.getByText('2026-09-15').closest('div.rounded-md') as HTMLElement;
    expect(entry.textContent).toContain('Maintain');
    expect(entry.textContent).not.toContain('kcal/day adjustment');
  });

  it('shows the final target only when persisted', () => {
    render(
      <DecisionHistory
        {...READY}
        decisions={[decision({ coachAction: 'deferred', finalTargetCalories: null })]}
      />,
    );
    expect(screen.queryByText(/2,050 kcal\/day/)).toBeNull();
  });

  it('does not invent a note when none was persisted', () => {
    render(<DecisionHistory {...READY} decisions={[decision({ coachNote: null })]} />);
    expect(screen.queryByText(/^Note:/)).toBeNull();
  });

  it('provides no write or plan controls (informational history only)', () => {
    render(<DecisionHistory {...READY} decisions={[decision()]} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
