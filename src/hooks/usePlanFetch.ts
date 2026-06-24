/**
 * usePlanFetch — fetch + hydrate a client's nutrition plan from the database.
 *
 * Extracted from useNutritionPlanState. Owns the load lifecycle:
 *   - bumps loadRequestIdRef to invalidate stale concurrent loads
 *   - calls fetchCurrentPlan + checkPlanLockStatus in parallel
 *   - hydrates the snapshot + pending overrides
 *   - reports runtime errors with telemetry
 *   - records the last-failed action for retry
 *
 * Pure refactor: receives all the setters/refs the inline implementation
 * needed, returns the same loadPlanForClient function. The parent hook
 * stays the owner of the state; this hook only knows how to write to it.
 */

import { useCallback, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { WeeklyMealPlanResult } from "@/services/recipeService";
import type { PlanSnapshot } from "@/domain/nutrition/snapshot";
import type { MacroTargets } from "@/types";
import type { PlanOverride } from "@/services/supabaseOverrideService";
import {
  checkPlanLockStatus,
  fetchCurrentPlan,
} from "@/services/supabasePlanService";
import {
  fetchPersistedSnapshot,
} from "@/services/snapshotPersistence";
import { fetchPendingOverrides } from "@/services/supabaseOverrideService";
import {
  buildPlanSnapshot,
  deepFreeze,
  validateSnapshotStructure,
} from "@/domain/nutrition/snapshot";
import {
  createSnapshotInvariantError,
  createSnapshotValidationError,
  createTransientLoadError,
  classifyLoadRuntimeError,
} from "@/domain/nutrition/runtimeErrors";
import {
  emitHydrationResetTelemetry,
  emitRuntimeFailure,
} from "@/domain/nutrition/runtimeTelemetry";
import { calculateLockExpiry } from "@/domain/nutrition/planLifecycle";
import type { UIState, RetryAction } from "./useNutritionPlanState";

export interface UsePlanFetchSetters {
  setUiState: Dispatch<SetStateAction<UIState>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setLastPersistenceFailed: Dispatch<SetStateAction<boolean>>;
  setWeeklyPlan: Dispatch<SetStateAction<WeeklyMealPlanResult | null>>;
  setMacroTargets: Dispatch<SetStateAction<MacroTargets | null>>;
  setLikedIngredients: Dispatch<SetStateAction<string[]>>;
  setSnapshot: Dispatch<SetStateAction<PlanSnapshot | null>>;
  setPlanId: Dispatch<SetStateAction<string | null>>;
  setVersionId: Dispatch<SetStateAction<string | null>>;
  setVersionNumber: Dispatch<SetStateAction<number | null>>;
  setPlanCreatedAt: Dispatch<SetStateAction<string | null>>;
  setPayloadHash: Dispatch<SetStateAction<string | null>>;
  setLockedAt: Dispatch<SetStateAction<Date | null>>;
  setLockedUntil: Dispatch<SetStateAction<Date | null>>;
  setPendingOverrides: Dispatch<SetStateAction<PlanOverride[]>>;
}

export interface UsePlanFetchRefs {
  loadRequestIdRef: { current: number };
  lastFailedActionRef: { current: RetryAction };
}

export interface UsePlanFetchContext {
  planId: string | null;
  versionId: string | null;
}

export interface UsePlanFetchHelpers {
  resetHydratedPlanState: () => void;
  clearState: () => void;
}

export function usePlanFetch(
  setters: UsePlanFetchSetters,
  refs: UsePlanFetchRefs,
  ctx: UsePlanFetchContext,
  helpers: UsePlanFetchHelpers
) {
  const {
    setUiState, setError, setLastPersistenceFailed, setWeeklyPlan, setMacroTargets,
    setLikedIngredients, setSnapshot, setPlanId, setVersionId, setVersionNumber,
    setPlanCreatedAt, setPayloadHash, setLockedAt, setLockedUntil, setPendingOverrides,
  } = setters;
  const { loadRequestIdRef, lastFailedActionRef } = refs;
  const { planId, versionId } = ctx;
  const { resetHydratedPlanState, clearState } = helpers;

  // Local validate helper — same as the original inline function.
  // Hoisted (not nested) so it survives across renders without churn.
  const ensureValidSnapshotRef = useRef((snapshot: unknown, source: string): PlanSnapshot => {
    const validation = validateSnapshotStructure(snapshot);
    if (!validation.valid) {
      throw createSnapshotValidationError(source, validation.errors);
    }
    return snapshot as PlanSnapshot;
  });

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
      let nextSnapshot = planResult.snapshot
        ? ensureValidSnapshotRef.current(planResult.snapshot, "fetchCurrentPlan.snapshot")
        : null;
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

        nextSnapshot = snapshotResult.snapshot
          ? ensureValidSnapshotRef.current(
              snapshotResult.snapshot,
              nextSnapshot ? "fetchCurrentPlan.snapshot" : "fetchPersistedSnapshot"
            )
          : null;

        if (snapshotResult.error) {
          throw createTransientLoadError(snapshotResult.error);
        }

        if (planLockedAt && !nextSnapshot) {
          throw createSnapshotInvariantError();
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
      setSnapshot(nextSnapshot ? deepFreeze(nextSnapshot) : null);
      setLastPersistenceFailed(false);
      lastFailedActionRef.current = null;
      setUiState("IDLE");
    } catch (err) {
      if (currentRequestId !== loadRequestIdRef.current) return;
      console.error(err);
      const runtimeError = classifyLoadRuntimeError(err, "Failed to load plan");
      const runtimeErrorWithDetails = runtimeError as { details?: string[] };

      emitRuntimeFailure({
        code: runtimeError.code,
        retryable: runtimeError.retryable,
        source: "fetchCurrentPlan",
        clientId,
        planId,
        versionId,
        details: runtimeErrorWithDetails.details,
        metadata: {
          validationDetailCount: runtimeErrorWithDetails.details?.length ?? 0,
        },
      });

      if (runtimeError.code === "SNAPSHOT_MISSING" || runtimeError.code === "SNAPSHOT_INVALID") {
        resetHydratedPlanState();
        emitHydrationResetTelemetry({
          source: "fetchCurrentPlan",
          clientId,
          planId,
          versionId,
          code: runtimeError.code,
        });
        setLastPersistenceFailed(true);
      }

      setError(runtimeError.message);
      lastFailedActionRef.current = runtimeError.retryable ? { type: "load", clientId } : null;
      setUiState("ERROR");
    }
  }, [
    clearState, resetHydratedPlanState, planId, versionId,
    setUiState, setError, setLastPersistenceFailed, setWeeklyPlan, setMacroTargets,
    setLikedIngredients, setSnapshot, setPlanId, setVersionId, setVersionNumber,
    setPlanCreatedAt, setPayloadHash, setLockedAt, setLockedUntil, setPendingOverrides,
    loadRequestIdRef, lastFailedActionRef,
  ]);

  return { loadPlanForClient };
}
