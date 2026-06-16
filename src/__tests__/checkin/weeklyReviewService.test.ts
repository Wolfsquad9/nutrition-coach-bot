import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn() },
}));

import { supabase } from '@/integrations/supabase/client';
import { submitWeeklyReview, getCurrentWeekReview, getReviewHistory, updateCoachNotes } from '@/services/checkin/weeklyReviewService';

const mockFrom = supabase.from as ReturnType<typeof vi.fn>;

describe('weeklyReviewService', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('submitWeeklyReview returns review on success', async () => {
    const mockReview = { id: 'r1', client_id: 'c1', week_start_date: '2026-06-08' };
    mockFrom.mockReturnValue({
      upsert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: mockReview, error: null }) }),
      }),
    });

    const result = await submitWeeklyReview({ client_id: 'c1', week_start_date: '2026-06-08', created_by: 'u1' });
    expect(result.error).toBeNull();
    expect(result.review?.id).toBe('r1');
  });

  it('getCurrentWeekReview returns null when no review', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }),
        }),
      }),
    });

    const result = await getCurrentWeekReview('c1');
    expect(result.review).toBeNull();
  });

  it('updateCoachNotes returns updated review', async () => {
    mockFrom.mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'r1', coach_notes: 'test notes' }, error: null }) }),
        }),
      }),
    });

    const result = await updateCoachNotes('r1', 'test notes');
    expect(result.error).toBeNull();
    expect(result.review?.coach_notes).toBe('test notes');
  });
});