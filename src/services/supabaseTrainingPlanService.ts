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
 * Persist a training plan for a client. Replaces any existing active plan for
 * the same client by marking it archived and inserting a fresh row. This is a
 * one-way migration — there is no concept of a draft training plan.
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

    // Archive any existing active plan for this client so the
    // "latest active" query in fetchActiveTrainingPlan stays deterministic.
    const { error: archiveError } = await supabase
      .from(TABLE)
      .update({ status: 'archived' })
      .eq('client_id', clientId)
      .eq('status', 'active');

    if (archiveError) {
      // Non-fatal: log and continue. RLS may block this on a freshly-linked
      // client where the prior plan was created by a different coach.
      console.warn('[saveTrainingPlan] archive prior plans:', archiveError);
    }

    const planData = JSON.parse(JSON.stringify(trainingPlan)) as unknown as Json;

    const { data, error } = await supabase
      .from(TABLE)
      .insert({
        client_id: clientId,
        created_by: userId,
        plan_data: planData,
        weeks: trainingPlan.duration ?? 4,
        status: 'active',
      })
      .select('id')
      .single();

    if (error) {
      console.error('[saveTrainingPlan] insert failed:', error);
      return { success: false, error: getErrorMessage(error, 'Failed to save training plan'), planId: null };
    }

    return { success: true, error: null, planId: (data?.id as string | undefined) ?? null };
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
      .select('plan_data, weeks, status, created_at')
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
      duration: raw.duration ?? data.weeks ?? 4,
    };

    return { plan, error: null };
  } catch (error: unknown) {
    console.error('[fetchActiveTrainingPlan] unexpected error:', error);
    return { plan: null, error: getErrorMessage(error, 'Failed to load training plan') };
  }
}
