/**
 * usePlanStateMachine — pure derivation of lifecycle state, lock status, and
 * permission booleans from the current plan state.
 *
 * Extracted from useNutritionPlanState to separate "the math of what the plan
 * currently is" from "the I/O of fetching/locking it". This hook has no
 * useState and no side effects — it only computes.
 *
 * Returns the same shape that useNutritionPlanState used to compute inline,
 * so the public API of useNutritionPlanState is unchanged.
 */

import { useMemo } from "react";
import {
  derivePlanState,
  calculateDaysRemaining,
  canLock as domainCanLock,
  canRegenerate as domainCanRegenerate,
  isImmutable as domainIsImmutable,
  isActionPermitted,
  checkShareability,
  type PlanLifecycleState,
  type PlanStateContext,
} from "@/domain/nutrition/planLifecycle";
import type { UIState, LockStatus } from "./useNutritionPlanState";

export interface PlanStateMachineInput {
  weeklyPlan: unknown;
  macroTargets: unknown;
  versionId: string | null;
  lockedAt: Date | null;
  lockedUntil: Date | null;
  planId: string | null;
  versionNumber: number | null;
  payloadHash: string | null;
  uiState: UIState;
  lastPersistenceFailed: boolean;
}

export interface PlanStateMachineResult {
  // Lifecycle
  lifecycleState: PlanLifecycleState;
  daysRemaining: number;
  lockStatus: LockStatus;

  // UI flags
  isDraft: boolean;
  isLocked: boolean;
  isError: boolean;

  // Permissions
  canGenerate: boolean;
  canRegenerate: boolean;
  canLock: boolean;
  canDiscard: boolean;
  canPrint: boolean;
  canShare: boolean;
  isImmutable: boolean;
  isShareable: boolean;

  // Plan state context (for sharing/printing checks)
  planStateContext: PlanStateContext;
}

export function usePlanStateMachine(
  input: PlanStateMachineInput
): PlanStateMachineResult {
  // Lifecycle derivation
  const lifecycleState = useMemo<PlanLifecycleState>(() => {
    return derivePlanState({
      hasPlan: !!input.weeklyPlan,
      isPersisted: !!input.versionId,
      lockedAt: input.lockedAt,
    });
  }, [input.weeklyPlan, input.versionId, input.lockedAt]);

  const daysRemaining = useMemo(() => {
    if (!input.lockedAt) return 0;
    return calculateDaysRemaining(input.lockedAt);
  }, [input.lockedAt]);

  const lockStatus: LockStatus = useMemo(() => {
    return {
      isLocked: !!input.lockedAt && daysRemaining > 0,
      daysRemaining,
    };
  }, [input.lockedAt, daysRemaining]);

  // UI flags
  const isError = input.uiState === "ERROR";
  const isDraft = lifecycleState === "DRAFT";
  const isLocked = lifecycleState === "LOCKED";

  // Permissions — exact same logic as the original inline block
  const canGenerate =
    !input.lastPersistenceFailed &&
    input.uiState === "IDLE" &&
    (lifecycleState === "EMPTY" || lifecycleState === "EXPIRED");

  const canRegenerate =
    !input.lastPersistenceFailed &&
    input.uiState === "IDLE" &&
    domainCanRegenerate(lifecycleState);

  const canLock =
    !input.lastPersistenceFailed &&
    input.uiState === "IDLE" &&
    domainCanLock(lifecycleState) &&
    !!input.weeklyPlan &&
    !!input.macroTargets;

  const canDiscard =
    !input.lastPersistenceFailed &&
    input.uiState === "IDLE" &&
    isActionPermitted(lifecycleState, "DISCARD");

  const canPrint = isActionPermitted(lifecycleState, "PRINT");
  const canShare = isActionPermitted(lifecycleState, "SHARE");

  const isImmutable = domainIsImmutable(lifecycleState);

  const planStateContext: PlanStateContext = {
    state: lifecycleState,
    planId: input.planId,
    versionId: input.versionId,
    versionNumber: input.versionNumber,
    lockedAt: input.lockedAt,
    lockedUntil: input.lockedUntil,
    daysRemaining,
    payloadHash: input.payloadHash,
  };

  const shareabilityCheck = checkShareability(planStateContext);
  const isShareable = shareabilityCheck.isShareable;

  return {
    lifecycleState,
    daysRemaining,
    lockStatus,
    isDraft,
    isLocked,
    isError,
    canGenerate,
    canRegenerate,
    canLock,
    canDiscard,
    canPrint,
    canShare,
    isImmutable,
    isShareable,
    planStateContext,
  };
}
