/**
 * Smoke tests for DailyCheckinForm.
 *
 * Goal: lock in the visible surface (key labels, submit button) so
 * accidental prop or copy regressions are caught. Does NOT exercise
 * form submission end-to-end — that requires the real dailyCheckinService
 * + Supabase. The service layer has its own tests at
 * src/__tests__/checkin/dailyCheckinService.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import DailyCheckinForm from './DailyCheckinForm';

vi.mock('@/services/checkin/dailyCheckinService', () => ({
  submitDailyCheckin: vi.fn().mockResolvedValue({ checkin: null, error: null }),
  getTodayCheckin: vi.fn().mockResolvedValue({ checkin: null, error: null }),
}));

vi.mock('@/services/checkin/streakService', () => ({
  getStreak: vi.fn().mockResolvedValue({ streak: null, error: null }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

describe('DailyCheckinForm (smoke)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing for a fresh client', async () => {
    render(<DailyCheckinForm clientId="client-1" userId="user-1" />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument();
    });
  });

  it('shows key input labels', async () => {
    render(<DailyCheckinForm clientId="client-1" userId="user-1" />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument();
    });
    // User-visible copy. The component uses un-bound <Label> + <Input>
    // pairs (no htmlFor), so we assert on text content rather than
    // getByLabelText — same regression-detection power, no false fail.
    expect(screen.getByText(/meal adherence/i)).toBeInTheDocument();
    expect(screen.getByText(/sleep/i)).toBeInTheDocument();
  });
});
