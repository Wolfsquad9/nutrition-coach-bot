/**
 * Meal Completion Service
 *
 * CRUD operations for the meal_completions table.
 * - INSERT / UPDATE go through upsert with ON CONFLICT on the unique constraint
 *   (client_id, plan_version_id, day_offset, meal_slot)
 * - RLS enforces athlete ownership and current-version at the database level
 */
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

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

export async function upsertMealCompletion(
  input: UpsertMealCompletionInput
): Promise<{ completion: MealCompletion | null; error: string | null }> {
  try {
    // Validate input: client_id and plan_version_id must be provided
    if (!input.client_id || !input.plan_version_id) {
      return { completion: null, error: 'Client and plan version are required' };
    }

    const { data, error } = await supabase
      .from('meal_completions')
      .upsert(
        {
          client_id: input.client_id,
          plan_version_id: input.plan_version_id,
          day_offset: input.day_offset,
          meal_slot: input.meal_slot,
          completed: input.completed,
          completed_at: input.completed ? new Date().toISOString() : null,
        },
        {
          onConflict: 'client_id, plan_version_id, day_offset, meal_slot',
        }
      )
      .select('*')
      .single();

    if (error) {
      return { completion: null, error: error.message };
    }

    return { completion: data as unknown as MealCompletion, error: null };
  } catch (err: unknown) {
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