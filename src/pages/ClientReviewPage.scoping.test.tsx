/**
 * ClientReviewPage — active-client scoping of the local recording state
 * (regression): a decision recorded for client A must never be treated as the
 * current client's state after switching to client B; B must fall back to its
 * OWN persisted current decision.
 *
 * The page is thin, so the surrounding hooks/views are mocked and the props
 * handed to the review view are asserted directly.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import type { CoachingDecision } from '@/domain/coaching/coachingDecision';

const h = vi.hoisted(() => ({
  activeClientId: 'client-a' as string | null,
  currentDecision: null as unknown,
  recordingState: {
    isSaving: false,
    error: null,
    recorded: null,
    clientId: null,
  } as Record<string, unknown>,
  captured: null as Record<string, unknown> | null,
}));

vi.mock('@/hooks/useAppLayout', () => ({
  useAppLayout: () => ({
    activeClientId: h.activeClientId,
    activeClient: h.activeClientId
      ? { id: h.activeClientId, firstName: 'A', lastName: 'B' }
      : null,
  }),
}));
vi.mock('@/hooks/useClientReview', () => ({
  useClientReview: () => ({ status: 'loading' }),
}));
vi.mock('@/hooks/useCurrentCoachingDecision', () => ({
  useCurrentCoachingDecision: () => ({
    isLoading: false,
    error: null,
    currentDecision: h.currentDecision,
  }),
}));
vi.mock('@/hooks/useCoachingDecisionHistory', () => ({
  useCoachingDecisionHistory: () => ({ isLoading: false, error: null, decisions: [] }),
}));
// Only the hook is stubbed; the real scoping helper/idle state stay in play.
vi.mock('@/hooks/useCoachingDecision', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useCoachingDecision')>();
  return {
    ...actual,
    useCoachingDecision: () => ({
      ...h.recordingState,
      recordDecision: vi.fn(),
      resetDecision: vi.fn(),
    }),
  };
});
vi.mock('@/components/review/ClientReviewView', () => ({
  ClientReviewView: (props: { recording?: Record<string, unknown> }) => {
    h.captured = props.recording ?? null;
    return null;
  },
}));
vi.mock('react-router-dom', () => ({
  Link: ({ children }: { children?: unknown }) => children ?? null,
}));

// The REAL hook module is used for the scoping helper/idle state.
import ClientReviewPage from './ClientReviewPage';

const decisionFor = (clientId: string, id: string): CoachingDecision => ({
  id,
  clientId,
  coachId: 'coach-1',
  createdAt: '2026-09-15T00:00:00.000Z',
  recommendationStatus: 'adjustment_recommended',
  coachAction: 'accepted',
  baselinePrescriptionVersionId: null,
  observedWeeklyRateKg: null,
  targetWeeklyRateKg: null,
  adherenceScore: null,
  recommendedCalorieAdjustment: -150,
  recommendedTargetCalories: 2000,
  finalTargetCalories: 2000,
  coachNote: null,
  decisionDate: '2026-09-15',
});

describe('ClientReviewPage — recording state is scoped to the active client', () => {
  beforeEach(() => {
    h.activeClientId = 'client-a';
    h.currentDecision = null;
    h.recordingState = { isSaving: false, error: null, recorded: null, clientId: null };
    h.captured = null;
  });

  it('does not leak client A\u2019s recording into client B after a switch', () => {
    // Coach reviewed A and recorded a decision (page not unmounted).
    h.recordingState = {
      isSaving: false,
      error: null,
      recorded: decisionFor('client-a', 'd-a'),
      clientId: 'client-a',
    };
    const { rerender } = render(<ClientReviewPage />);
    expect((h.captured?.recorded as CoachingDecision).id).toBe('d-a');

    // Switch to client B — B's own persisted current decision is what renders.
    h.activeClientId = 'client-b';
    h.currentDecision = decisionFor('client-b', 'd-b');
    rerender(<ClientReviewPage />);

    expect((h.captured?.recorded as CoachingDecision).id).toBe('d-b');
  });

  it('shows B as unresolved (no leaked decision) when B has no persisted decision yet', () => {
    h.recordingState = {
      isSaving: false,
      error: null,
      recorded: decisionFor('client-a', 'd-a'),
      clientId: 'client-a',
    };
    const { rerender } = render(<ClientReviewPage />);

    h.activeClientId = 'client-b';
    h.currentDecision = null; // B has no decision for today yet
    rerender(<ClientReviewPage />);

    // A's recording must not appear; B is actionable.
    expect(h.captured?.recorded).toBeNull();
    expect(h.captured?.isSaving).toBe(false);
    expect(h.captured?.error).toBeNull();
  });

  it('keeps the same-client behavior intact when the client does not change', () => {
    h.recordingState = {
      isSaving: false,
      error: null,
      recorded: decisionFor('client-a', 'd-a'),
      clientId: 'client-a',
    };
    render(<ClientReviewPage />);
    expect((h.captured?.recorded as CoachingDecision).id).toBe('d-a');
  });

  it('does not leak an in-flight save or error from client A into client B', () => {
    h.recordingState = { isSaving: true, error: null, recorded: null, clientId: 'client-a' };
    const { rerender } = render(<ClientReviewPage />);
    expect(h.captured?.isSaving).toBe(true); // A's own state, preserved

    h.activeClientId = 'client-b';
    rerender(<ClientReviewPage />);
    expect(h.captured?.isSaving).toBe(false);

    h.recordingState = { isSaving: false, error: 'boom', recorded: null, clientId: 'client-a' };
    rerender(<ClientReviewPage />);
    expect(h.captured?.error).toBeNull();
  });
});