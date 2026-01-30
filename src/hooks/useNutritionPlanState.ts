/**
 * useNutritionPlanState - State machine for nutrition plan lifecycle
 * 
 * Explicit states:
 * - EMPTY: No plan exists for client, ready for generation
 * - DRAFT: Plan generated locally but not yet persisted
 * - PERSISTED: Plan saved to DB, reloadable across sessions
 * - LOADING: Fetching plan from DB
 * - SAVING: Persisting plan to DB
 * - ERROR: An error occurred
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { WeeklyMealPlanResult } from '@/services/recipeService';
import {
  checkPlanLockStatus,
  fetchCurrentPlan,
  saveNutritionPlan,
  type PlanPayload,
  type PlanLockStatus,
} from '@/services/supabasePlanService';
import {
  fetchPendingOverrides,
  type PlanOverride,
} from '@/services/supabaseOverrideService';

// Explicit plan lifecycle states
export type PlanState = 'EMPTY' | 'DRAFT' | 'PERSISTED' | 'LOADING' | 'SAVING' | 'ERROR';

export interface NutritionPlanStateContext {
  // Current lifecycle state
  state: PlanState;
  
  // Plan data (from DB when PERSISTED, from generation when DRAFT)
  weeklyPlan: WeeklyMealPlanResult | null;
  macroTargets: { calories: number; protein: number; carbs: number; fat: number } | null;
  likedIngredients: string[];
  
  // DB metadata (only present when PERSISTED)
  planId: string | null;
  versionId: string | null;
  planCreatedAt: string | null;
  
  // Lock status
  lockStatus: PlanLockStatus;
  pendingOverrides: PlanOverride[];
  
  // Error
  error: string | null;
  
  // Derived booleans for easy UI rendering
  isEmpty: boolean;
  isDraft: boolean;
  isPersisted: boolean;
  isLoading: boolean;
  isSaving: boolean;
  canGenerate: boolean;
  canSave: boolean;
}

export interface NutritionPlanStateActions {
  // Load plan from DB for a client
  loadPlanForClient: (clientId: string) => Promise<void>;
  
  // Set a draft plan (after generation, before save)
  setDraftPlan: (
    weeklyPlan: WeeklyMealPlanResult,
    macroTargets: { calories: number; protein: number; carbs: number; fat: number },
    likedIngredients: string[]
  ) => void;
  
  // Persist the current draft to DB
  persistPlan: (clientId: string) => Promise<{ success: boolean; error: string | null }>;
  
  // Generate and immediately persist (for auto-save flow)
  generateAndPersist: (
    clientId: string,
    weeklyPlan: WeeklyMealPlanResult,
    macroTargets: { calories: number; protein: number; carbs: number; fat: number },
    likedIngredients: string[]
  ) => Promise<{ success: boolean; error: string | null }>;
  
  // Clear all state (on client switch)
  clearState: () => void;
  
  // Reset error state
  clearError: () => void;
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
  
  // Error
  const [error, setError] = useState<string | null>(null);

  // Derived state
  const isEmpty = state === 'EMPTY';
  const isDraft = state === 'DRAFT';
  const isPersisted = state === 'PERSISTED';
  const isLoading = state === 'LOADING';
  const isSaving = state === 'SAVING';
  const canGenerate = (state === 'EMPTY' || state === 'PERSISTED') && !lockStatus.isLocked;
  const canSave = state === 'DRAFT';

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
      setState('PERSISTED');

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
   * Set a draft plan (after local generation, before save)
   */
  const setDraftPlan = useCallback((
    newWeeklyPlan: WeeklyMealPlanResult,
    newMacroTargets: { calories: number; protein: number; carbs: number; fat: number },
    newLikedIngredients: string[]
  ) => {
    setWeeklyPlan(newWeeklyPlan);
    setMacroTargets(newMacroTargets);
    setLikedIngredients(newLikedIngredients);
    // Clear DB metadata since this is a new draft
    setPlanId(null);
    setVersionId(null);
    setPlanCreatedAt(null);
    setState('DRAFT');
    setError(null);
  }, []);

  /**
   * Persist the current draft plan to DB
   */
  const persistPlan = useCallback(async (clientId: string): Promise<{ success: boolean; error: string | null }> => {
    if (state !== 'DRAFT' || !weeklyPlan || !macroTargets) {
      return { success: false, error: 'No draft plan to persist' };
    }

    setState('SAVING');
    setError(null);

    try {
      const result = await saveNutritionPlan(
        clientId,
        weeklyPlan,
        macroTargets,
        likedIngredients
      );

      if (!result.success) {
        setError(result.error);
        setState('DRAFT'); // Revert to draft on failure
        return { success: false, error: result.error };
      }

      // Reload from DB to get fresh state
      await loadPlanForClient(clientId);
      return { success: true, error: null };
    } catch (err: any) {
      console.error('Error persisting plan:', err);
      const errorMsg = err.message || 'Failed to save plan';
      setError(errorMsg);
      setState('DRAFT');
      return { success: false, error: errorMsg };
    }
  }, [state, weeklyPlan, macroTargets, likedIngredients, loadPlanForClient]);

  /**
   * Generate and immediately persist (auto-save flow)
   */
  const generateAndPersist = useCallback(async (
    clientId: string,
    newWeeklyPlan: WeeklyMealPlanResult,
    newMacroTargets: { calories: number; protein: number; carbs: number; fat: number },
    newLikedIngredients: string[]
  ): Promise<{ success: boolean; error: string | null }> => {
    setState('SAVING');
    setError(null);

    // Optimistically set the plan data
    setWeeklyPlan(newWeeklyPlan);
    setMacroTargets(newMacroTargets);
    setLikedIngredients(newLikedIngredients);

    try {
      const result = await saveNutritionPlan(
        clientId,
        newWeeklyPlan,
        newMacroTargets,
        newLikedIngredients
      );

      if (!result.success) {
        setError(result.error);
        setState('DRAFT'); // Fall back to draft on failure
        return { success: false, error: result.error };
      }

      // Reload from DB to get fresh state with IDs
      await loadPlanForClient(clientId);
      return { success: true, error: null };
    } catch (err: any) {
      console.error('Error in generateAndPersist:', err);
      const errorMsg = err.message || 'Failed to save plan';
      setError(errorMsg);
      setState('DRAFT');
      return { success: false, error: errorMsg };
    }
  }, [loadPlanForClient]);

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
    setState('EMPTY');
  }, []);

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    setError(null);
    if (state === 'ERROR') {
      setState(weeklyPlan ? 'PERSISTED' : 'EMPTY');
    }
  }, [state, weeklyPlan]);

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
    
    // Derived
    isEmpty,
    isDraft,
    isPersisted,
    isLoading,
    isSaving,
    canGenerate,
    canSave,
    
    // Actions
    loadPlanForClient,
    setDraftPlan,
    persistPlan,
    generateAndPersist,
    clearState,
    clearError,
  };
}
