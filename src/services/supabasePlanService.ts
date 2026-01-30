/**
 * Supabase Plan Service
 * Handles nutrition plan persistence with immutability and 7-day locking
 */

import { supabase } from '@/integrations/supabase/client';
import { getCurrentUserId } from '@/hooks/useAuth';
import { ensureProfileExists } from '@/services/profileService';
import type { WeeklyMealPlanResult } from '@/services/recipeService';

// Plan version payload structure
export interface PlanPayload {
  type: 'nutrition';
  generatedAt: string;
  macroTargets: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  weeklyPlan: WeeklyMealPlanResult;
  realismConstraintHit?: boolean;
  constraintsHitDetails?: string[];
  likedIngredients: string[];
}

export interface NutritionPlanRow {
  id: string;
  client_id: string;
  created_by: string;
  plan_data: Record<string, unknown>;
  status: string;
  created_at: string;
  updated_at: string;
  current_version_id: string | null;
}

export interface PlanVersionRow {
  id: string;
  plan_id: string;
  version_number: number;
  created_by: string | null;
  created_at: string;
  plan_payload: PlanPayload;
  note: string | null;
  payload_hash: string;
  archived: boolean;
}

export interface PlanLockStatus {
  isLocked: boolean;
  lockedUntil: Date | null;
  daysRemaining: number;
}

// Simple hash function for payload deduplication
function hashPayload(payload: PlanPayload): string {
  const str = JSON.stringify(payload);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `hash_${Math.abs(hash).toString(16)}`;
}

/**
 * Check if a plan is locked (within 7 days of creation)
 */
export async function checkPlanLockStatus(clientId: string): Promise<PlanLockStatus> {
  try {
    // Get the latest nutrition plan for this client
    const { data: planData, error: planError } = await supabase
      .from('nutrition_plans')
      .select('id, current_version_id, created_at')
      .eq('client_id', clientId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (planError) {
      console.error('Error checking plan lock:', planError);
      return { isLocked: false, lockedUntil: null, daysRemaining: 0 };
    }

    if (!planData || !planData.current_version_id) {
      return { isLocked: false, lockedUntil: null, daysRemaining: 0 };
    }

    // Get the current version to check its creation date
    const { data: versionData, error: versionError } = await supabase
      .from('plan_versions')
      .select('created_at')
      .eq('id', planData.current_version_id)
      .maybeSingle();

    if (versionError || !versionData) {
      return { isLocked: false, lockedUntil: null, daysRemaining: 0 };
    }

    const versionCreatedAt = new Date(versionData.created_at);
    const lockEndDate = new Date(versionCreatedAt);
    lockEndDate.setDate(lockEndDate.getDate() + 7);

    const now = new Date();
    const isLocked = now < lockEndDate;
    const daysRemaining = isLocked 
      ? Math.ceil((lockEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    return {
      isLocked,
      lockedUntil: isLocked ? lockEndDate : null,
      daysRemaining,
    };
  } catch (error) {
    console.error('Failed to check plan lock status:', error);
    return { isLocked: false, lockedUntil: null, daysRemaining: 0 };
  }
}

/**
 * Fetch the current active plan for a client
 */
export async function fetchCurrentPlan(clientId: string): Promise<{
  plan: PlanPayload | null;
  planId: string | null;
  versionId: string | null;
  createdAt: string | null;
  error: string | null;
}> {
  try {
    // Get the active nutrition plan
    const { data: planData, error: planError } = await supabase
      .from('nutrition_plans')
      .select('id, current_version_id, created_at')
      .eq('client_id', clientId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (planError) {
      console.error('Error fetching plan:', planError);
      return { plan: null, planId: null, versionId: null, createdAt: null, error: planError.message };
    }

    if (!planData || !planData.current_version_id) {
      return { plan: null, planId: null, versionId: null, createdAt: null, error: null };
    }

    // Get the current version payload
    const { data: versionData, error: versionError } = await supabase
      .from('plan_versions')
      .select('plan_payload, created_at')
      .eq('id', planData.current_version_id)
      .maybeSingle();

    if (versionError || !versionData) {
      return { plan: null, planId: planData.id, versionId: null, createdAt: null, error: versionError?.message || 'Version not found' };
    }

    return {
      plan: versionData.plan_payload as unknown as PlanPayload,
      planId: planData.id,
      versionId: planData.current_version_id,
      createdAt: versionData.created_at,
      error: null,
    };
  } catch (error: any) {
    console.error('Failed to fetch current plan:', error);
    return { plan: null, planId: null, versionId: null, createdAt: null, error: error.message };
  }
}

/**
 * Save a new nutrition plan (creates both nutrition_plans and plan_versions entries)
 */
export async function saveNutritionPlan(
  clientId: string,
  weeklyPlan: WeeklyMealPlanResult,
  macroTargets: { calories: number; protein: number; carbs: number; fat: number },
  likedIngredients: string[],
  realismConstraintHit?: boolean,
  constraintsHitDetails?: string[]
): Promise<{ success: boolean; planId: string | null; versionId: string | null; error: string | null }> {
  try {
    // Ensure profile exists for FK constraint (critical for anonymous auth)
    const profileId = await ensureProfileExists();
    if (!profileId) {
      return {
        success: false,
        planId: null,
        versionId: null,
        error: 'Non authentifié. Veuillez rafraîchir la page.',
      };
    }

    const userId = profileId; // Use profile ID for created_by FK

    // First check if plan is locked
    const lockStatus = await checkPlanLockStatus(clientId);
    if (lockStatus.isLocked) {
      return {
        success: false,
        planId: null,
        versionId: null,
        error: `Plan is locked for ${lockStatus.daysRemaining} more day(s). Changes can only be made via suggestions.`,
      };
    }

    // Create the payload
    const payload: PlanPayload = {
      type: 'nutrition',
      generatedAt: new Date().toISOString(),
      macroTargets,
      weeklyPlan,
      realismConstraintHit,
      constraintsHitDetails,
      likedIngredients,
    };

    const payloadHash = hashPayload(payload);

    // Check if a nutrition_plans record already exists for this client
    const { data: existingPlan, error: existingError } = await supabase
      .from('nutrition_plans')
      .select('id')
      .eq('client_id', clientId)
      .eq('status', 'active')
      .maybeSingle();

    let planId: string;

    if (existingPlan) {
      // Use existing plan
      planId = existingPlan.id;
    } else {
      // Create new nutrition_plans record with auth.uid() as created_by
      const { data: newPlan, error: planError } = await supabase
        .from('nutrition_plans')
        .insert({
          client_id: clientId,
          created_by: userId, // CRITICAL: Use auth.uid() not clientId
          plan_data: { type: 'nutrition', version: 1 },
          status: 'active',
        })
        .select('id')
        .single();

      if (planError || !newPlan) {
        console.error('Error creating nutrition plan:', planError);
        return { success: false, planId: null, versionId: null, error: planError?.message || 'Failed to create plan' };
      }

      planId = newPlan.id;
    }

    // Get the next version number
    const { data: versionCount } = await supabase
      .from('plan_versions')
      .select('version_number')
      .eq('plan_id', planId)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextVersionNumber = (versionCount?.version_number || 0) + 1;

    // Create the plan version with auth.uid() as created_by
    const planPayloadJson = JSON.parse(JSON.stringify(payload));
    
    const { data: newVersion, error: versionError } = await supabase
      .from('plan_versions')
      .insert({
        plan_id: planId,
        version_number: nextVersionNumber,
        created_by: userId, // CRITICAL: Use auth.uid()
        plan_payload: planPayloadJson,
        payload_hash: payloadHash,
        note: `Weekly meal plan v${nextVersionNumber}`,
      })
      .select('id')
      .single();

    if (versionError || !newVersion) {
      console.error('Error creating plan version:', versionError);
      return { success: false, planId, versionId: null, error: versionError?.message || 'Failed to create version' };
    }

    // Update the nutrition_plans to point to this version
    const { error: updateError } = await supabase
      .from('nutrition_plans')
      .update({ current_version_id: newVersion.id })
      .eq('id', planId);

    if (updateError) {
      console.error('Error updating current version:', updateError);
      // Non-fatal - the version was still created
    }

    return { success: true, planId, versionId: newVersion.id, error: null };
  } catch (error: any) {
    console.error('Failed to save nutrition plan:', error);
    return { success: false, planId: null, versionId: null, error: error.message };
  }
}

/**
 * Get all plan versions for a client (for history)
 */
export async function fetchPlanHistory(clientId: string): Promise<{
  versions: Array<{ id: string; versionNumber: number; createdAt: string; note: string | null }>;
  error: string | null;
}> {
  try {
    const { data: planData, error: planError } = await supabase
      .from('nutrition_plans')
      .select('id')
      .eq('client_id', clientId)
      .eq('status', 'active')
      .maybeSingle();

    if (planError || !planData) {
      return { versions: [], error: planError?.message || null };
    }

    const { data: versions, error: versionsError } = await supabase
      .from('plan_versions')
      .select('id, version_number, created_at, note')
      .eq('plan_id', planData.id)
      .eq('archived', false)
      .order('version_number', { ascending: false });

    if (versionsError) {
      return { versions: [], error: versionsError.message };
    }

    return {
      versions: (versions || []).map(v => ({
        id: v.id,
        versionNumber: v.version_number,
        createdAt: v.created_at,
        note: v.note,
      })),
      error: null,
    };
  } catch (error: any) {
    console.error('Failed to fetch plan history:', error);
    return { versions: [], error: error.message };
  }
}
