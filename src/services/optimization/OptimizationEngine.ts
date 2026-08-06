import type {
  CandidateGenerator,
  CandidatePlan,
  GenerationInput,
  OptimizationEngineConfig,
  PlanScorer,
  PlanSelector,
  ScoredCandidate,
  ScoringContext,
} from './types';
import { DEFAULT_CANDIDATE_COUNT } from './types';
import { SeededCandidateGenerator } from './CandidateGenerator';
import { PlanScorer as PlanScorerImpl, createDefaultScoringConfig } from './PlanScorer';
import { PlanSelector as PlanSelectorImpl } from './PlanSelector';

/**
 * Stateless orchestrator for the optimization pipeline.
 *
 * Flow: CandidateGenerator → PlanScorer → PlanSelector
 *
 * The engine owns no state. It receives all inputs via `generate(input)`
 * and delegates to the composed generator, scorer, and selector.
 *
 * Future algorithms (genetic, annealing) plug in by implementing the
 * same three interfaces — no engine changes required.
 */
export class OptimizationEngine {
  private readonly generator: CandidateGenerator;
  private readonly scorer: PlanScorer;
  private readonly selector: PlanSelector;

  constructor(config: OptimizationEngineConfig) {
    this.generator = config.generator;
    this.scorer = config.scorer;
    this.selector = config.selector;
  }

  generate(input: GenerationInput): CandidatePlan {
    const candidates = this.generator.generateCandidates(input);

    const context: ScoringContext = { input };

    const scored: ScoredCandidate[] = candidates.map((plan) => ({
      plan,
      score: this.scorer.score(plan, context),
    }));

    return this.selector.selectBest(scored);
  }
}

/**
 * Module-level factory: creates a shared engine instance with default
 * components so the UI doesn't recreate generator/scorer/selector on
 * every render.
 */
export function createDefaultOptimizationEngine(): OptimizationEngine {
  return new OptimizationEngine({
    generator: new SeededCandidateGenerator(DEFAULT_CANDIDATE_COUNT),
    scorer: new PlanScorerImpl(createDefaultScoringConfig()),
    selector: new PlanSelectorImpl(),
  });
}
