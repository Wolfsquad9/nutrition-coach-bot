/**
 * Coaching decision history — service read tests (Phase 13D)
 *
 * Verifies the history read path: queries only the requested client, orders
 * newest-first by decision_date, maps persisted rows verbatim, handles empty
 * history, and surfaces read failures without inventing data.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn(), from: vi.fn() },
}));

import { supabase } from '@/integrations/supabase/client';
import { fetchCoachingDecisionHistory } from './coachingDecisionService';

const mockFrom = supabase.from as ReturnType<typeof vi.fn>;

function row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'd-1',
    client_id: 'client-13d',
    coach_id: 'coach-1',
    decision_date: '2026-09-15',
    recommendation_status: 'adjustment_recommended',
    coach_action: 'modified',
    baseline_prescription_version_id: 'ver-1',
    observed_weekly_rate_kg: -0.5,
    target_weekly_rate_kg: -0.5,
    adherence_score: 90,
    recommended_calorie_adjustment: -150,
    recommended_target_calories: 2000,
    final_target_calories: 2050,
    coach_note: 'Reduced the adjustment because adherence was improving.',
    created_at: '2026-09-15T09:00:00Z',
    ...overrides,
  };
}

function fromChain(rows: unknown[] | null, error: unknown = null) {
  const eq = vi.fn();
  const order = vi.fn();
  eq.mockReturnValue({ order });
  order.mockResolvedValue({ data: rows, error });
  const select = vi.fn().mockReturnValue({ eq });
  mockFrom.mockReturnValue({ select });
  return { select, eq, order };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchCoachingDecisionHistory', () => {
  it('requires a clientId', async () => {
    const result = await fetchCoachingDecisionHistory('');
    expect(result.data).toBeNull();
    expect(result.error).toBe('clientId is required');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('queries only the coaching_decisions table scoped to the given client', async () => {
    const chain = fromChain([]);
    const result = await fetchCoachingDecisionHistory('client-13d');
    expect(result.error).toBeNull();
    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(mockFrom.mock.calls[0][0]).toBe('coaching_decisions');
    expect(chain.eq).toHaveBeenCalledWith('client_id', 'client-13d');
  });

  it('orders by decision_date descending (newest-first)', async () => {
    const chain = fromChain([]);
    await fetchCoachingDecisionHistory('client-13d');
    expect(chain.order).toHaveBeenCalledWith('decision_date', { ascending: false });
  });

  it('maps persisted rows verbatim, preserving all persisted fields', async () => {
    fromChain([
      row({
        id: 'd-new',
        decision_date: '2026-09-15',
        recommendation_status: 'adjustment_recommended',
        coach_action: 'modified',
      }),
      row({
        id: 'd-old',
        decision_date: '2026-09-08',
        recommendation_status: 'maintain',
        coach_action: 'maintained',
        final_target_calories: null,
        coach_note: null,
        recommended_calorie_adjustment: null,
        recommended_target_calories: null,
      }),
    ]);

    const result = await fetchCoachingDecisionHistory('client-13d');
    expect(result.error).toBeNull();
    expect(result.data?.length).toBe(2);

    const newest = result.data?.[0];
    expect(newest?.id).toBe('d-new');
    expect(newest?.decisionDate).toBe('2026-09-15');
    expect(newest?.recommendationStatus).toBe('adjustment_recommended');
    expect(newest?.coachAction).toBe('modified');
    expect(newest?.recommendedCalorieAdjustment).toBe(-150);
    expect(newest?.recommendedTargetCalories).toBe(2000);
    expect(newest?.finalTargetCalories).toBe(2050);
    expect(newest?.coachNote).toBe('Reduced the adjustment because adherence was improving.');

    const oldest = result.data?.[1];
    expect(oldest?.id).toBe('d-old');
    expect(oldest?.recommendationStatus).toBe('maintain');
    expect(oldest?.coachAction).toBe('maintained');
    expect(oldest?.finalTargetCalories).toBeNull();
    expect(oldest?.coachNote).toBeNull();
  });

  it('returns an empty list (no error) when the client has no decisions', async () => {
    fromChain([]);
    const result = await fetchCoachingDecisionHistory('client-13d');
    expect(result.data).toEqual([]);
    expect(result.error).toBeNull();
  });

  it('surfaces a read failure as an error result', async () => {
    fromChain(null, { message: 'network down' });
    const result = await fetchCoachingDecisionHistory('client-13d');
    expect(result.data).toBeNull();
    expect(result.error).toBe('network down');
  });
});
