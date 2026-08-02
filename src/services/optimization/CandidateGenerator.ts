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
      const plan = generateWeeklyMealPlan(input.likedFoods, input.macroTargets, seed);
      candidates.push({ plan, seed, candidateIndex: i });
    }

    return candidates;
  }
}