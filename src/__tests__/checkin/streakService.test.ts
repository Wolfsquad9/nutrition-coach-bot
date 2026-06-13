import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn() },
}));

import { supabase } from '@/integrations/supabase/client';
import { getStreak, updateStreak } from '@/services/checkin/streakService';

const mockFrom = supabase.from as ReturnType<typeof vi.fn>;

function mockMaybeSingle(result: unknown) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue(result) }),
    }),
  };
}

describe('streakService', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  describe('getStreak', () => {
    it('returns streak when found', async () => {
      mockFrom.mockReturnValue(mockMaybeSingle({ data: { id: 's1', client_id: 'c1', current_streak: 5 }, error: null }));
      const result = await getStreak('c1');
      expect(result.streak?.current_streak).toBe(5);
    });

    it('returns null when no streak', async () => {
      mockFrom.mockReturnValue(mockMaybeSingle({ data: null, error: null }));
      const result = await getStreak('c1');
      expect(result.streak).toBeNull();
    });
  });

  describe('updateStreak', () => {
    it('starts streak at 1 for first checkin', async () => {
      // First call: no existing streak
      mockFrom.mockReturnValueOnce(mockMaybeSingle({ data: null, error: null }));
      // Second call: upsert returns the new streak
      mockFrom.mockReturnValueOnce({
        upsert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 's1', client_id: 'c1', current_streak: 1, longest_streak: 1, last_checkin_date: new Date().toISOString().slice(0, 10) },
              error: null,
            }),
          }),
        }),
      });

      mockFrom.mockClear();
      const result = await updateStreak('c1');
      expect(result.result?.current_streak).toBe(1);
      expect(result.result?.broken).toBe(false);
    });
  });
});