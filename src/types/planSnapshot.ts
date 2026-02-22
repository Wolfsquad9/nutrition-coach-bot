import type { WeeklyMealPlanResult, MacroTargets } from '../services/recipeService';
import type { PlanPayload } from '../services/supabasePlanService';
import type { PlanOverride } from '../services/supabaseOverrideService';

export type PlanSnapshotStatus = 'LOCKED' | 'EXPIRED';

export interface PlanSnapshotMetadata {
  planId?: string | null;
  planVersionId?: string | null;
  clientId?: string | null;
  generatedAt: string;
  lockedAt: string;
  snapshotCreatedAt: string;
  macroTargets: MacroTargets;
  likedIngredients: string[];
  realismConstraintHit?: boolean;
  constraintsHitDetails?: string[];
  overridesApplied: PlanOverride[];
}

export interface PlanSnapshot {
  status: PlanSnapshotStatus;
  metadata: PlanSnapshotMetadata;
  weeklyPlan: WeeklyMealPlanResult;
}

export interface PlanSnapshotInput {
  status: PlanSnapshotStatus;
  planPayload: PlanPayload;
  pendingOverrides?: PlanOverride[];
  planId?: string | null;
  planVersionId?: string | null;
  clientId?: string | null;
  snapshotCreatedAt?: string;
}
