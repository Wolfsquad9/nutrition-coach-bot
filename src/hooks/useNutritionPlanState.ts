import { useState, useCallback } from "react";

import { lockNutritionPlan } from "@/services/nutrition/lockNutritionPlan";
import { persistSnapshot } from "@/services/nutrition/persistSnapshot";

import { buildPlanSnapshot } from "@/domain/nutrition/buildPlanSnapshot";
import type { SnapshotBuildInput } from "@/domain/nutrition/buildPlanSnapshot";
import type { PlanSnapshot } from "@/domain/nutrition/snapshot";

import type { WeeklyMealPlanResult } from "@/types/weeklyMealPlan";

type UIState = "IDLE" | "SAVING" | "ERROR";

export function useNutritionPlanState() {
  const [weeklyPlan, setWeeklyPlan] = useState<WeeklyMealPlanResult | null>(null);
  const [macroTargets, setMacroTargets] = useState<any | null>(null);
  const [likedIngredients, setLikedIngredients] = useState<string[]>([]);

  const [planId, setPlanId] = useState<string | null>(null);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [versionNumber, setVersionNumber] = useState<number | null>(null);

  const [planCreatedAt, setPlanCreatedAt] = useState<string | null>(null);
  const [payloadHash, setPayloadHash] = useState<string | null>(null);

  const [lockedAt, setLockedAt] = useState<Date | null>(null);
  const [lockedUntil, setLockedUntil] = useState<Date | null>(null);

  const [snapshot, setSnapshot] = useState<PlanSnapshot | null>(null);

  const [uiState, setUiState] = useState<UIState>("IDLE");
  const [error, setError] = useState<string | null>(null);
  const [lastPersistenceFailed, setLastPersistenceFailed] = useState(false);

  const isDraft = !planId && weeklyPlan !== null;

  /* ---------------- CLEAR ---------------- */

  const clearState = useCallback(() => {
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

    setUiState("IDLE");
    setError(null);
  }, []);

  /* ---------------- DRAFT ---------------- */

  const setDraftPlan = useCallback(
    (plan: WeeklyMealPlanResult, macros: any, ingredients: string[]) => {
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
    []
  );

  const discardDraft = useCallback(() => {
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
  }, []);

  /* ---------------- LOCK ---------------- */

  const lockPlan = useCallback(
    async (clientId: string) => {
      if (!weeklyPlan || !macroTargets) {
        return { success: false, error: "No draft to lock" };
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

        const snapshotInput: SnapshotBuildInput = {
          weeklyPlan,
          macroTargets,
          likedIngredients,
          versionId: result.versionId,
        };

        const builtSnapshot = buildPlanSnapshot(snapshotInput);

        const persistResult = await persistSnapshot(
          result.versionId,
          builtSnapshot
        );

        if (!persistResult.success) {
          setLastPersistenceFailed(true);
          setUiState("ERROR");
          return { success: false, error: persistResult.error };
        }

        setSnapshot(builtSnapshot);

        setVersionId(result.versionId);
        setLockedAt(new Date());

        setUiState("IDLE");
        setLastPersistenceFailed(false);

        return { success: true, error: null };
      } catch (err: any) {
        setUiState("ERROR");
        setLastPersistenceFailed(true);

        return {
          success: false,
          error: err?.message ?? "Lock failed",
        };
      }
    },
    [weeklyPlan, macroTargets, likedIngredients]
  );

  return {
    weeklyPlan,
    macroTargets,
    likedIngredients,

    planId,
    versionId,
    versionNumber,

    planCreatedAt,
    payloadHash,

    lockedAt,
    lockedUntil,

    snapshot,

    uiState,
    error,

    isDraft,
    lastPersistenceFailed,

    setDraftPlan,
    discardDraft,
    lockPlan,
    clearState,
  };
}
