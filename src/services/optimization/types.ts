import type { MacroTargets } from '@/types';
import type { WeeklyMealPlanResult } from '@/services/recipe/types';

/**
 * Optimization engine types.
 *
 * These types deliberately reuse the existing nutrition domain models
 * (WeeklyMealPlanResult, MacroTargets) rather than introducing parallel
 * representations. The optimization layer only wraps plans with metadata
 * (seed, candidate index) and scoring results.
 */

/** Default number of candidate plans to generate per regeneration (MVP). */
export const DEFAULT_CANDIDATE_COUNT = 10;

/** Input required to generate a population of candidate plans. */
export interface GenerationInput {
  clientId: string;
  likedFoods: string[];
  macroTargets: MacroTargets;
  /** Increments on every regeneration click so each click yields a fresh seed population. */
  regenerationCount: number;
  /** Number of candidate plans to generate (MVP default: 10). */
  candidateCount: number;
}

/** A generated plan plus the metadata needed to reproduce or rank it. */
export interface CandidatePlan {
  plan: WeeklyMealPlanResult;
  seed: string;
  candidateIndex: number;
}

/** Context available to scoring criteria (extensible for future criteria). */
export interface ScoringContext {
  input: GenerationInput;
  // Future extension points:
  // previousPlan?: WeeklyMealPlanResult;   // diversity vs last locked plan
  // preferences?: ClientPreferences;        // client-specific weighting
}

/** Single scoring criterion. Lower score = better. */
export interface ScoringCriterion {
  id: string;
  weight: number;
  score(plan: CandidatePlan, context: ScoringContext): number;
}

/** Result of scoring one candidate. */
export interface PlanScore {
  total: number;
  breakdown: Record<string, number>;
}

/** Immutable scoring configuration: the list of criteria and their weights. */
export interface ScoringConfig {
  criteria: ScoringCriterion[];
}

/** A candidate paired with its score, ready for selection. */
export interface ScoredCandidate {
  plan: CandidatePlan;
  score: PlanScore;
}

/** Generates a population of candidate plans. */
export interface CandidateGenerator {
  generateCandidates(input: GenerationInput): CandidatePlan[];
}

/** Scores a single candidate against the generation context. */
export interface PlanScorer {
  score(plan: CandidatePlan, context: ScoringContext): PlanScore;
}

/** Selects the best candidate from a scored population. */
export interface PlanSelector {
  selectBest(scoredCandidates: ScoredCandidate[]): CandidatePlan;
}

/** Composition root for the optimization engine. */
export interface OptimizationEngineConfig {
  generator: CandidateGenerator;
  scorer: PlanScorer;
  selector: PlanSelector;
}