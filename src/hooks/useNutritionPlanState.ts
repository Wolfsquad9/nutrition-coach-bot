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
  buildPrescriptionRecord,
  type ActiveNutritionPrescription,
} from "@/domain/nutrition/prescription";

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

const createUuid = (): string => crypto.randomUUID();

const createLockAttempt = (): LockAttempt => ({
  versionId: createUuid(),
  idempotencyKey: createUuid(),
  lockedAt: new Date(),
});

export function useNutritionPlanState() {
  /* ---------------- UI STATE ---------------- */

  const [uiState, setUiState_] = useState<UIState>("IDLE");
  const [error, setError] = useState<string | null>(null);
  const [lastPersistenceFailed, setLastPersistenceFailed] = useState(false);

  // Wrapped setUiState that delegates to the underlying state setter
  const setUiState = useCallback((next: UIState | ((prev: UIState) => UIState)) => {
    setUiState_(next);
  }, []);

  /* ---------------- PLAN DATA ---------------- */

  const [weeklyPlan, setWeeklyPlan] = useState<WeeklyMealPlanResult | null>(null);
  const [macroTargets, setMacroTargets] = useState<MacroTargets | null>(null);
  const [likedIngredients, setLikedIngredients] = useState<string[]>([]);

  /* ---------------- SNAPSHOT ---------------- */

    const [snapshot, setSnapshot] = useState<PlanSnapshot | null>(null);

  /* ---------------- ACTIVE PRESCRIPTION (Phase 8) ----------------
   * The client's current authoritative nutrition prescription, hydrated from
   * the current locked plan version's payload and refreshed by every
   * successful lock (via the post-lock reload of the atomic RPC result).
   *
   * Deliberately NOT cleared or modified by setDraftPlan / discardDraft:
   * generating or discarding drafts never changes the prescription basis.
   * Only an explicit lock establishes a new prescription.
   */
  const [activePrescription, setActivePrescription] = useState<ActiveNutritionPrescription | null>(null);

  // The effective weekly rate of the CURRENT DRAFT (captured at generation
  // time so locking persists it into the payload's prescription record).
  const [draftWeeklyRateKg, setDraftWeeklyRateKg] = useState<number | null>(null);
  const draftWeeklyRateKgRef = useRef<number | null>(null);
  draftWeeklyRateKgRef.current = draftWeeklyRateKg;

  /* ---------------- CANONICAL CLIENT METRICS ----------------
   * Captured at generation time so the locked snapshot carries the real
   * BMR / TDEE / fiber / water values (instead of zeroed placeholders).
   * Backs lockPlan (and retryLastAction, which routes through lockPlan).
   * Synced to a ref so the memoized lockPlan callback always reads the
   * latest value without re-creating itself.
   */
  const [clientMetrics, setClientMetrics] = useState<NutritionMetrics | null>(null);
  const clientMetricsRef = useRef<NutritionMetrics | null>(null);
  clientMetricsRef.current = clientMetrics;

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
    setClientMetrics(null);
    setSnapshot(null);
    setActivePrescription(null);
    setDraftWeeklyRateKg(null);
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
  }, [resetHydratedPlanState, setUiState]);

  /* ---------------- LOAD PLAN (delegated to usePlanFetch) ---------------- */

  const { loadPlanForClient } = usePlanFetch(
    {
      setUiState, setError, setLastPersistenceFailed, setWeeklyPlan, setMacroTargets,
      setLikedIngredients, setSnapshot, setActivePrescription, setPlanId, setVersionId,
      setVersionNumber, setPlanCreatedAt, setPayloadHash, setLockedAt, setLockedUntil,
      setPendingOverrides,
    },
    { loadRequestIdRef, lastFailedActionRef },
    { planId, versionId },
    { resetHydratedPlanState, clearState }
  );

  /* ---------------- DRAFT ---------------- */

    const setDraftPlan = useCallback(
    (
      plan: WeeklyMealPlanResult,
      macros: MacroTargets,
      ingredients: string[],
      clientMetricsInput?: NutritionMetrics,
      options?: { weeklyRateKg?: number | null },
    ) => {
      const validation = validateImmutability(lifecycleState, "REGENERATE");
      if (!validation.valid) {
        setError("Can't regenerate a locked plan");
        return;
      }

      setWeeklyPlan(plan);
      setMacroTargets(macros);
      setClientMetrics(clientMetricsInput ?? null);
      setLikedIngredients(ingredients);

      // Phase 8: capture the draft's effective weekly rate so locking THIS
      // draft persists its prescription record. The ACTIVE PRESCRIPTION itself
      // is deliberately left untouched — drafts are never authoritative.
      const rate = options?.weeklyRateKg;
      setDraftWeeklyRateKg(typeof rate === "number" && Number.isFinite(rate) ? rate : null);

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
    setClientMetrics(null);
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
            // Phase 8: persist the prescription record (effective weekly rate
            // + provenance) with THIS lock, through the existing atomic RPC.
            // Only an explicit lock establishes a new active prescription.
            const draftRate = draftWeeklyRateKgRef.current;
            const nutritionPrescription =
              draftRate !== null
                ? buildPrescriptionRecord({
                    weeklyRateKg: draftRate,
                    lockedAt: attempt.lockedAt,
                    versionId: attempt.versionId,
                  })
                : undefined;

            const planPayload = buildLockedPlanPayload({
              lockedAt: attempt.lockedAt,
              weeklyPlan,
              macroTargets,
              likedIngredients,
              nutritionPrescription,
            });
            const payloadHash = hashPlanPayload(planPayload);

                        // Build canonical NutritionMetrics for the snapshot. Prefer the full
            // client metrics captured at generation time (carries BMR/TDEE/fiber/
            // water); fall back to a macroTargets-derived view only when no client
            // metrics are available (e.g. tests / legacy callers).
            const metrics: NutritionMetrics = clientMetricsRef.current ?? {
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
              weeklyPlan: mapWeeklyMealPlanToSnapshot(weeklyPlan, metrics.waterLiters),
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
    [weeklyPlan, macroTargets, likedIngredients, lifecycleState, versionNumber, loadPlanForClient, planId, versionId, setUiState]
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
          fiber: snapshot.metrics.fiberGrams,
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

    /** Phase 8: the client's current authoritative nutrition prescription. */
    activePrescription,

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
