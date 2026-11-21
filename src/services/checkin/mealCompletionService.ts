/**
 * Meal Completion Service
 *
 * CRUD operations for the meal_completions table.
 * - UPDATE changes only completed; a missing row is inserted separately
 * - RLS enforces athlete ownership and current-version at the database level
 */
import { supabase } from '@/integrations/supabase/client';

export interface MealCompletion {
  id: string;
  client_id: string;
  plan_version_id: string;
  day_offset: number; // 0-6, maps to dayNumber - 1
  meal_slot: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  completed: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpsertMealCompletionInput {
  client_id: string;
  plan_version_id: string;
  day_offset: number; // 0-6, maps to dayNumber - 1
  meal_slot: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  completed: boolean;
}

/**
 * Temporary diagnostic gate.
 *
 * Enabled when:
 *   - Local development (import.meta.env.DEV === true) AND
 *     VITE_MEAL_COMPLETION_DEBUG === '1', OR
 *   - A Vercel Preview build (__VERCEL_ENV__ === 'preview') AND
 *     VITE_MEAL_COMPLETION_DEBUG === '1'
 *
 * Disabled in all other environments, including Vercel Production.
 *
 * __VERCEL_ENV__ is injected at build time by Vite's define from
 * process.env.VERCEL_ENV, which Vercel sets authoritatively during
 * builds ('preview' or 'production'). It is not a manually configured
 * VITE_* variable, so Production protection depends on the actual
 * Vercel deployment environment rather than an operator-entered value.
 *
 * VITE_MEAL_COMPLETION_DEBUG is the master switch: it must be explicitly
 * set to '1' in any environment for diagnostics to run. It is not set in
 * any .env file, so diagnostics are disabled by default.
 */
declare const __VERCEL_ENV__: string;

const MEAL_COMPLETION_DEBUG =
  import.meta.env.VITE_MEAL_COMPLETION_DEBUG === '1' &&
  (import.meta.env.DEV || __VERCEL_ENV__ === 'preview');

/**
 * Capture the authenticated user's ID from the existing Supabase session.
 * No new authentication mechanism is created.
 */
async function getAuthenticatedUserId(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

export async function upsertMealCompletion(
  input: UpsertMealCompletionInput
): Promise<{ completion: MealCompletion | null; error: string | null }> {
  try {
    // Validate input: client_id and plan_version_id must be provided
    if (!input.client_id || !input.plan_version_id) {
      return { completion: null, error: 'Client and plan version are required' };
    }

    const authenticatedUserId = await getAuthenticatedUserId();
    if (!authenticatedUserId) {
      return { completion: null, error: 'Not authenticated' };
    }

    const updateExistingCompletion = () =>
      supabase
        .from('meal_completions')
        .update({ completed: input.completed })
        .eq('client_id', input.client_id)
        .eq('plan_version_id', input.plan_version_id)
        .eq('day_offset', input.day_offset)
        .eq('meal_slot', input.meal_slot)
        .select('*');

    if (MEAL_COMPLETION_DEBUG) {
      console.debug('[MEAL_COMPLETION_DEBUG] write attempt', {
        authenticatedUserId,
        client_id: input.client_id,
        plan_version_id: input.plan_version_id,
        day_offset: input.day_offset,
        meal_slot: input.meal_slot,
        completed: input.completed,
        timestamp: new Date().toISOString(),
      });
    }

    const { data: updatedRows, error: updateError } = await updateExistingCompletion();

    if (updateError) {
      if (MEAL_COMPLETION_DEBUG) {
        console.debug('[MEAL_COMPLETION_DEBUG] update error', {
          authenticatedUserId,
          client_id: input.client_id,
          plan_version_id: input.plan_version_id,
          day_offset: input.day_offset,
          meal_slot: input.meal_slot,
          completed: input.completed,
          error: {
            message: updateError.message,
            code: updateError.code,
            details: updateError.details,
            hint: updateError.hint,
          },
          timestamp: new Date().toISOString(),
        });
      }
      return { completion: null, error: updateError.message };
    }

    if (updatedRows?.length) {
      return { completion: updatedRows[0] as MealCompletion, error: null };
    }

    const { data: insertedCompletion, error: insertError } = await supabase
      .from('meal_completions')
      .insert({
        client_id: input.client_id,
        plan_version_id: input.plan_version_id,
        day_offset: input.day_offset,
        meal_slot: input.meal_slot,
        completed: input.completed,
      })
      .select('*')
      .single();

    if (insertError?.code === '23505') {
      const { data: retriedRows, error: retryError } = await updateExistingCompletion();
      if (retryError) {
        return { completion: null, error: retryError.message };
      }
      if (retriedRows?.length) {
        return { completion: retriedRows[0] as MealCompletion, error: null };
      }
      return {
        completion: null,
        error: 'Meal completion could not be updated after a concurrent insert',
      };
    }

    if (insertError) {
      if (MEAL_COMPLETION_DEBUG) {
        console.debug('[MEAL_COMPLETION_DEBUG] insert error', {
          authenticatedUserId,
          client_id: input.client_id,
          plan_version_id: input.plan_version_id,
          day_offset: input.day_offset,
          meal_slot: input.meal_slot,
          completed: input.completed,
          error: {
            message: insertError.message,
            code: insertError.code,
            details: insertError.details,
            hint: insertError.hint,
          },
          timestamp: new Date().toISOString(),
        });
      }
      return { completion: null, error: insertError.message };
    }

    if (!insertedCompletion) {
      return { completion: null, error: 'Meal completion insert returned no record' };
    }

    return { completion: insertedCompletion as MealCompletion, error: null };
  } catch (err: unknown) {
    if (MEAL_COMPLETION_DEBUG) {
      console.debug('[MEAL_COMPLETION_DEBUG] write exception', {
        authenticatedUserId: undefined,
        client_id: input.client_id,
        plan_version_id: input.plan_version_id,
        day_offset: input.day_offset,
        meal_slot: input.meal_slot,
        completed: input.completed,
        error: {
          message: err instanceof Error ? err.message : String(err),
          code: undefined,
          details: undefined,
          hint: undefined,
        },
        timestamp: new Date().toISOString(),
      });
    }
    return {
      completion: null,
      error: err instanceof Error ? err.message : 'Failed to upsert meal completion',
    };
  }
}

export async function getMealCompletions(
  clientId: string,
  planVersionId: string
): Promise<{ completions: MealCompletion[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('meal_completions')
      .select('*')
      .eq('client_id', clientId)
      .eq('plan_version_id', planVersionId)
      .order('created_at', { ascending: false });

    if (error) {
      return { completions: [], error: error.message };
    }

    return { completions: (data as unknown as MealCompletion[]) ?? [], error: null };
  } catch (err: unknown) {
    return {
      completions: [],
      error: err instanceof Error ? err.message : 'Failed to fetch meal completions',
    };
  }
}

export async function deleteMealCompletion(
  id: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const { error } = await supabase
      .from('meal_completions')
      .delete()
      .eq('id', id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, error: null };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to delete meal completion' };
  }
}