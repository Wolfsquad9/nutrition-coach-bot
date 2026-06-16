import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn() },
}));

import { supabase } from '@/integrations/supabase/client';
import { getCoachAlerts, markAlertRead, dismissAlert, getUnreadAlertCount, generateAlert } from '@/services/checkin/alertService';

const mockFrom = supabase.from as ReturnType<typeof vi.fn>;

/**
 * Creates a fully-chainable PostgrestResponse-like mock that resolves the
 * final Promise. Each chained method returns itself, and the whole thing
 * is thenable (supports await).
 */
function chainableMock<T>(resolved: { data: T; error: null } | { data: undefined; error: { message: string } }) {
  const promise = Promise.resolve(resolved);
  const chain: Record<string, unknown> = {
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    select: vi.fn(() => chain),
    update: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    single: vi.fn(() => promise),
    maybeSingle: vi.fn(() => promise),
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    finally: promise.finally.bind(promise),
  };
  return chain;
}

describe('alertService', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  describe('getCoachAlerts', () => {
    it('returns alerts for trainer', async () => {
      const mockAlerts = [{ id: 'a1', trainer_id: 't1', alert_type: 'missed_checkin', severity: 'red' }];
      mockFrom.mockReturnValue(chainableMock({ data: mockAlerts, error: null }));

      const result = await getCoachAlerts('t1');
      expect(result.alerts).toHaveLength(1);
      expect(result.alerts[0].id).toBe('a1');
    });
  });

  describe('markAlertRead', () => {
    it('marks alert as read', async () => {
      mockFrom.mockReturnValue(chainableMock({ data: undefined, error: null }));
      const result = await markAlertRead('a1');
      expect(result.success).toBe(true);
    });
  });

  describe('dismissAlert', () => {
    it('dismisses alert', async () => {
      mockFrom.mockReturnValue(chainableMock({ data: undefined, error: null }));
      const result = await dismissAlert('a1');
      expect(result.success).toBe(true);
    });
  });

  describe('getUnreadAlertCount', () => {
    it('returns count', async () => {
      mockFrom.mockReturnValue(chainableMock({ data: undefined, error: null }));
      const result = await getUnreadAlertCount('t1');
      expect(result.count).toBe(0);
    });
  });

  describe('generateAlert', () => {
    it('creates alert', async () => {
      mockFrom.mockReturnValue(chainableMock({
        data: { id: 'a1', client_id: 'c1', trainer_id: 't1', alert_type: 'system', severity: 'yellow', title: 'Test', message: 'Test alert' },
        error: null,
      }));
      const result = await generateAlert({
        client_id: 'c1', trainer_id: 't1', alert_type: 'system', severity: 'yellow', title: 'Test', message: 'Test alert',
      });
      expect(result.alert?.id).toBe('a1');
    });
  });
});