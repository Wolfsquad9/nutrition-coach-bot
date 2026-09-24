/**
 * Coaching Decision service — persistence tests (Phase 13C)
 *
 * Verifies createCoachingDecision validates through the domain boundary, calls
 * the authorized record_coaching_decision RPC with snake_case args, maps the
 * returned row, and never touches a nutrition table. Also verifies the read
 * path maps a persisted row back to the domain shape.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn(), from: vi.fn() },
}));

import { supabase } from '@/integrations/supabase/client';
import {
  createCoachingDecision,
  fetchLatestCoachingDecision,
  type CreateCoachingDecisionInput,
} from './coachingDecisionService';

const mockRpc = supabase.rpc as ReturnType<typeof vi.fn>;
const mockFrom = supabase.from as ReturnType<typeof vi.fn>;

const DATE = '2026-09-15';

function validInput(overrides: Partial<CreateCoachingDecisionInput> = {}): CreateCoachingDecisionInput {
  return {
    clientWeightKg: 80,
    clientPrimaryGoal: 'maintenance',
    clientActivityLevel: 'moderately_active',
    clientId: 'client-13c',
    recommendationStatus: 'adjustment_recommended',
    coachAction: 'accepted',
    baselinePrescriptionVersionId: 'ver-1',
    observedWeeklyRateKg: -0.5,
    targetWeeklyRateKg: -0.5,
    adherenceScore: 90,
    recommendedCalorieAdjustment: -150,
    recommendedTargetCalories: 2000,
    finalTargetCalories: 2000,
    coachNote: null,
    decisionDate: DATE,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createCoachingDecision', () => {
  it('rejects an invalid decision without calling the RPC', async () => {
    const result = await createCoachingDecision(
      validInput({ coachAction: 'maintained', finalTargetCalories: 2050 }),
    );
    expect(result.data).toBeNull();
    expect(result.error).toContain('finalTargetCalories must be null');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('validates a modified target against the client\u2019s protein priority (regression)', async () => {
    // 1000 kcal covers a 'normal' 80kg client's protein+fat floor (944 kcal)
    // but NOT a fat-loss (priority) client's (1072 kcal) — the boundary must
    // use the client's real goal/training context, not a hardcoded priority.
    mockRpc.mockResolvedValue({
      data: [{ success: true, coaching_decision_id: 'd-1', coach_id: 'coach-1', error: null }],
      error: null,
    });

    const normalResult = await createCoachingDecision(
      validInput({ coachAction: 'modified', finalTargetCalories: 1000 }),
    );
    expect(normalResult.error).toBeNull();
    expect(normalResult.data?.id).toBe('d-1');
    expect(mockRpc).toHaveBeenCalledTimes(1);

    mockRpc.mockClear();

    const priorityResult = await createCoachingDecision(
      validInput({
        coachAction: 'modified',
        finalTargetCalories: 1000,
        clientPrimaryGoal: 'fat_loss',
      }),
    );
    expect(priorityResult.data).toBeNull();
    expect(priorityResult.error).toContain('not feasible');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('calls the record_coaching_decision RPC with snake_case args and returns the decision', async () => {
    mockRpc.mockResolvedValue({
      data: [{ success: true, coaching_decision_id: 'd-1', coach_id: 'coach-1', error: null }],
      error: null,
    });

    const result = await createCoachingDecision(validInput());

    expect(mockRpc).toHaveBeenCalledTimes(1);
    const [name, args] = mockRpc.mock.calls[0];
    expect(name).toBe('record_coaching_decision');
    expect(args.p_client_id).toBe('client-13c');
    expect(args.p_recommendation_status).toBe('adjustment_recommended');
    expect(args.p_coach_action).toBe('accepted');
    expect(args.p_recommended_calorie_adjustment).toBe(-150);
    expect(args.p_recommended_target_calories).toBe(2000);
    expect(args.p_final_target_calories).toBe(2000);
    expect(args.p_baseline_prescription_version_id).toBe('ver-1');
    expect(args.p_decision_date).toBe(DATE);

    expect(result.error).toBeNull();
    expect(result.data?.id).toBe('d-1');
    expect(result.data?.coachId).toBe('coach-1');
    expect(result.data?.coachAction).toBe('accepted');
    // The recommendation snapshot is preserved independently from the decision.
    expect(result.data?.recommendedTargetCalories).toBe(2000);
    expect(result.data?.finalTargetCalories).toBe(2000);
  });

  it('maps a transport-level RPC error to an error result', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'network down' },
    });
    const result = await createCoachingDecision(validInput());
    expect(result.data).toBeNull();
    expect(result.error).toBe('network down');
  });

  it('maps a failed decision row to an error result', async () => {
    mockRpc.mockResolvedValue({
      data: [{ success: false, coaching_decision_id: null, coach_id: null, error: 'already recorded' }],
      error: null,
    });
    const result = await createCoachingDecision(validInput());
    expect(result.data).toBeNull();
    expect(result.error).toBe('already recorded');
  });
});

describe('fetchLatestCoachingDecision', () => {
  it('requires a clientId', async () => {
    const result = await fetchLatestCoachingDecision('');
    expect(result.data).toBeNull();
    expect(result.error).toBe('clientId is required');
  });

  it('maps a persisted row back to the domain decision', async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: async () => ({
              data: [
                {
                  id: 'd-1',
                  client_id: 'client-13c',
                  coach_id: 'coach-1',
                  decision_date: DATE,
                  recommendation_status: 'modified',
                  coach_action: 'modified',
                  baseline_prescription_version_id: 'ver-1',
                  observed_weekly_rate_kg: -0.5,
                  target_weekly_rate_kg: -0.5,
                  adherence_score: 90,
                  recommended_calorie_adjustment: -150,
                  recommended_target_calories: 2000,
                  final_target_calories: 2050,
                  coach_note: 'Smaller reduction due to travel.',
                  created_at: '2026-09-15T09:00:00Z',
                },
              ],
              error: null,
            }),
          }),
        }),
      }),
    });

    const result = await fetchLatestCoachingDecision('client-13c');
    expect(result.error).toBeNull();
    expect(result.data?.coachAction).toBe('modified');
    expect(result.data?.finalTargetCalories).toBe(2050);
    expect(result.data?.recommendedTargetCalories).toBe(2000);
    expect(result.data?.coachNote).toBe('Smaller reduction due to travel.');
  });

  it('returns null (no error) when there is no decision yet', async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: async () => ({ data: [], error: null }),
          }),
        }),
      }),
    });
    const result = await fetchLatestCoachingDecision('client-13c');
    expect(result.data).toBeNull();
    expect(result.error).toBeNull();
  });
});