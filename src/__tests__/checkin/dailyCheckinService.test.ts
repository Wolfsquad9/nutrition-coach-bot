/**
 * Unit tests for dailyCheckinService
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase client
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import { supabase } from '@/integrations/supabase/client';
import { submitDailyCheckin, getTodayCheckin, getCheckinHistory, getClientCheckins } from '@/services/checkin/dailyCheckinService';

const mockFrom = supabase.from as ReturnType<typeof vi.fn>;

function createMockChain(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, unknown> = {
    upsert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    ...overrides,
  };
  // Terminal methods return promise
  chain.upsert = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: { id: 'c1' }, error: null }),
    }),
  });
  return chain;
}

describe('dailyCheckinService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('submitDailyCheckin', () => {
    it('returns checkin on successful upsert', async () => {
      const mockInsert = { id: 'c1', client_id: 'c1', checkin_date: '2026-06-13', meal_adherence: 80, workout_completed: false, created_by: 'u1' } as any;
      mockFrom.mockReturnValue({
        upsert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockInsert, error: null }),
          }),
        }),
      });
      mockFrom.mockClear();

      const result = await submitDailyCheckin({
        client_id: 'c1',
        checkin_date: '2026-06-13',
        meal_adherence: 80,
        workout_completed: false,
        created_by: 'u1',
      });

      expect(result.error).toBeNull();
      expect(result.checkin?.id).toBe('c1');
    });

    it('returns error on failure', async () => {
      mockFrom.mockReturnValue({
        upsert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
          }),
        }),
      });

      const result = await submitDailyCheckin({
        client_id: 'c1',
        checkin_date: '2026-06-13',
        meal_adherence: 80,
        workout_completed: false,
        created_by: 'u1',
      });

      expect(result.error).toBe('DB error');
      expect(result.checkin).toBeNull();
    });
  });

  describe('getTodayCheckin', () => {
    it('returns checkin when found', async () => {
      const mockCheckin = { id: 'c1', client_id: 'c1', checkin_date: '2026-06-13' };
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: mockCheckin, error: null }),
            }),
          }),
        }),
      });

      const result = await getTodayCheckin('c1');
      expect(result.checkin).toBeDefined();
      expect(result.error).toBeNull();
    });

    it('returns null when no checkin today', async () => {
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      });

      const result = await getTodayCheckin('c1');
      expect(result.checkin).toBeNull();
    });
  });
});