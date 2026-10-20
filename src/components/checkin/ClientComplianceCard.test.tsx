/**
 * ClientComplianceCard — coach-facing per-client compliance card.
 *
 * P0-2: a client with no evidence must render "—", never "0%".
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ClientComplianceCard from './ClientComplianceCard';

const baseProps = {
  clientId: 'client-1',
  clientName: 'Jane Doe',
  complianceSource: 'none' as const,
  checkinDays: 0,
  expectedDays: 7,
  currentStreak: 0,
  longestStreak: 0,
  lastCheckinDate: null,
  adherenceTrend: 'insufficient_data' as const,
};

describe('ClientComplianceCard', () => {
  it('renders an em dash (not 0%) when there is no evidence', () => {
    render(<ClientComplianceCard {...baseProps} complianceScore={null} />);

    expect(screen.queryByText('0%')).not.toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(
      screen.getByText(/no check-in data for the last 7 days/i),
    ).toBeInTheDocument();
  });

  it('renders the real score and coverage when evidence exists', () => {
    render(
      <ClientComplianceCard
        {...baseProps}
        complianceScore={82}
        complianceSource="daily_checkin"
        checkinDays={5}
        adherenceTrend="improving"
      />,
    );

    expect(screen.getByText('82%')).toBeInTheDocument();
    expect(screen.getByText(/improving · 5\/7 days checked in/i)).toBeInTheDocument();
  });

  it('labels a missing-evidence trend as not enough data', () => {
    render(<ClientComplianceCard {...baseProps} complianceScore={null} />);
    expect(screen.queryByText(/not enough data/i)).not.toBeInTheDocument();
  });
});
