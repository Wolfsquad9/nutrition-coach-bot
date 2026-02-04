/**
 * useNutritionPlanState - State machine for nutrition plan lifecycle
 * 
 * Explicit states (Draft → Lock lifecycle):
 * - EMPTY: No plan exists for client, ready for generation
 * - DRAFT: Plan generated locally but not yet locked (coach can regenerate)
 * - LOCKED: Plan persisted and locked for 7 days (read-only)
 * - LOADING: Fetching plan from DB
 * - SAVING: Persisting plan to DB (during lock operation)
 * - ERROR: An error occurred
 * 
 * Key behavior:
 * - Generation creates a DRAFT (not persisted)
 * - Explicit "Lock Plan" action persists and locks the plan
 * - Only LOCKED plans are saved to Supabase
 * - Lock expires after 7 days, allowing new draft creation
 */

import { useState, useCallback } from 'react';
import type { WeeklyMealPlanResult } from '@/services/recipeService';
import {
  checkPlanLockStatus,
  fetchCurrentPlan,
  lockNutritionPlan,
  type PlanPayload,
  type PlanLockStatus,
} from '@/services/supabasePlanService';
import {
  fetchPendingOverrides,
  type PlanOverride,
} from '@/services/supabaseOverrideService';

// Explicit plan lifecycle states (Draft → Lock)
export type PlanState = 'EMPTY' | 'DRAFT' | 'LOCKED' | 'LOADING' | 'SAVING' | 'ERROR';

export interface NutritionPlanStateContext {
  // Current lifecycle state
  state: PlanState;
  
  // Plan data (from DB when LOCKED, from generation when DRAFT)
  weeklyPlan: WeeklyMealPlanResult | null;
  macroTargets: { calories: number; protein: number; carbs: number; fat: number } | null;
  likedIngredients: string[];
  
  // DB metadata (only present when LOCKED)
  planId: string | null;
  versionId: string | null;
  planCreatedAt: string | null;
  
  // Lock status
  lockStatus: PlanLockStatus;
  pendingOverrides: PlanOverride[];
  
  // Error
  error: string | null;
  
  // Persistence failure tracking - blocks zombie state
  lastPersistenceFailed: boolean;
  
  // Derived booleans for easy UI rendering
  isEmpty: boolean;
  isDraft: boolean;
  isLocked: boolean;
  isLoading: boolean;
  isSaving: boolean;
  isError: boolean;
  canGenerate: boolean; // Can create/regenerate a draft
  canLock: boolean;     // Can lock the current draft
  isBlocked: boolean;   // True if persistence failed - blocks operations
  
  // Legacy compatibility
  isPersisted: boolean;
}

export interface NutritionPlanStateActions {
  // Load plan from DB for a client
  loadPlanForClient: (clientId: string) => Promise<void>;
  
  // Set a draft plan (after generation - NOT persisted)
  setDraftPlan: (
    weeklyPlan: WeeklyMealPlanResult,
    macroTargets: { calories: number; protein: number; carbs: number; fat: number },
    likedIngredients: string[]
  ) => void;
  
  // Lock the current draft (persists to DB and starts 7-day lock)
  lockPlan: (clientId: string) => Promise<{ success: boolean; error: string | null }>;
  
  // Clear all state (on client switch)
  clearState: () => void;
  
  // Reset error state
  clearError: () => void;
  
  // Discard draft and revert to previous state
  discardDraft: (clientId: string) => Promise<void>;
}

export function useNutritionPlanState(): NutritionPlanStateContext & NutritionPlanStateActions {
  // Core state
  const [state, setState] = useState<PlanState>('EMPTY');
  const [weeklyPlan, setWeeklyPlan] = useState<WeeklyMealPlanResult | null>(null);
  const [macroTargets, setMacroTargets] = useState<{ calories: number; protein: number; carbs: number; fat: number } | null>(null);
  const [likedIngredients, setLikedIngredients] = useState<string[]>([]);
  
  // DB metadata
  const [planId, setPlanId] = useState<string | null>(null);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [planCreatedAt, setPlanCreatedAt] = useState<string | null>(null);
  
  // Lock status
  const [lockStatus, setLockStatus] = useState<PlanLockStatus>({
    isLocked: false,
    lockedUntil: null,
    daysRemaining: 0,
  });
  const [pendingOverrides, setPendingOverrides] = useState<PlanOverride[]>([]);
  
  // Error and persistence failure tracking
  const [error, setError] = useState<string | null>(null);
  const [lastPersistenceFailed, setLastPersistenceFailed] = useState(false);

  // Derived state
  const isEmpty = state === 'EMPTY';
  const isDraft = state === 'DRAFT';
  const isLocked = state === 'LOCKED';
  const isLoading = state === 'LOADING';
  const isSaving = state === 'SAVING';
  const isError = state === 'ERROR';
  
  // Legacy compatibility
  const isPersisted = isLocked;
  
  // CRITICAL: Block operations if last persistence failed (zombie state prevention)
  const isBlocked = lastPersistenceFailed || state === 'ERROR';
  
  // Can generate if not blocked, not loading/saving
  // In DRAFT state: can regenerate freely
  // In LOCKED state: only if lock has expired
  // In EMPTY state: can generate
  const canGenerate = !isBlocked && !isLoading && !isSaving && (
    state === 'EMPTY' || 
    state === 'DRAFT' || 
    (state === 'LOCKED' && !lockStatus.isLocked) // Lock expired
  );
  
  // Can only lock if in DRAFT state with valid plan data
  const canLock = state === 'DRAFT' && !!weeklyPlan && !!macroTargets && !isBlocked;

  /**
   * Load plan from database for a given client
   */
  const loadPlanForClient = useCallback(async (clientId: string) => {
    if (!clientId) {
      setState('EMPTY');
      return;
    }

    setState('LOADING');
    setError(null);

    try {
      // Fetch current plan and lock status in parallel
      const [planResult, lockResult] = await Promise.all([
        fetchCurrentPlan(clientId),
        checkPlanLockStatus(clientId),
      ]);

      if (planResult.error) {
        console.error('Error loading plan:', planResult.error);
        setError(planResult.error);
        setState('ERROR');
        return;
      }

      setLockStatus(lockResult);

      if (!planResult.plan) {
        // No plan exists for this client
        setWeeklyPlan(null);
        setMacroTargets(null);
        setLikedIngredients([]);
        setPlanId(null);
        setVersionId(null);
        setPlanCreatedAt(null);
        setPendingOverrides([]);
        setState('EMPTY');
        return;
      }

      // Plan exists - hydrate state from DB
      const payload = planResult.plan;
      setWeeklyPlan(payload.weeklyPlan);
      setMacroTargets(payload.macroTargets);
      setLikedIngredients(payload.likedIngredients || []);
      setPlanId(planResult.planId);
      setVersionId(planResult.versionId);
      setPlanCreatedAt(planResult.createdAt);
      
      // Persisted plans are LOCKED (lock may have expired but data came from DB)
      setState('LOCKED');

      // Fetch pending overrides if we have a version
      if (planResult.versionId) {
        const overridesResult = await fetchPendingOverrides(planResult.versionId);
        if (!overridesResult.error) {
          setPendingOverrides(overridesResult.overrides);
        }
      }
    } catch (err: any) {
      console.error('Error in loadPlanForClient:', err);
      setError(err.message || 'Failed to load plan');
      setState('ERROR');
    }
  }, []);

  /**
   * Set a draft plan (after local generation - NOT persisted to DB)
   * Coach can regenerate freely while in DRAFT state
   */
  const setDraftPlan = useCallback((
    newWeeklyPlan: WeeklyMealPlanResult,
    newMacroTargets: { calories: number; protein: number; carbs: number; fat: number },
    newLikedIngredients: string[]
  ) => {
    setWeeklyPlan(newWeeklyPlan);
    setMacroTargets(newMacroTargets);
    setLikedIngredients(newLikedIngredients);
    // Clear DB metadata since this is a new draft (NOT persisted)
    setPlanId(null);
    setVersionId(null);
    setPlanCreatedAt(null);
    setState('DRAFT');
    setError(null);
    // Reset lock status for draft
    setLockStatus({ isLocked: false, lockedUntil: null, daysRemaining: 0 });
  }, []);

  /**
   * Lock the current draft plan - persists to DB and starts 7-day lock
   */
  const lockPlan = useCallback(async (clientId: string): Promise<{ success: boolean; error: string | null }> => {
    if (state !== 'DRAFT' || !weeklyPlan || !macroTargets) {
      return { success: false, error: 'Aucun brouillon à verrouiller' };
    }

    setState('SAVING');
    setError(null);

    try {
      const result = await lockNutritionPlan(
        clientId,
        weeklyPlan,
        macroTargets,
        likedIngredients
      );

      if (!result.success) {
        // CRITICAL: Track persistence failure to block zombie state
        setLastPersistenceFailed(true);
        setError(result.error);
        setState('ERROR');
        return { success: false, error: result.error };
      }

      // Success - clear failure flag
      setLastPersistenceFailed(false);
      
      // Reload from DB to get fresh state with IDs and lock status
      await loadPlanForClient(clientId);
      return { success: true, error: null };
    } catch (err: any) {
      console.error('Error locking plan:', err);
      const errorMsg = err.message || 'Échec du verrouillage';
      setLastPersistenceFailed(true);
      setError(errorMsg);
      setState('ERROR');
      return { success: false, error: errorMsg };
    }
  }, [state, weeklyPlan, macroTargets, likedIngredients, loadPlanForClient]);

  /**
   * Discard draft and revert to previous state
   */
  const discardDraft = useCallback(async (clientId: string) => {
    if (state !== 'DRAFT') return;
    
    // Clear draft data
    setWeeklyPlan(null);
    setMacroTargets(null);
    setLikedIngredients([]);
    setPlanId(null);
    setVersionId(null);
    setPlanCreatedAt(null);
    setError(null);
    
    // Reload from DB (will be EMPTY if no persisted plan, or LOCKED if one exists)
    await loadPlanForClient(clientId);
  }, [state, loadPlanForClient]);

  /**
   * Clear all state (on client switch)
   */
  const clearState = useCallback(() => {
    setWeeklyPlan(null);
    setMacroTargets(null);
    setLikedIngredients([]);
    setPlanId(null);
    setVersionId(null);
    setPlanCreatedAt(null);
    setLockStatus({ isLocked: false, lockedUntil: null, daysRemaining: 0 });
    setPendingOverrides([]);
    setError(null);
    setLastPersistenceFailed(false);
    setState('EMPTY');
  }, []);

  /**
   * Clear error state and unblock operations
   */
  const clearError = useCallback(() => {
    setError(null);
    setLastPersistenceFailed(false);
    if (state === 'ERROR') {
      setState('EMPTY');
    }
  }, [state]);

  return {
    // State
    state,
    weeklyPlan,
    macroTargets,
    likedIngredients,
    planId,
    versionId,
    planCreatedAt,
    lockStatus,
    pendingOverrides,
    error,
    lastPersistenceFailed,
    
    // Derived
    isEmpty,
    isDraft,
    isLocked,
    isLoading,
    isSaving,
    isError,
    canGenerate,
    canLock,
    isBlocked,
    isPersisted, // Legacy compatibility
    
    // Actions
    loadPlanForClient,
    setDraftPlan,
    lockPlan,
    clearState,
    clearError,
    discardDraft,
  };
}
