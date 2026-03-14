import { buildPlanSnapshot } from './planSnapshot.js';
import type { WeeklyMealPlanResult } from '../services/recipeService';
import type { PlanSnapshot } from '../types/planSnapshot';

export interface SnapshotBuildInput {
  activeClientId: string;
  isLocked: boolean;
  lockIsActive: boolean;
  weeklyPlan: WeeklyMealPlanResult | null;
  macroTargets: { calories: number; protein: number; carbs: number; fat: number } | null;
  likedIngredients: string[];
  pendingOverrides: Array<{
    id: string;
    planVersionId: string;
    clientId: string;
    mealType: string;
    originalIngredient: string;
    replacementIngredient: string;
    macroDelta: { calories: number; protein: number; carbs: number; fat: number };
    withinTolerance: boolean;
    suggestedBy: 'client' | 'coach' | 'system';
    approvedBy: string | null;
    createdAt: string;
    archived: boolean;
    requiresRecipeRegeneration: boolean;
  }>;
  planId: string | null;
  versionId: string | null;
  planCreatedAt: string | null;
  planGeneratedAt: string | null;
  planLockedAt: string | null;
  snapshot: PlanSnapshot | null;
}

export const resolveSnapshotWeeklyPlan = (
  input: SnapshotBuildInput,
  buildFn: typeof buildPlanSnapshot = buildPlanSnapshot
): WeeklyMealPlanResult | null => {
  if (!input.isLocked || !input.weeklyPlan || !input.macroTargets) {
    return null;
  }

  if (input.snapshot) {
    return input.snapshot.weeklyPlan;
  }

  const generatedAt = input.planGeneratedAt || input.planCreatedAt || new Date().toISOString();
  const lockedAt = input.planLockedAt || input.planCreatedAt || generatedAt;
  const snapshotCreatedAt = input.planCreatedAt || lockedAt || generatedAt;

  const snapshot = buildFn({
    status: input.lockIsActive ? 'LOCKED' : 'EXPIRED',
    planPayload: {
      type: 'nutrition',
      generatedAt,
      lockedAt,
      macroTargets: input.macroTargets,
      weeklyPlan: input.weeklyPlan,
      likedIngredients: input.likedIngredients,
    },
    pendingOverrides: input.pendingOverrides,
    planId: input.planId,
    planVersionId: input.versionId,
    clientId: input.activeClientId,
    snapshotCreatedAt,
  });

  return snapshot.weeklyPlan;
};
