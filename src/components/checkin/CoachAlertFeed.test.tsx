import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import CoachAlertFeed from '@/components/checkin/CoachAlertFeed';

vi.mock('@/services/checkin/alertService', () => ({
  getCoachAlerts: vi.fn().mockResolvedValue({
    alerts: [
      {
        id: '1',
        client_id: 'client-1',
        trainer_id: 'trainer-1',
        alert_type: 'system',
        severity: 'yellow',
        title: 'Follow-up: Test Client',
        message: 'Follow-up sent',
        metadata: {
          follow_up_type: 'follow_up_sent',
          whatsapp_status: 'sent',
        },
        read: false,
        dismissed: false,
        created_at: '2026-01-01T00:00:00Z',
      },
      {
        id: '2',
        client_id: 'client-2',
        trainer_id: 'trainer-1',
        alert_type: 'system',
        severity: 'yellow',
        title: 'Follow-up: WhatsApp not configured for Test Client',
        message: 'No message was sent',
        metadata: {
          follow_up_type: 'follow_up_not_configured',
          whatsapp_status: 'not_configured',
        },
        read: false,
        dismissed: false,
        created_at: '2026-01-01T00:00:00Z',
      },
      {
        id: '3',
        client_id: 'client-3',
        trainer_id: 'trainer-1',
        alert_type: 'system',
        severity: 'red',
        title: 'Follow-up: Test Client',
        message: 'Follow-up sent',
        metadata: {
          follow_up_type: 'follow_up_sent',
          whatsapp_status: 'failed',
        },
        read: false,
        dismissed: false,
        created_at: '2026-01-01T00:00:00Z',
      },
      {
        id: '4',
        client_id: 'client-4',
        trainer_id: 'trainer-1',
        alert_type: 'system',
        severity: 'yellow',
        title: 'Some other system alert',
        message: 'Some other message',
        metadata: {},
        read: false,
        dismissed: false,
        created_at: '2026-01-01T00:00:00Z',
      },
    ],
    error: null,
  }),
  markAlertRead: vi.fn(),
  dismissAlert: vi.fn(),
}));

describe('CoachAlertFeed follow-up status badges', () => {
  it('renders Sent badge for provider-accepted follow-up', async () => {
    render(<CoachAlertFeed trainerId="trainer-1" />);
    await screen.findByText('Sent (provider accepted)');
    expect(screen.getByText('Sent (provider accepted)')).toBeInTheDocument();
  });

  it('renders Not configured badge for unconfigured follow-up', async () => {
    render(<CoachAlertFeed trainerId="trainer-1" />);
    await screen.findByText('Follow-up: WhatsApp not configured for Test Client');
    expect(screen.getByText('Not configured')).toBeInTheDocument();
  });

  it('renders Failed badge for failed follow-up', async () => {
    render(<CoachAlertFeed trainerId="trainer-1" />);
    await screen.findByText('Follow-up: WhatsApp not configured for Test Client');
    expect(screen.getByText('Failed')).toBeInTheDocument();
  });

  it('renders no follow-up badge for ordinary system alert', async () => {
    render(<CoachAlertFeed trainerId="trainer-1" />);
    await screen.findByText('Some other system alert');
    const badges = screen.queryAllByText(/Sent \(provider accepted\)|Not configured|Failed/);
    expect(badges.length).toBe(3);
  });
});