"use strict";
/**
 * Supabase Plan Service
 * Handles nutrition plan persistence with explicit locking workflow
 *
 * Key behavior:
 * - Plans are only persisted when explicitly locked
 * - Lock starts a configurable read-only period (see LOCK_DURATION_DAYS)
 * - Draft plans are NOT saved to DB
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveNutritionPlan = void 0;
exports.buildLockedPlanPayload = buildLockedPlanPayload;
exports.hashPlanPayload = hashPlanPayload;
exports.checkPlanLockStatus = checkPlanLockStatus;
exports.fetchCurrentPlan = fetchCurrentPlan;
exports.lockNutritionPlan = lockNutritionPlan;
exports.fetchPlanHistory = fetchPlanHistory;
const client_1 = require("@/integrations/supabase/client");
const profileService_1 = require("@/services/profileService");
const snapshot_1 = require("@/domain/nutrition/snapshot");
const constants_1 = require("@/domain/shared/constants");
const getErrorMessage = (error, fallback) => {
    return error instanceof Error ? error.message : fallback;
};
function buildLockedPlanPayload(input) {
    const lockedAt = input.lockedAt.toISOString();
    return {
        type: 'nutrition',
        generatedAt: lockedAt,
        lockedAt,
        macroTargets: input.macroTargets,
        weeklyPlan: input.weeklyPlan,
        realismConstraintHit: input.realismConstraintHit,
        constraintsHitDetails: input.constraintsHitDetails,
        likedIngredients: input.likedIngredients,
    };
}
// Simple hash function for payload deduplication
function hashPlanPayload(payload) {
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
 * Check if a plan is locked (within 7 days of lock creation)
 */
async function checkPlanLockStatus(clientId) {
    try {
        // Get the latest nutrition plan for this client
        const { data: planData, error: planError } = await client_1.supabase
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
        // Get the current version to check its creation date (lock starts on version creation)
        const { data: versionData, error: versionError } = await client_1.supabase
            .from('plan_versions')
            .select('created_at')
            .eq('id', planData.current_version_id)
            .maybeSingle();
        if (versionError || !versionData) {
            return { isLocked: false, lockedUntil: null, daysRemaining: 0 };
        }
        const versionCreatedAt = new Date(versionData.created_at);
        const lockEndDate = new Date(versionCreatedAt);
        lockEndDate.setDate(lockEndDate.getDate() + constants_1.LOCK_DURATION_DAYS);
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
    }
    catch (error) {
        console.error('Failed to check plan lock status:', error);
        return { isLocked: false, lockedUntil: null, daysRemaining: 0 };
    }
}
/**
 * Fetch the current active plan for a client
 */
async function fetchCurrentPlan(clientId) {
    try {
        // Get the active nutrition plan
        const { data: planData, error: planError } = await client_1.supabase
            .from('nutrition_plans')
            .select('id, current_version_id, created_at')
            .eq('client_id', clientId)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (planError) {
            console.error('Error fetching plan:', planError);
            return { plan: null, planId: null, versionId: null, createdAt: null, snapshot: null, payloadHash: null, versionNumber: null, error: planError.message };
        }
        if (!planData || !planData.current_version_id) {
            return { plan: null, planId: null, versionId: null, createdAt: null, snapshot: null, payloadHash: null, versionNumber: null, error: null };
        }
        // Get the current version payload, hash, and version number
        const { data: versionData, error: versionError } = await client_1.supabase
            .from('plan_versions')
            .select('plan_payload, locked_snapshot_json, created_at, payload_hash, version_number')
            .eq('id', planData.current_version_id)
            .maybeSingle();
        if (versionError || !versionData) {
            return { plan: null, planId: planData.id, versionId: null, createdAt: null, snapshot: null, payloadHash: null, versionNumber: null, error: versionError?.message || 'Version not found' };
        }
        return {
            plan: versionData.plan_payload,
            planId: planData.id,
            versionId: planData.current_version_id,
            createdAt: versionData.created_at,
            snapshot: versionData.locked_snapshot_json
                ? (0, snapshot_1.deepFreeze)(versionData.locked_snapshot_json)
                : null,
            payloadHash: versionData.payload_hash,
            versionNumber: versionData.version_number,
            error: null,
        };
    }
    catch (error) {
        console.error('Failed to fetch current plan:', error);
        return { plan: null, planId: null, versionId: null, createdAt: null, snapshot: null, payloadHash: null, versionNumber: null, error: getErrorMessage(error, 'Failed to fetch current plan') };
    }
}
/**
 * Lock a nutrition plan through the atomic Supabase RPC.
 * This is the ONLY client write path for locked plan versions.
 */
async function lockNutritionPlan(clientId, payload, lockedSnapshot, options) {
    try {
        // Ensure profile exists for FK constraint (critical for anonymous auth)
        const profileId = await (0, profileService_1.ensureProfileExists)();
        if (!profileId) {
            return {
                success: false,
                planId: null,
                versionId: null,
                versionNumber: null,
                error: 'Not authenticated. Please refresh the page.',
            };
        }
        const planPayloadJson = JSON.parse(JSON.stringify(payload));
        const snapshotJson = JSON.parse(JSON.stringify(lockedSnapshot));
        const payloadHash = hashPlanPayload(payload);
        const { data, error } = await client_1.supabase
            .rpc('lock_nutrition_plan', {
            p_client_id: clientId,
            p_version_id: options.versionId,
            p_plan_payload: planPayloadJson,
            p_locked_snapshot_json: snapshotJson,
            p_payload_hash: payloadHash,
            p_idempotency_key: options.idempotencyKey,
        })
            .single();
        if (error || !data) {
            console.error('Error locking nutrition plan atomically:', error);
            return {
                success: false,
                planId: null,
                versionId: null,
                versionNumber: null,
                error: error?.message || 'Failed to lock nutrition plan',
            };
        }
        if (!data.success || !data.version_id) {
            return {
                success: false,
                planId: data.plan_id ?? null,
                versionId: data.version_id ?? null,
                versionNumber: data.version_number ?? null,
                error: data.error ?? 'Failed to lock nutrition plan',
            };
        }
        return {
            success: true,
            planId: data.plan_id,
            versionId: data.version_id,
            versionNumber: data.version_number,
            error: null,
        };
    }
    catch (error) {
        console.error('Failed to lock nutrition plan:', error);
        return {
            success: false,
            planId: null,
            versionId: null,
            versionNumber: null,
            error: getErrorMessage(error, 'Failed to lock nutrition plan'),
        };
    }
}
/**
 * Get all plan versions for a client (for history)
 */
async function fetchPlanHistory(clientId) {
    try {
        const { data: planData, error: planError } = await client_1.supabase
            .from('nutrition_plans')
            .select('id')
            .eq('client_id', clientId)
            .eq('status', 'active')
            .maybeSingle();
        if (planError || !planData) {
            return { versions: [], error: planError?.message || null };
        }
        const { data: versions, error: versionsError } = await client_1.supabase
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
    }
    catch (error) {
        console.error('Failed to fetch plan history:', error);
        return { versions: [], error: getErrorMessage(error, 'Failed to fetch plan history') };
    }
}
// Legacy function alias for backward compatibility
exports.saveNutritionPlan = lockNutritionPlan;
