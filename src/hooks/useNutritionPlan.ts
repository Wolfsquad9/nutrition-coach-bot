/**
 * Hook for managing nutrition plans with Supabase persistence
 */

import { useState, useEffect, useCallback } from 'react';
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

interface UseNutritionPlanResult {
  currentPlan: PlanPayload | null;
  planId: string | null;
  versionId: string | null;
  planCreatedAt: string | null;
  lockStatus: PlanLockStatus;
  pendingOverrides: PlanOverride[];
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  isPersisted: boolean;
  loadPlan: (clientId: string) => Promise<void>;
  savePlan: (
    clientId: string,
    weeklyPlan: WeeklyMealPlanResult,
    macroTargets: { calories: number; protein: number; carbs: number; fat: number },
    likedIngredients: string[],
    realismConstraintHit?: boolean,
    constraintsHitDetails?: string[]
  ) => Promise<{ success: boolean; error: string | null }>;
  clearPlan: () => void;
}

export function useNutritionPlan(): UseNutritionPlanResult {
  const [currentPlan, setCurrentPlan] = useState<PlanPayload | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [planCreatedAt, setPlanCreatedAt] = useState<string | null>(null);
  const [lockStatus, setLockStatus] = useState<PlanLockStatus>({
    isLocked: false,
    lockedUntil: null,
    daysRemaining: 0,
  });
  const [pendingOverrides, setPendingOverrides] = useState<PlanOverride[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPersisted, setIsPersisted] = useState(false);

  const loadPlan = useCallback(async (clientId: string) => {
    if (!clientId) return;
    
    setIsLoading(true);
    setError(null);

    try {
      // Fetch current plan and lock status in parallel
      const [planResult, lockResult] = await Promise.all([
        fetchCurrentPlan(clientId),
        checkPlanLockStatus(clientId),
      ]);

      if (planResult.error) {
        setError(planResult.error);
      }

      setCurrentPlan(planResult.plan);
      setPlanId(planResult.planId);
      setVersionId(planResult.versionId);
      setPlanCreatedAt(planResult.createdAt);
      setLockStatus(lockResult);
      setIsPersisted(!!planResult.plan);

      // If we have a version, fetch pending overrides
      if (planResult.versionId) {
        const overridesResult = await fetchPendingOverrides(planResult.versionId);
        if (!overridesResult.error) {
          setPendingOverrides(overridesResult.overrides);
        }
      }
    } catch (err: any) {
      console.error('Error loading plan:', err);
      setError(err.message || 'Failed to load plan');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const savePlan = useCallback(async (
    clientId: string,
    weeklyPlan: WeeklyMealPlanResult,
    macroTargets: { calories: number; protein: number; carbs: number; fat: number },
    likedIngredients: string[],
    realismConstraintHit?: boolean,
    constraintsHitDetails?: string[]
  ): Promise<{ success: boolean; error: string | null }> => {
    setIsSaving(true);
    setError(null);

    try {
      const result = await saveNutritionPlan(
        clientId,
        weeklyPlan,
        macroTargets,
        likedIngredients,
        realismConstraintHit,
        constraintsHitDetails
      );

      if (!result.success) {
        setError(result.error);
        return { success: false, error: result.error };
      }

      // Reload the plan to get fresh data
      await loadPlan(clientId);
      setIsPersisted(true);

      return { success: true, error: null };
    } catch (err: any) {
      console.error('Error saving plan:', err);
      const errorMsg = err.message || 'Failed to save plan';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setIsSaving(false);
    }
  }, [loadPlan]);

  const clearPlan = useCallback(() => {
    setCurrentPlan(null);
    setPlanId(null);
    setVersionId(null);
    setPlanCreatedAt(null);
    setLockStatus({ isLocked: false, lockedUntil: null, daysRemaining: 0 });
    setPendingOverrides([]);
    setIsPersisted(false);
    setError(null);
  }, []);

  return {
    currentPlan,
    planId,
    versionId,
    planCreatedAt,
    lockStatus,
    pendingOverrides,
    isLoading,
    isSaving,
    error,
    isPersisted,
    loadPlan,
    savePlan,
    clearPlan,
  };
}
