/**
 * Coaching Decision service (Phase 13C)
 *
 * Thin persistence wiring between the domain model and Supabase:
 *  - `createCoachingDecision` validates through the domain boundary (which
 *    reuses the canonical `reconcileTarget` feasibility mechanism for a
 *    modified target) and then inserts an AUDIT row via the authorized
 *    `record_coaching_decision` RPC. It NEVER touches the nutrition plan:
 *    no update to nutrition_plans, no plan generation, no locking.
 *  - `fetchLatestCoachingDecision` reads the most recent decision for a client
 *    so the review screen can verify what was recorded.
 *  - `fetchCoachingDecisionHistory` (Phase 13D) reads the client's FULL
 *    persisted decision history, newest-first. Read-only: it never writes,
 *    never invokes the recording RPC, and never reconstructs history from
 *    current state.
 */

import { supabase } from '@/integrations/supabase/client';
import {
  validateCoachingDecisionInput,
  type CoachingDecision,
  type CoachingDecisionInput,
} from '@/domain/coaching/coachingDecision';

// ============================================================================
// TYPES
// ============================================================================

/** The persistence payload: the domain decision plus the client body weight
 *  needed by the canonical feasibility check for modified targets. */
export interface CreateCoachingDecisionInput extends CoachingDecisionInput {
  readonly clientWeightKg: number;
}

interface RecordCoachingDecisionRow {
  success: boolean;
  coaching_decision_id: string;
  coach_id: string;
  error: string | null;
}

/** A persisted `coaching_decisions` row (snake_case columns). */
interface CoachingDecisionRow {
  id: string;
  client_id: string;
  coach_id: string;
  decision_date: string;
  recommendation_status: CoachingDecisionInput['recommendationStatus'];
  coach_action: CoachingDecisionInput['coachAction'];
  baseline_prescription_version_id: string | null;
  observed_weekly_rate_kg: number | null;
  target_weekly_rate_kg: number | null;
  adherence_score: number | null;
  recommended_calorie_adjustment: number | null;
  recommended_target_calories: number | null;
  final_target_calories: number | null;
  coach_note: string | null;
  created_at: string;
}

// ============================================================================
// CREATE (authorized RPC — persists an audit record only)
// ============================================================================

export async function createCoachingDecision(
  input: CreateCoachingDecisionInput,
): Promise<{ data: CoachingDecision | null; error: string | null }> {
  try {
    const validation = validateCoachingDecisionInput(input, {
      weightKg: input.clientWeightKg,
    });
    if (!validation.valid) {
      return { data: null, error: validation.errors.join(' ') };
    }

    const { data, error } = await supabase.rpc(
      'record_coaching_decision' as never,
      {
        p_client_id: input.clientId,
        p_recommendation_status: input.recommendationStatus,
        p_coach_action: input.coachAction,
        p_baseline_prescription_version_id: input.baselinePrescriptionVersionId,
        p_observed_weekly_rate_kg: input.observedWeeklyRateKg,
        p_target_weekly_rate_kg: input.targetWeeklyRateKg,
        p_adherence_score: input.adherenceScore,
        p_recommended_calorie_adjustment: input.recommendedCalorieAdjustment,
        p_recommended_target_calories: input.recommendedTargetCalories,
        p_final_target_calories: input.finalTargetCalories,
        p_coach_note: input.coachNote,
        p_decision_date: input.decisionDate,
      } as never,
    );

    if (error) {
      console.error('[createCoachingDecision] RPC failed:', error);
      return { data: null, error: error.message };
    }

    const rows = (data ?? []) as unknown as RecordCoachingDecisionRow[];
    const row = rows[0];
    if (!row) {
      return { data: null, error: 'The server returned no coaching decision' };
    }
    if (!row.success) {
      return { data: null, error: row.error ?? 'The coaching decision was not recorded' };
    }

    return { data: toDecision(input, row), error: null };
  } catch (err: unknown) {
    console.error('[createCoachingDecision] unexpected error:', err);
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Unknown error recording the decision',
    };
  }
}

// ============================================================================
// READ (latest decision for a client — verifies persistence)
// ============================================================================

export async function fetchLatestCoachingDecision(
  clientId: string,
): Promise<{ data: CoachingDecision | null; error: string | null }> {
  try {
    if (!clientId) {
      return { data: null, error: 'clientId is required' };
    }

    const { data, error } = await supabase
      .from('coaching_decisions' as never)
      .select('*')
      .eq('client_id', clientId)
      .order('decision_date', { ascending: false })
      .limit(1);

    if (error) {
      console.error('[fetchLatestCoachingDecision] select failed:', error);
      return { data: null, error: error.message };
    }

    const rows = (data ?? []) as unknown as CoachingDecisionRow[];
    const row = rows[0];
    if (!row) {
      return { data: null, error: null };
    }
    return { data: rowToDecision(row), error: null };
  } catch (err: unknown) {
    console.error('[fetchLatestCoachingDecision] unexpected error:', err);
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Unknown error loading the coaching decision',
    };
  }
}

// ============================================================================
// READ (decision history — newest-first, read-only)
// ============================================================================

/** The result of a history read: all persisted decisions for one client. */
export interface CoachingDecisionHistoryResult {
  readonly data: CoachingDecision[] | null;
  readonly error: string | null;
}

/**
 * Read the client's FULL persisted decision history (Phase 13D). Strictly
 * read-only: it only SELECTs from `coaching_decisions` under the existing RLS
 * policy, ordered by `decision_date` descending. Persisted values are mapped
 * verbatim — nothing is recomputed, reinterpreted or reconstructed from the
 * current prescription / review state.
 */
export async function fetchCoachingDecisionHistory(
  clientId: string,
): Promise<CoachingDecisionHistoryResult> {
  try {
    if (!clientId) {
      return { data: null, error: 'clientId is required' };
    }

    const { data, error } = await supabase
      .from('coaching_decisions' as never)
      .select('*')
      .eq('client_id', clientId)
      .order('decision_date', { ascending: false });

    if (error) {
      console.error('[fetchCoachingDecisionHistory] select failed:', error);
      return { data: null, error: error.message };
    }

    const rows = (data ?? []) as unknown as CoachingDecisionRow[];
    return { data: rows.map(rowToDecision), error: null };
  } catch (err: unknown) {
    console.error('[fetchCoachingDecisionHistory] unexpected error:', err);
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Unknown error loading the decision history',
    };
  }
}

// ============================================================================
// MAPPERS
// ============================================================================

function toDecision(
  input: CoachingDecisionInput,
  row: RecordCoachingDecisionRow,
): CoachingDecision {
  return {
    id: row.coaching_decision_id,
    coachId: row.coach_id,
    createdAt: new Date().toISOString(),
    clientId: input.clientId,
    decisionDate: input.decisionDate,
    recommendationStatus: input.recommendationStatus,
    coachAction: input.coachAction,
    baselinePrescriptionVersionId: input.baselinePrescriptionVersionId,
    observedWeeklyRateKg: input.observedWeeklyRateKg,
    targetWeeklyRateKg: input.targetWeeklyRateKg,
    adherenceScore: input.adherenceScore,
    recommendedCalorieAdjustment: input.recommendedCalorieAdjustment,
    recommendedTargetCalories: input.recommendedTargetCalories,
    finalTargetCalories: input.finalTargetCalories,
    coachNote: input.coachNote,
  };
}

function rowToDecision(row: CoachingDecisionRow): CoachingDecision {
  return {
    id: row.id,
    coachId: row.coach_id,
    createdAt: row.created_at,
    clientId: row.client_id,
    decisionDate: row.decision_date,
    recommendationStatus: row.recommendation_status,
    coachAction: row.coach_action,
    baselinePrescriptionVersionId: row.baseline_prescription_version_id,
    observedWeeklyRateKg: row.observed_weekly_rate_kg,
    targetWeeklyRateKg: row.target_weekly_rate_kg,
    adherenceScore: row.adherence_score,
    recommendedCalorieAdjustment: row.recommended_calorie_adjustment,
    recommendedTargetCalories: row.recommended_target_calories,
    finalTargetCalories: row.final_target_calories,
    coachNote: row.coach_note,
  };
}