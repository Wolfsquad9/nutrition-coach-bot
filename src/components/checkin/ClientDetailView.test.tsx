/**
 * Smoke tests for ClientDetailView — coach per-client view.
 *
 * P0-2: the canonical adherence metrics are displayed honestly — missing
 * evidence renders as "—", never as a fabricated zero.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { toComplianceScore } from '@/types/checkin';
import ClientDetailView from './ClientDetailView';

vi.mock('@/services/checkin/dailyCheckinService', () => ({
  getCheckinHistory: vi.fn().mockResolvedValue({ checkins: [], error: null }),
}));

vi.mock('@/services/checkin/streakService', () => ({
  getStreak: vi.fn().mockResolvedValue({ streak: null, error: null }),
}));

vi.mock('@/services/checkin/weeklyReviewService', () => ({
  getReviewHistory: vi.fn().mockResolvedValue({ reviews: [], error: null }),
  updateCoachNotes: vi.fn().mockResolvedValue({ error: null }),
}));

vi.mock('@/services/checkin/adherenceMetricsService', () => ({
  getAdherenceMetrics: vi.fn().mockResolvedValue({ metrics: null, error: null }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

describe('ClientDetailView — adherence metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders an em dash (never 0%) when there is no adherence evidence', async () => {
    render(<ClientDetailView clientId="client-1" />);

    await waitFor(() => {
      expect(screen.getByText('7-day Compliance')).toBeInTheDocument();
    });

    // The score card shows "—" when there is no evidence.
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
  });

  it('renders the real reported score and coverage when evidence exists', async () => {
    const { getAdherenceMetrics } = await import('@/services/checkin/adherenceMetricsService');
    vi.mocked(getAdherenceMetrics).mockResolvedValue({
      metrics: {
        score: toComplianceScore(82),
        sampleCount: 5,
        dailySampleCount: 3,
        weeklySampleCount: 2,
        checkinDays: 3,
        expectedDays: 7,
        coverage: 3 / 7,
        trend: 'insufficient_data',
        source: 'mixed',
        samples: [],
        dailySamples: [],
      },
      error: null,
    } as any);

    render(<ClientDetailView clientId="client-1" />);

    await waitFor(() => {
      expect(screen.getByText('82%')).toBeInTheDocument();
      expect(screen.getByText('3/7 days')).toBeInTheDocument();
    });
  });
});
