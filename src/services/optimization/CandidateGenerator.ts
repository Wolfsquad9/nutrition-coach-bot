import type { CandidateGenerator as CandidateGeneratorInterface, CandidatePlan, GenerationInput } from './types';
import { DEFAULT_CANDIDATE_COUNT } from './types';
import { createCandidateSeed } from './seedFactory';
import { generateWeeklyMealPlan } from '@/services/recipe/weeklyPlanGenerator';

/**
 * MVP candidate generator: produces N independent candidates, each generated
 * by the existing weekly meal plan pipeline but with a unique seed.
 *
 * Determinism contract:
 * - Same (clientId, regenerationCount, likedFoods, macroTargets) => identical candidate set.
 * - Different candidateIndex => different seed => different plan.
 * - Different regenerationCount => different seed population => different candidates.
 *
 * This class is intentionally thin: generation logic lives in the existing
 * weeklyPlanGenerator. Future algorithms (genetic, annealing) implement the
 * same CandidateGenerator interface with their own generation strategy.
 */
export class SeededCandidateGenerator implements CandidateGeneratorInterface {
  constructor(private readonly defaultCandidateCount = DEFAULT_CANDIDATE_COUNT) {}

  generateCandidates(input: GenerationInput): CandidatePlan[] {
    const candidateCount = input.candidateCount ?? this.defaultCandidateCount;
    const candidates: CandidatePlan[] = [];

    for (let i = 0; i < candidateCount; i++) {
      const seed = createCandidateSeed(input.clientId, input.regenerationCount, i);
      const plan = generateWeeklyMealPlan(input.likedFoods, input.macroTargets, seed, {
        allowedIngredientIds: input.allowedIngredientIds,
        // Phase 3C opt-in: forwarded verbatim. When undefined the object key is
        // still absent at runtime, so `options?.archetypeGeneration` in
        // generateRecipe stays falsy and the legacy path runs unchanged.
        archetypeGeneration: input.archetypeGeneration,
        dietType: input.dietType,
        // Phase 5 3A — cross-day ingredient diversity is a SOFT preference.
        // It is threaded from the coach-facing selection via GenerationInput;
        // when omitted it stays enabled so existing callers (and the
        // established optimizer default) keep the current behaviour, and an
        // explicit `false` runs candidates on the byte-identical legacy weekly
        // path. Scoping it to this weekly path never silently affects any
        // non-weekly generation path.
        weekIngredientDiversity: input.weekIngredientDiversity ?? true,
      });
      candidates.push({ plan, seed, candidateIndex: i });
    }

    return candidates;
  }
}