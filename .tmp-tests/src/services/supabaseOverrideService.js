"use strict";
/**
 * Supabase Override Service
 * Handles ingredient substitution suggestions without mutating immutable plans
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOverride = createOverride;
exports.fetchPendingOverrides = fetchPendingOverrides;
exports.fetchClientOverrides = fetchClientOverrides;
exports.approveOverride = approveOverride;
exports.archiveOverride = archiveOverride;
const client_1 = require("@/integrations/supabase/client");
const useAuth_1 = require("@/hooks/useAuth");
/**
 * Create a new override suggestion
 */
async function createOverride(params) {
    try {
        // Get current user ID for FK ownership
        const userId = await (0, useAuth_1.getCurrentUserId)();
        if (!userId) {
            return { override: null, error: 'Not authenticated. Please refresh the page.' };
        }
        const { data, error } = await client_1.supabase
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
            created_by: userId, // CRITICAL: Use auth.uid()
        })
            .select()
            .single();
        if (error) {
            console.error('Error creating override:', error);
            return { override: null, error: error instanceof Error ? error.message : 'Unknown error' };
        }
        return {
            override: mapRowToOverride(data),
            error: null,
        };
    }
    catch (error) {
        console.error('Failed to create override:', error);
        return { override: null, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}
/**
 * Fetch all pending (non-approved) overrides for a plan version
 */
async function fetchPendingOverrides(planVersionId) {
    try {
        const { data, error } = await client_1.supabase
            .from('plan_overrides')
            .select('*')
            .eq('plan_version_id', planVersionId)
            .is('approved_by', null)
            .eq('archived', false)
            .order('created_at', { ascending: false });
        if (error) {
            console.error('Error fetching pending overrides:', error);
            return { overrides: [], error: error instanceof Error ? error.message : 'Unknown error' };
        }
        return {
            overrides: (data || []).map(mapRowToOverride),
            error: null,
        };
    }
    catch (error) {
        console.error('Failed to fetch pending overrides:', error);
        return { overrides: [], error: error instanceof Error ? error.message : 'Unknown error' };
    }
}
/**
 * Fetch all overrides for a client (across all plan versions)
 */
async function fetchClientOverrides(clientId) {
    try {
        const { data, error } = await client_1.supabase
            .from('plan_overrides')
            .select('*')
            .eq('client_id', clientId)
            .eq('archived', false)
            .order('created_at', { ascending: false });
        if (error) {
            console.error('Error fetching client overrides:', error);
            return { overrides: [], error: error instanceof Error ? error.message : 'Unknown error' };
        }
        return {
            overrides: (data || []).map(mapRowToOverride),
            error: null,
        };
    }
    catch (error) {
        console.error('Failed to fetch client overrides:', error);
        return { overrides: [], error: error instanceof Error ? error.message : 'Unknown error' };
    }
}
/**
 * Approve an override (by coach)
 */
async function approveOverride(overrideId, approverId) {
    try {
        const { error } = await client_1.supabase
            .from('plan_overrides')
            .update({ approved_by: approverId })
            .eq('id', overrideId);
        if (error) {
            console.error('Error approving override:', error);
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
        return { success: true, error: null };
    }
    catch (error) {
        console.error('Failed to approve override:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}
/**
 * Archive (soft delete) an override
 */
async function archiveOverride(overrideId) {
    try {
        const { error } = await client_1.supabase
            .from('plan_overrides')
            .update({ archived: true })
            .eq('id', overrideId);
        if (error) {
            console.error('Error archiving override:', error);
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
        return { success: true, error: null };
    }
    catch (error) {
        console.error('Failed to archive override:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}
// Helper to map DB row to typed object
function mapRowToOverride(row) {
    return {
        id: row.id,
        planVersionId: row.plan_version_id,
        clientId: row.client_id,
        mealType: row.meal_type,
        originalIngredient: row.original_ingredient,
        replacementIngredient: row.replacement_ingredient,
        macroDelta: row.macro_delta,
        withinTolerance: row.within_tolerance,
        suggestedBy: row.suggested_by,
        approvedBy: row.approved_by,
        createdAt: row.created_at,
        archived: row.archived,
        requiresRecipeRegeneration: row.requires_recipe_regeneration,
    };
}
