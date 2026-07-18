/**
 * Smoke tests for ClientCheckinDashboard.
 *
 * Locks in the visible surface (error state, loading state) so
 * accidental prop or copy regressions are caught.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ClientCheckinDashboard from './ClientCheckinDashboard';

vi.mock('@/services/checkin/dailyCheckinService', () => ({
  getCheckinHistory: vi.fn().mockResolvedValue({ checkins: [], error: null }),
}));

vi.mock('@/services/checkin/streakService', () => ({
  getStreak: vi.fn().mockResolvedValue({ streak: null, error: null }),
}));

vi.mock('@/services/checkin/weeklyReviewService', () => ({
  getReviewHistory: vi.fn().mockResolvedValue({ reviews: [], error: null }),
}));

describe('ClientCheckinDashboard (smoke)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows error state when getCheckinHistory and getStreak reject (network failure)', async () => {
    const dailyCheckinModule = await import('@/services/checkin/dailyCheckinService');
    const streakModule = await import('@/services/checkin/streakService');
    const weeklyReviewModule = await import('@/services/checkin/weeklyReviewService');

    vi.mocked(dailyCheckinModule.getCheckinHistory).mockRejectedValueOnce(new Error('Network error'));
    vi.mocked(streakModule.getStreak).mockRejectedValueOnce(new Error('Network error'));
    vi.mocked(weeklyReviewModule.getReviewHistory).mockRejectedValueOnce(new Error('Network error'));

    render(<ClientCheckinDashboard clientId="client-1" />);

    await waitFor(() => {
      expect(screen.getByText(/error loading dashboard/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/network error/i)).toBeInTheDocument();
  });
});