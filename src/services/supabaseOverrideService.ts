/**
 * Supabase Override Service
 * Handles ingredient substitution suggestions without mutating immutable plans
 */

import { supabase } from '@/integrations/supabase/client';

export interface PlanOverride {
  id: string;
  planVersionId: string;
  clientId: string;
  mealType: string;
  originalIngredient: string;
  replacementIngredient: string;
  macroDelta: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  withinTolerance: boolean;
  suggestedBy: 'client' | 'coach' | 'system';
  approvedBy: string | null;
  createdAt: string;
  archived: boolean;
  requiresRecipeRegeneration: boolean;
}

export interface CreateOverrideParams {
  planVersionId: string;
  clientId: string;
  mealType: string;
  originalIngredient: string;
  replacementIngredient: string;
  macroDelta: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  withinTolerance: boolean;
  suggestedBy: 'client' | 'coach' | 'system';
  requiresRecipeRegeneration?: boolean;
}

/**
 * Create a new override suggestion
 */
export async function createOverride(params: CreateOverrideParams): Promise<{
  override: PlanOverride | null;
  error: string | null;
}> {
  try {
    const { data, error } = await supabase
      .from('plan_overrides')
      .insert({
        plan_version_id: params.planVersionId,
        client_id: params.clientId,
        meal_type: params.mealType,
        original_ingredient: params.originalIngredient,
        replacement_ingredient: params.replacementIngredient,
        macro_delta: params.macroDelta,
        within_tolerance: params.withinTolerance,
        suggested_by: params.suggestedBy,
        requires_recipe_regeneration: params.requiresRecipeRegeneration ?? true,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating override:', error);
      return { override: null, error: error.message };
    }

    return {
      override: mapRowToOverride(data),
      error: null,
    };
  } catch (error: any) {
    console.error('Failed to create override:', error);
    return { override: null, error: error.message };
  }
}

/**
 * Fetch all pending (non-approved) overrides for a plan version
 */
export async function fetchPendingOverrides(planVersionId: string): Promise<{
  overrides: PlanOverride[];
  error: string | null;
}> {
  try {
    const { data, error } = await supabase
      .from('plan_overrides')
      .select('*')
      .eq('plan_version_id', planVersionId)
      .is('approved_by', null)
      .eq('archived', false)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching pending overrides:', error);
      return { overrides: [], error: error.message };
    }

    return {
      overrides: (data || []).map(mapRowToOverride),
      error: null,
    };
  } catch (error: any) {
    console.error('Failed to fetch pending overrides:', error);
    return { overrides: [], error: error.message };
  }
}

/**
 * Fetch all overrides for a client (across all plan versions)
 */
export async function fetchClientOverrides(clientId: string): Promise<{
  overrides: PlanOverride[];
  error: string | null;
}> {
  try {
    const { data, error } = await supabase
      .from('plan_overrides')
      .select('*')
      .eq('client_id', clientId)
      .eq('archived', false)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching client overrides:', error);
      return { overrides: [], error: error.message };
    }

    return {
      overrides: (data || []).map(mapRowToOverride),
      error: null,
    };
  } catch (error: any) {
    console.error('Failed to fetch client overrides:', error);
    return { overrides: [], error: error.message };
  }
}

/**
 * Approve an override (by coach)
 */
export async function approveOverride(overrideId: string, approverId: string): Promise<{
  success: boolean;
  error: string | null;
}> {
  try {
    const { error } = await supabase
      .from('plan_overrides')
      .update({ approved_by: approverId })
      .eq('id', overrideId);

    if (error) {
      console.error('Error approving override:', error);
      return { success: false, error: error.message };
    }

    return { success: true, error: null };
  } catch (error: any) {
    console.error('Failed to approve override:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Archive (soft delete) an override
 */
export async function archiveOverride(overrideId: string): Promise<{
  success: boolean;
  error: string | null;
}> {
  try {
    const { error } = await supabase
      .from('plan_overrides')
      .update({ archived: true })
      .eq('id', overrideId);

    if (error) {
      console.error('Error archiving override:', error);
      return { success: false, error: error.message };
    }

    return { success: true, error: null };
  } catch (error: any) {
    console.error('Failed to archive override:', error);
    return { success: false, error: error.message };
  }
}

// Helper to map DB row to typed object
function mapRowToOverride(row: Record<string, unknown>): PlanOverride {
  return {
    id: row.id as string,
    planVersionId: row.plan_version_id as string,
    clientId: row.client_id as string,
    mealType: row.meal_type as string,
    originalIngredient: row.original_ingredient as string,
    replacementIngredient: row.replacement_ingredient as string,
    macroDelta: row.macro_delta as PlanOverride['macroDelta'],
    withinTolerance: row.within_tolerance as boolean,
    suggestedBy: row.suggested_by as 'client' | 'coach' | 'system',
    approvedBy: row.approved_by as string | null,
    createdAt: row.created_at as string,
    archived: row.archived as boolean,
    requiresRecipeRegeneration: row.requires_recipe_regeneration as boolean,
  };
}
