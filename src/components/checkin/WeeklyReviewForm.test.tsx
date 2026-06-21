/**
 * Smoke tests for WeeklyReviewForm.
 *
 * Goal: lock in the visible surface (key labels, submit button, loading
 * state) so accidental prop or copy regressions are caught. Does NOT
 * exercise form submission end-to-end — that requires the real
 * weeklyReviewService + Supabase. The service layer has its own tests
 * at src/__tests__/checkin/weeklyReviewService.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import WeeklyReviewForm from './WeeklyReviewForm';

// Mock the service module — the real one would hit Supabase.
vi.mock('@/services/checkin/weeklyReviewService', () => ({
  submitWeeklyReview: vi.fn().mockResolvedValue({ review: null, error: null }),
  getCurrentWeekReview: vi.fn().mockResolvedValue({ review: null, error: null }),
}));

// Mock toast — the hook depends on toast context that's hard to provide here.
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

describe('WeeklyReviewForm (smoke)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing for a fresh client', async () => {
    render(<WeeklyReviewForm clientId="client-1" userId="user-1" />);
    // Wait for the loading effect to finish so we don't race the initial null state.
    await waitFor(() => {
      // After loading, the form shows the heading area + the submit button.
      expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument();
    });
  });

  it('shows key input labels', async () => {
    render(<WeeklyReviewForm clientId="client-1" userId="user-1" />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument();
    });
    // User-visible copy. The component uses un-bound <Label> + <Input>
    // pairs (no htmlFor), so we assert on text content rather than
    // getByLabelText — same regression-detection power, no false fail.
    expect(screen.getByText(/bodyweight/i)).toBeInTheDocument();
    expect(screen.getByText(/adherence/i)).toBeInTheDocument();
  });
});
