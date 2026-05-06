/**
 * useNutritionPlanState - State machine for nutrition plan lifecycle
 */
import { mapSnapshotToWeeklyPlan } from '@/domain/nutrition/snapshotAdapter';
import { useState, useCallback, useMemo, useRef } from "react";
import type { WeeklyMealPlanResult } from "@/services/recipeService";
import type { PlanSnapshot } from "@/domain/nutrition/snapshot";
import { mapWeeklyMealPlanToSnapshot } from "@/domain/nutrition/snapshotAdapter";
import type { NutritionMetrics, MacroTargets } from "@/types";

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

// MacroTargets is imported from @/types

const getErrorMessage = (error: unknown, fallback: string): string => {
  return error instanceof Error ? error.message : fallback;
};

type RetryAction =
  | { type: "load"; clientId: string }
  | { type: "lock"; clientId: string; clientInfo: LockClientInfo }
  | null;

export function useNutritionPlanState() {
  /* ---------------- UI STATE ---------------- */

  const [uiState, setUiState] = useState<UIState>("IDLE");
  const [error, setError] = useState<string | null>(null);
  const [lastPersistenceFailed, setLastPersistenceFailed] = useState(false);

  /* ---------------- PLAN DATA ---------------- */

  const [weeklyPlan, setWeeklyPlan] = useState<WeeklyMealPlanResult | null>(null);
  const [macroTargets, setMacroTargets] = useState<MacroTargets | null>(null);
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

  /* ---------------- ASYNC GUARD ---------------- */

  const loadRequestIdRef = useRef(0);
  const lockInFlightRef = useRef<Promise<{ success: boolean; error: string | null }> | null>(null);
  const lastFailedActionRef = useRef<RetryAction>(null);

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
  const isRetryable = isError && lastFailedActionRef.current !== null;

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

  /* ---------------- CLEAR ---------------- */
  // Defined before loadPlanForClient so it is in scope

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
    lastFailedActionRef.current = null;
    setUiState("IDLE");
  }, []);

  /* ---------------- LOAD PLAN ---------------- */

  const loadPlanForClient = useCallback(async (clientId: string) => {
    if (!clientId) return;

    const currentRequestId = ++loadRequestIdRef.current;

    setUiState("LOADING");
    setError(null);

    try {
      const [planResult, lockResult] = await Promise.all([
        fetchCurrentPlan(clientId),
        checkPlanLockStatus(clientId),
      ]);

      if (currentRequestId !== loadRequestIdRef.current) return;

      if (!planResult.plan) {
        clearState();
        setUiState("IDLE");
        lastFailedActionRef.current = null;
        return;
      }

      const payload = planResult.plan;
      const planLockedAt = payload.lockedAt ? new Date(payload.lockedAt) : null;
      let nextSnapshot = planResult.snapshot;
      let nextPendingOverrides: PlanOverride[] = [];

      if (planResult.versionId) {
        const snapshotPromise = nextSnapshot
          ? Promise.resolve({ snapshot: nextSnapshot, error: null })
          : fetchPersistedSnapshot(planResult.versionId);

        const [snapshotResult, overridesResult] = await Promise.all([
          snapshotPromise,
          fetchPendingOverrides(planResult.versionId),
        ]);

        if (currentRequestId !== loadRequestIdRef.current) return;

        nextSnapshot = snapshotResult.snapshot;

        if (snapshotResult.error) {
          throw new Error(snapshotResult.error);
        }

        if (!overridesResult.error) {
          nextPendingOverrides = overridesResult.overrides;
        }
      }

      setWeeklyPlan(payload.weeklyPlan);
      setMacroTargets(payload.macroTargets as MacroTargets);
      setLikedIngredients(payload.likedIngredients || []);
      setPlanId(planResult.planId);
      setVersionId(planResult.versionId);
      setVersionNumber(planResult.versionNumber ?? null);
      setPlanCreatedAt(planResult.createdAt);
      setPayloadHash(planResult.payloadHash ?? null);
      setLockedAt(planLockedAt);
      setLockedUntil(planLockedAt ? calculateLockExpiry(planLockedAt) : lockResult.lockedUntil);
      setPendingOverrides(nextPendingOverrides);
      setSnapshot(nextSnapshot);
      setLastPersistenceFailed(false);
      lastFailedActionRef.current = null;
      setUiState("IDLE");
    } catch (err) {
      if (currentRequestId !== loadRequestIdRef.current) return;
      console.error(err);
      setError(getErrorMessage(err, "Failed to load plan"));
      lastFailedActionRef.current = { type: "load", clientId };
      setUiState("ERROR");
    }
  }, [clearState]);

  /* ---------------- DRAFT ---------------- */

  const setDraftPlan = useCallback(
    (plan: WeeklyMealPlanResult, macros: MacroTargets, ingredients: string[]) => {
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

  const discardDraft = useCallback(async (clientId?: string) => {
    if (!isDraft) return;

    setWeeklyPlan(null);
    setMacroTargets(null);
    setLikedIngredients([]);
    setPlanId(null);
    setVersionId(null);
    setVersionNumber(null);
    setPlanCreatedAt(null);
    setPayloadHash(null);
    setLockedAt(null);
    setLockedUntil(null);
    setSnapshot(null);

    // Reload previously locked plan from DB if clientId provided
    if (clientId) {
      await loadPlanForClient(clientId);
    }
  }, [isDraft, loadPlanForClient]);

  /* ---------------- LOCK ---------------- */

  const lockPlan = useCallback(
    async (clientId: string, clientInfo: LockClientInfo) => {
      if (lockInFlightRef.current) {
        return lockInFlightRef.current;
      }

      if (!domainCanLock(lifecycleState) || !weeklyPlan || !macroTargets) {
        return { success: false, error: "No draft to lock" };
      }

      const lockRequest = (async () => {
        setUiState("SAVING");
        setError(null);

        try {
          const result = await lockNutritionPlan(
            clientId,
            weeklyPlan,
            macroTargets,
            likedIngredients
          );

          if (!result.success || !result.versionId) {
            const message = result.error ?? "Failed to lock plan";
            setError(message);
            lastFailedActionRef.current = { type: "lock", clientId, clientInfo };
            setUiState("ERROR");
            return { success: false, error: message };
          }

          try {
            const now = new Date();

            // Map MacroTargets → NutritionMetrics for snapshot
            const metrics: NutritionMetrics = {
              tdee: 0,
              bmr: 0,
              targetCalories: macroTargets.calories,
              proteinGrams: macroTargets.protein,
              carbsGrams: macroTargets.carbs,
              fatGrams: macroTargets.fat,
              fiberGrams: 0,
              waterLiters: 0,
            };

            const snapshotInput: SnapshotBuildInput = {
              identifier: {
                versionId: result.versionId,
                lockedAt: now,
                lockedUntil: calculateLockExpiry(now),
                payloadHash: payloadHash ?? "",
              },
              client: clientInfo,
              metrics,
              weeklyPlan: mapWeeklyMealPlanToSnapshot(weeklyPlan),
              groceryList: buildGroceryListFromPlan(weeklyPlan),
              planName: `Plan – ${clientInfo.firstName} ${clientInfo.lastName}`,
              versionNumber: versionNumber ?? 1,
              createdAt: now.toISOString(),
              generatedBy: "coach",
            };

            const builtSnapshot = buildPlanSnapshot(snapshotInput);
            const persistResult = await persistSnapshot(result.versionId, builtSnapshot);

            if (!persistResult.success) {
              const message = persistResult.error ?? "Snapshot persistence failed";
              setLastPersistenceFailed(true);
              setError(message);
              lastFailedActionRef.current = { type: "lock", clientId, clientInfo };
              setUiState("ERROR");
              return { success: false, error: message };
            }

            setLastPersistenceFailed(false);
          } catch (err) {
            const message = getErrorMessage(err, "Snapshot persistence failed");
            setLastPersistenceFailed(true);
            setError(message);
            lastFailedActionRef.current = { type: "lock", clientId, clientInfo };
            setUiState("ERROR");
            return { success: false, error: message };
          }

          await loadPlanForClient(clientId);
          lastFailedActionRef.current = null;
          return { success: true, error: null };
        } catch (err) {
          const message = getErrorMessage(err, "Lock failed");
          setError(message);
          lastFailedActionRef.current = { type: "lock", clientId, clientInfo };
          setUiState("ERROR");
          return { success: false, error: message };
        } finally {
          lockInFlightRef.current = null;
        }
      })();

      lockInFlightRef.current = lockRequest;
      return lockRequest;
    },
    [weeklyPlan, macroTargets, likedIngredients, lifecycleState, versionNumber, payloadHash, loadPlanForClient]
  );

  /* ---------------- RETRY ---------------- */

  const retryLastAction = useCallback(async () => {
    const action = lastFailedActionRef.current;

    if (!action) {
      return { success: false, error: "No failed action to retry" };
    }

    if (action.type === "load") {
      await loadPlanForClient(action.clientId);
      return { success: true, error: null };
    }

    return lockPlan(action.clientId, action.clientInfo);
  }, [loadPlanForClient, lockPlan]);

  /* ---------------- RESOLVED PLAN ---------------- */

  const resolvedWeeklyPlan = snapshot
    ? mapSnapshotToWeeklyPlan({
        weeklyPlan: snapshot.weeklyPlan,
        metrics: {
          calories: snapshot.metrics.targetCalories,
          protein: snapshot.metrics.proteinGrams,
          carbs: snapshot.metrics.carbsGrams,
          fat: snapshot.metrics.fatGrams,
        },
      })
    : weeklyPlan;

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
    isRetryable,

    weeklyPlan,
    resolvedWeeklyPlan,
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
    discardDraft,
    lockPlan,
    retryLastAction,
    clearState,
  };
}
