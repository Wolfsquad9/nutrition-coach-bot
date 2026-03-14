/**
 * useNutritionPlanState - State machine for nutrition plan lifecycle
 */

import { useState, useCallback, useMemo } from "react";
import type { WeeklyMealPlanResult } from "@/services/recipeService";
import type { PlanSnapshot } from "@/types/planSnapshot";

import {
  checkPlanLockStatus,
  fetchCurrentPlan,
  lockNutritionPlan,
} from "@/services/supabasePlanService";

import {
  fetchPendingOverrides,
  type PlanOverride,
} from "@/services/supabaseOverrideService";

import {
  fetchPersistedSnapshot,
  persistSnapshot,
} from "@/services/snapshotPersistence";

import {
  buildPlanSnapshot,
  type SnapshotBuildInput,
} from "@/domain/nutrition/snapshot";

import {
  mapWeeklyMealPlanToSnapshot,
  buildGroceryListFromPlan,
} from "@/domain/nutrition/snapshotAdapter";

import {
  derivePlanState,
  calculateDaysRemaining,
  calculateLockExpiry,
  canLock as domainCanLock,
  canRegenerate as domainCanRegenerate,
  isImmutable as domainIsImmutable,
  isActionPermitted,
  validateImmutability,
  checkShareability,
  type PlanLifecycleState,
  type PlanStateContext,
} from "@/domain/nutrition/planLifecycle";

export type UIState = "IDLE" | "LOADING" | "SAVING" | "ERROR";
export type PlanState = PlanLifecycleState | "LOADING" | "SAVING" | "ERROR";

export interface LockStatus {
  isLocked: boolean;
  daysRemaining: number;
}

export interface LockClientInfo {
  firstName: string;
  lastName: string;
  goal: string;
  activityLevel: string;
}

const getErrorMessage = (error: unknown, fallback: string): string => {
  return error instanceof Error ? error.message : fallback;
};

export function useNutritionPlanState() {
  /* ---------------- UI STATE ---------------- */

  const [uiState, setUiState] = useState<UIState>("IDLE");
  const [error, setError] = useState<string | null>(null);
  const [lastPersistenceFailed, setLastPersistenceFailed] = useState(false);

  /* ---------------- PLAN DATA ---------------- */

  const [weeklyPlan, setWeeklyPlan] = useState<WeeklyMealPlanResult | null>(null);
  const [macroTargets, setMacroTargets] = useState<any | null>(null);
  const [likedIngredients, setLikedIngredients] = useState<string[]>([]);

  /* ---------------- SNAPSHOT ---------------- */

  const [snapshot, setSnapshot] = useState<PlanSnapshot | null>(null);

  /* ---------------- DB METADATA ---------------- */

  const [planId, setPlanId] = useState<string | null>(null);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [versionNumber, setVersionNumber] = useState<number | null>(null);
  const [planCreatedAt, setPlanCreatedAt] = useState<string | null>(null);
  const [payloadHash, setPayloadHash] = useState<string | null>(null);

  /* ---------------- LOCK ---------------- */

  const [lockedAt, setLockedAt] = useState<Date | null>(null);
  const [lockedUntil, setLockedUntil] = useState<Date | null>(null);

  /* ---------------- OVERRIDES ---------------- */

  const [pendingOverrides, setPendingOverrides] = useState<PlanOverride[]>([]);

  /* ---------------- LIFECYCLE ---------------- */

  const lifecycleState = useMemo<PlanLifecycleState>(() => {
    return derivePlanState({
      hasPlan: !!weeklyPlan,
      isPersisted: !!versionId,
      lockedAt,
    });
  }, [weeklyPlan, versionId, lockedAt]);

  const daysRemaining = useMemo(() => {
    if (!lockedAt) return 0;
    return calculateDaysRemaining(lockedAt);
  }, [lockedAt]);

  const lockStatus: LockStatus = useMemo(() => {
    return {
      isLocked: !!lockedAt && daysRemaining > 0,
      daysRemaining,
    };
  }, [lockedAt, daysRemaining]);

  /* ---------------- UI FLAGS ---------------- */

  const isLoading = uiState === "LOADING";
  const isSaving = uiState === "SAVING";
  const isBlocked = uiState === "ERROR";
  const isError = uiState === "ERROR";

  const isDraft = lifecycleState === "DRAFT";
  const isLocked = lifecycleState === "LOCKED";

  const state: PlanState =
    uiState === "LOADING"
      ? "LOADING"
      : uiState === "SAVING"
      ? "SAVING"
      : uiState === "ERROR"
      ? "ERROR"
      : lifecycleState;

  const planStateContext: PlanStateContext = {
    state: lifecycleState,
    planId,
    versionId,
    versionNumber,
    lockedAt,
    lockedUntil,
    daysRemaining,
    payloadHash,
  };

  /* ---------------- PERMISSIONS ---------------- */

  const canGenerate =
    !lastPersistenceFailed &&
    uiState === "IDLE" &&
    (lifecycleState === "EMPTY" || lifecycleState === "EXPIRED");

  const canRegenerate =
    !lastPersistenceFailed &&
    uiState === "IDLE" &&
    domainCanRegenerate(lifecycleState);

  const canLock =
    !lastPersistenceFailed &&
    uiState === "IDLE" &&
    domainCanLock(lifecycleState) &&
    !!weeklyPlan &&
    !!macroTargets;

  const canDiscard =
    !lastPersistenceFailed &&
    uiState === "IDLE" &&
    isActionPermitted(lifecycleState, "DISCARD");

  const canPrint = isActionPermitted(lifecycleState, "PRINT");
  const canShare = isActionPermitted(lifecycleState, "SHARE");

  const isImmutable = domainIsImmutable(lifecycleState);

  const shareabilityCheck = checkShareability(planStateContext);
  const isShareable = shareabilityCheck.isShareable;

  /* ---------------- LOAD PLAN ---------------- */

  const loadPlanForClient = useCallback(async (clientId: string) => {
    if (!clientId) return;

    setUiState("LOADING");
    setError(null);

    try {
      const [planResult, lockResult] = await Promise.all([
        fetchCurrentPlan(clientId),
        checkPlanLockStatus(clientId),
      ]);

      if (!planResult.plan) {
        clearState();
        setUiState("IDLE");
        return;
      }

      const payload = planResult.plan;

      setWeeklyPlan(payload.weeklyPlan);
      setMacroTargets(payload.macroTargets);
      setLikedIngredients(payload.likedIngredients || []);

      setPlanId(planResult.planId);
      setVersionId(planResult.versionId);
      setPlanCreatedAt(planResult.createdAt);
      setPayloadHash(payload.payloadHash || null);

      const planLockedAt = payload.lockedAt ? new Date(payload.lockedAt) : null;

      setLockedAt(planLockedAt);

      if (planLockedAt) {
        setLockedUntil(calculateLockExpiry(planLockedAt));
      } else {
        setLockedUntil(lockResult.lockedUntil);
      }

      if (planResult.versionId) {
        const [overridesResult, snapshotResult] = await Promise.all([
          fetchPendingOverrides(planResult.versionId),
          fetchPersistedSnapshot(planResult.versionId),
        ]);

        if (!overridesResult.error) {
          setPendingOverrides(overridesResult.overrides);
        }

        setSnapshot(snapshotResult.snapshot || null);
      }

      setUiState("IDLE");
    } catch (err) {
      console.error(err);
      setError(getErrorMessage(err, "Failed to load plan"));
      setUiState("ERROR");
    }
  }, []);

  /* ---------------- DRAFT ---------------- */

  const setDraftPlan = useCallback(
    (plan: WeeklyMealPlanResult, macros: any, ingredients: string[]) => {
      const validation = validateImmutability(lifecycleState, "REGENERATE");
      if (!validation.valid) return;

      setWeeklyPlan(plan);
      setMacroTargets(macros);
      setLikedIngredients(ingredients);

      setPlanId(null);
      setVersionId(null);
      setVersionNumber(null);
      setPlanCreatedAt(null);
      setPayloadHash(null);
      setLockedAt(null);
      setLockedUntil(null);
      setSnapshot(null);
    },
    [lifecycleState]
  );

  /* ---------------- LOCK ---------------- */

  const lockPlan = useCallback(
    async (clientId: string, clientInfo: LockClientInfo) => {
      if (!domainCanLock(lifecycleState) || !weeklyPlan || !macroTargets) {
        return { success: false, error: "Aucun brouillon à verrouiller" };
      }

      setUiState("SAVING");

      try {
        const result = await lockNutritionPlan(
          clientId,
          weeklyPlan,
          macroTargets,
          likedIngredients
        );

if (!result.success || !result.versionId) {
  setUiState("ERROR");
  return { success: false, error: result.error };
}

try {
  const snapshotInput: SnapshotBuildInput = {
    weeklyPlan,
    macroTargets,
    likedIngredients,
    versionId: result.versionId,
  };

  const builtSnapshot = buildPlanSnapshot(snapshotInput);

  const persistResult = await persistSnapshot(result.versionId, builtSnapshot);

  if (!persistResult.success) {
    setLastPersistenceFailed(true);
    setUiState("ERROR");
    return { success: false, error: persistResult.error };
  }

  setLastPersistenceFailed(false);

} catch (err) {
  setLastPersistenceFailed(true);
  setUiState("ERROR");
  return { success: false, error: getErrorMessage(err, "Snapshot persistence failed") };
}

await loadPlanForClient(clientId);

return { success: true, error: null };
      } catch (err) {
        setUiState("ERROR");
        return { success: false, error: getErrorMessage(err, "Lock failed") };
      }
    },
    [weeklyPlan, macroTargets, likedIngredients, lifecycleState, loadPlanForClient]
  );

  /* ---------------- CLEAR ---------------- */

  const clearState = useCallback(() => {
    setWeeklyPlan(null);
    setMacroTargets(null);
    setLikedIngredients([]);
    setSnapshot(null);

    setPlanId(null);
    setVersionId(null);
    setVersionNumber(null);
    setPlanCreatedAt(null);
    setPayloadHash(null);

    setLockedAt(null);
    setLockedUntil(null);

    setPendingOverrides([]);

    setError(null);
    setLastPersistenceFailed(false);
    setUiState("IDLE");
  }, []);

  /* ---------------- RETURN ---------------- */

  return {
    state,
    lifecycleState,
    uiState,

    lockStatus,
    isLocked,
    isDraft,
    isLoading,
    isSaving,
    isBlocked,
    isError,

    weeklyPlan,
    macroTargets,
    likedIngredients,
    snapshot,

    planId,
    versionId,
    versionNumber,
    planCreatedAt,
    payloadHash,

    lockedAt,
    lockedUntil,
    daysRemaining,

    pendingOverrides,
    error,
    lastPersistenceFailed,

    canGenerate,
    canRegenerate,
    canLock,
    canDiscard,
    canPrint,
    canShare,

    isImmutable,
    isShareable,

    loadPlanForClient,
    setDraftPlan,
    lockPlan,
    clearState,
  };
}
