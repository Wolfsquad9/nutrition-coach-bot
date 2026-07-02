/**
 * useNutritionPlanState - State machine for nutrition plan lifecycle
 */
import { mapSnapshotToWeeklyPlan } from '@/domain/nutrition/snapshotAdapter';
import { useState, useCallback, useRef } from "react";
import type { WeeklyMealPlanResult } from "@/services/recipeService";
import type { PlanSnapshot } from "@/domain/nutrition/snapshot";
import { mapWeeklyMealPlanToSnapshot } from "@/domain/nutrition/snapshotAdapter";
import type { NutritionMetrics, MacroTargets } from "@/types";
import { usePlanStateMachine } from "./usePlanStateMachine";
import { usePlanFetch } from "./usePlanFetch";

import {
  buildLockedPlanPayload,
  hashPlanPayload,
  lockNutritionPlan,
} from "@/services/supabasePlanService";

import {
  type PlanOverride,
} from "@/services/supabaseOverrideService";

import {
  buildPlanSnapshot,
  type SnapshotBuildInput,
} from "@/domain/nutrition/snapshot";
import {
  createLockFailureError,
  normalizeRuntimeError,
} from "@/domain/nutrition/runtimeErrors";
import {
  emitRetryTelemetry,
  emitRuntimeFailure,
} from "@/domain/nutrition/runtimeTelemetry";

import {
  buildGroceryListFromPlan,
} from "@/domain/nutrition/snapshotAdapter";

import {
  calculateLockExpiry,
  canLock as domainCanLock,
  validateImmutability,
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

interface LockAttempt {
  versionId: string;
  idempotencyKey: string;
  lockedAt: Date;
}

type RetryAction =
  | { type: "load"; clientId: string }
  | { type: "lock"; clientId: string; clientInfo: LockClientInfo; attempt: LockAttempt }
  | null;

export type { RetryAction };

const createUuid = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (char) =>
    (
      Number(char) ^
      (Math.random() * 16) >> (Number(char) / 4)
    ).toString(16)
  );
};

const createLockAttempt = (): LockAttempt => ({
  versionId: createUuid(),
  idempotencyKey: createUuid(),
  lockedAt: new Date(),
});

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

  /* ---------------- LIFECYCLE (delegated to usePlanStateMachine) ---------------- */

  // The derivation of lifecycleState / daysRemaining / lockStatus / permission
  // booleans from the current state values is pure — no useState, no I/O. It
  // lives in usePlanStateMachine. We assemble its input here and forward the
  // results verbatim to the public return.
  const machine = usePlanStateMachine({
    weeklyPlan,
    macroTargets,
    versionId,
    lockedAt,
    lockedUntil,
    planId,
    versionNumber,
    payloadHash,
    uiState,
    lastPersistenceFailed,
  });

  const {
    lifecycleState,
    daysRemaining,
    lockStatus,
    isDraft,
    isLocked,
    isError: _isError,
    canGenerate,
    canRegenerate,
    canLock,
    canDiscard,
    canPrint,
    canShare,
    isImmutable,
    isShareable,
    planStateContext,
  } = machine;

  /* ---------------- UI FLAGS (depend on a ref; stay here) ---------------- */

  const isLoading = uiState === "LOADING";
  const isSaving = uiState === "SAVING";
  const isBlocked = uiState === "ERROR";
  const isError = uiState === "ERROR";
  const isRetryable = isError && lastFailedActionRef.current !== null;

  const state: PlanState =
    uiState === "LOADING"
      ? "LOADING"
      : uiState === "SAVING"
      ? "SAVING"
      : uiState === "ERROR"
      ? "ERROR"
      : lifecycleState;

  /* ---------------- CLEAR ---------------- */
  // Defined before loadPlanForClient so it is in scope

  const resetHydratedPlanState = useCallback(() => {
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
  }, []);

  const clearState = useCallback(() => {
    resetHydratedPlanState();
    setError(null);
    setLastPersistenceFailed(false);
    lastFailedActionRef.current = null;
    setUiState("IDLE");
  }, [resetHydratedPlanState]);

  /* ---------------- LOAD PLAN (delegated to usePlanFetch) ---------------- */

  const { loadPlanForClient } = usePlanFetch(
    {
      setUiState, setError, setLastPersistenceFailed, setWeeklyPlan, setMacroTargets,
      setLikedIngredients, setSnapshot, setPlanId, setVersionId, setVersionNumber,
      setPlanCreatedAt, setPayloadHash, setLockedAt, setLockedUntil, setPendingOverrides,
    },
    { loadRequestIdRef, lastFailedActionRef },
    { planId, versionId },
    { resetHydratedPlanState, clearState }
  );

  /* ---------------- DRAFT ---------------- */

  const setDraftPlan = useCallback(
    (plan: WeeklyMealPlanResult, macros: MacroTargets, ingredients: string[]) => {
      const validation = validateImmutability(lifecycleState, "REGENERATE");
      if (!validation.valid) {
        setError("Can't regenerate a locked plan");
        return;
      }

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
    async (clientId: string, clientInfo: LockClientInfo, retryAttempt?: LockAttempt) => {
      if (lockInFlightRef.current) {
        return lockInFlightRef.current;
      }

      if (!domainCanLock(lifecycleState) || !weeklyPlan || !macroTargets) {
        return { success: false, error: "No draft to lock" };
      }

      const attempt = retryAttempt ?? createLockAttempt();
      const lockRequest = (async () => {
        setUiState("SAVING");
        setError(null);

        try {
          try {
            const planPayload = buildLockedPlanPayload({
              lockedAt: attempt.lockedAt,
              weeklyPlan,
              macroTargets,
              likedIngredients,
            });
            const payloadHash = hashPlanPayload(planPayload);

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
                versionId: attempt.versionId,
                lockedAt: attempt.lockedAt,
                lockedUntil: calculateLockExpiry(attempt.lockedAt),
                payloadHash,
              },
              client: clientInfo,
              metrics,
              weeklyPlan: mapWeeklyMealPlanToSnapshot(weeklyPlan),
              groceryList: buildGroceryListFromPlan(weeklyPlan),
              planName: `Plan – ${clientInfo.firstName} ${clientInfo.lastName}`,
              versionNumber: versionNumber ?? 1,
              createdAt: attempt.lockedAt.toISOString(),
              generatedBy: "coach",
            };

            const builtSnapshot = buildPlanSnapshot(snapshotInput);
            const result = await lockNutritionPlan(
              clientId,
              planPayload,
              builtSnapshot,
              {
                versionId: attempt.versionId,
                idempotencyKey: attempt.idempotencyKey,
              }
            );

            if (!result.success || !result.versionId) {
              const runtimeError = createLockFailureError(result.error ?? "Failed to lock plan");
              emitRuntimeFailure({
                code: runtimeError.code,
                retryable: runtimeError.retryable,
                source: "lockPlan",
                clientId,
                planId,
                versionId,
              });
              setLastPersistenceFailed(true);
              setError(runtimeError.message);
              lastFailedActionRef.current = runtimeError.retryable ? { type: "lock", clientId, clientInfo, attempt } : null;
              setUiState("ERROR");
              return { success: false, error: runtimeError.message };
            }

            setVersionNumber(result.versionNumber ?? versionNumber);
            setLastPersistenceFailed(false);
          } catch (err) {
            const runtimeError = createLockFailureError(err instanceof Error ? err.message : "Atomic lock failed", err);
            emitRuntimeFailure({
              code: runtimeError.code,
              retryable: runtimeError.retryable,
              source: "lockPlan",
              clientId,
              planId,
              versionId,
            });
            setLastPersistenceFailed(true);
            setError(runtimeError.message);
            lastFailedActionRef.current = runtimeError.retryable ? { type: "lock", clientId, clientInfo, attempt } : null;
            setUiState("ERROR");
            return { success: false, error: runtimeError.message };
          }

          await loadPlanForClient(clientId);
          lastFailedActionRef.current = null;
          return { success: true, error: null };
        } catch (err) {
          const runtimeError = normalizeRuntimeError(err, "Lock failed", "UNKNOWN_RUNTIME_FAILURE", false);
          emitRuntimeFailure({
            code: runtimeError.code,
            retryable: runtimeError.retryable,
            source: "lockPlan",
            clientId,
            planId,
            versionId,
          });
          setError(runtimeError.message);
          lastFailedActionRef.current = runtimeError.retryable ? { type: "lock", clientId, clientInfo, attempt } : null;
          setUiState("ERROR");
          return { success: false, error: runtimeError.message };
        } finally {
          lockInFlightRef.current = null;
        }
      })();

      lockInFlightRef.current = lockRequest;
      return lockRequest;
    },
    [weeklyPlan, macroTargets, likedIngredients, lifecycleState, versionNumber, loadPlanForClient, planId, versionId]
  );

  /* ---------------- RETRY ---------------- */

  const retryLastAction = useCallback(async () => {
    const action = lastFailedActionRef.current;

    if (!action) {
      return { success: false, error: "No failed action to retry" };
    }

    if (action.type === "load") {
      emitRetryTelemetry({
        phase: "attempted",
        source: "retryLastAction",
        clientId: action.clientId,
        planId,
        versionId,
      });
      await loadPlanForClient(action.clientId);
      if (lastFailedActionRef.current === null) {
        emitRetryTelemetry({
          phase: "succeeded",
          source: "retryLastAction",
          clientId: action.clientId,
          planId,
          versionId,
        });
        return { success: true, error: null };
      }

      emitRetryTelemetry({
        phase: "failed",
        source: "retryLastAction",
        clientId: action.clientId,
        planId,
        versionId,
      });
      return { success: false, error: "Retry failed" };
    }

    emitRetryTelemetry({
      phase: "attempted",
      source: "retryLastAction",
      clientId: action.clientId,
      planId,
      versionId,
    });
    const lockResult = await lockPlan(action.clientId, action.clientInfo, action.attempt);
    emitRetryTelemetry({
      phase: lockResult.success ? "succeeded" : "failed",
      source: "retryLastAction",
      clientId: action.clientId,
      planId,
      versionId,
    });
    return lockResult;
  }, [loadPlanForClient, lockPlan, planId, versionId]);

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
    : lockedAt && versionId
      ? null
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
