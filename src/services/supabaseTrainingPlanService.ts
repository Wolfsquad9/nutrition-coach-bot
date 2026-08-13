/**
 * Supabase Training Plan Service
 * Persists generated training plans to the `training_plans` table and
 * fetches the active plan for a given client.
 *
 * Schema (`training_plans`):
 *   id          uuid pk
 *   client_id   uuid fk -> clients.id
 *   created_by  uuid fk -> profiles.id
 *   plan_data   jsonb       (the full TrainingPlan shape from types/index.ts)
 *   weeks       int
 *   status      text ('active' | 'completed' | 'archived')
 *   created_at  timestamptz
 *   updated_at  timestamptz
 *
 * RLS: coach must set `created_by = auth.uid()` on insert/update.
 */

import { supabase } from '@/integrations/supabase/client';
import { getCurrentUserId } from '@/hooks/useAuth';
import type { Json } from '@/integrations/supabase/types';
import type { TrainingPlan } from '@/types';

const TABLE = 'training_plans';

const getErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

/**
 * Persist a training plan for a client. Replacement is atomic: the new plan is
 * inserted as active and every other active plan for the client is archived in
 * the same database transaction (`save_training_plan` RPC). If the transaction
 * fails, the previous active plan is untouched — the client is never left
 * without an active plan because a replacement failed.
 */

/**
 * Persist a training plan for a client via the atomic `save_training_plan`
 * RPC. Maintains exactly one active plan per client:
 *   - success → new plan active, previous active plan archived
 *   - failure → previous active plan remains active (transaction rollback)
 */
export async function saveTrainingPlan(
  clientId: string,
  trainingPlan: TrainingPlan,
): Promise<{ success: boolean; error: string | null; planId: string | null }> {
  try {
    if (!clientId) {
      return { success: false, error: 'clientId is required', planId: null };
    }
    if (!trainingPlan) {
      return { success: false, error: 'trainingPlan is required', planId: null };
    }

    const userId = await getCurrentUserId();
    if (!userId) {
      return { success: false, error: 'Not authenticated. Please refresh the page.', planId: null };
    }

    const planData = JSON.parse(JSON.stringify(trainingPlan)) as unknown as Json;

    // `save_training_plan` is a freshly added RPC; the generated supabase
    // types don't include it yet. Cast to keep the call site type-safe
    // until the next typegen.
    const { data, error } = await supabase.rpc(
      'save_training_plan' as never,
      {
        p_client_id: clientId,
        p_plan_data: planData,
        p_weeks: trainingPlan.duration ?? 4,
      } as never,
    );

    if (error) {
      // Nothing changed on the database side — the previous active plan (if
      // any) remains active because the RPC is a single transaction.
      console.error('[saveTrainingPlan] replace failed:', error);
      return { success: false, error: getErrorMessage(error, 'Failed to save training plan'), planId: null };
    }

    // The RPC returns SETOF (success, plan_id, error). Pull the first row and
    // cast through unknown because the generated types lack the new RPC.
    const result = data as unknown as
      | { success?: boolean; plan_id?: string | null; error?: string | null }
      | Array<{ success?: boolean; plan_id?: string | null; error?: string | null }>
      | null;
    const row = Array.isArray(result) ? result[0] : result;

    if (!row || !row.success) {
      return { success: false, error: row?.error || 'Failed to save training plan', planId: null };
    }

    return { success: true, error: null, planId: (row.plan_id as string | undefined) ?? null };
  } catch (error: unknown) {
    console.error('[saveTrainingPlan] unexpected error:', error);
    return { success: false, error: getErrorMessage(error, 'Failed to save training plan'), planId: null };
  }
}

/**
 * Fetch the most recent active training plan for a client. Returns null when
 * the coach has not yet persisted a plan — the caller should treat this as an
 * empty state, not an error.
 */
export async function fetchActiveTrainingPlan(
  clientId: string,
): Promise<{ plan: TrainingPlan | null; error: string | null }> {
  try {
    if (!clientId) {
      return { plan: null, error: 'clientId is required' };
    }

    const { data, error } = await supabase
      .from(TABLE)
      .select('id, plan_data, weeks, status, created_at')
      .eq('client_id', clientId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[fetchActiveTrainingPlan] select failed:', error);
      return { plan: null, error: getErrorMessage(error, 'Failed to load training plan') };
    }

    if (!data) {
      return { plan: null, error: null };
    }

    const raw = (data.plan_data ?? {}) as Partial<TrainingPlan>;
    const plan: TrainingPlan = {
      ...(raw as TrainingPlan),
      // The authoritative plan identity is the persisted `training_plans.id`
      // UUID — NOT the placeholder embedded in plan_data. Override here so the
      // app always references the real FK when logging session execution data.
      id: data.id as string,
      duration: raw.duration ?? data.weeks ?? 4,
    };

    return { plan, error: null };
  } catch (error: unknown) {
    console.error('[fetchActiveTrainingPlan] unexpected error:', error);
    return { plan: null, error: getErrorMessage(error, 'Failed to load training plan') };
  }
}
