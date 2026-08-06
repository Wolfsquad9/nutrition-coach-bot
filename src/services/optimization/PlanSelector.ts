import type {
  CandidatePlan,
  PlanSelector as PlanSelectorInterface,
  ScoredCandidate,
} from './types';

/**
 * Deterministic best-candidate selector.
 *
 * Convention: lower score = better.
 *
 * Selection rules:
 * - Returns the CandidatePlan with the lowest `score.total`.
 * - Tie-break: if multiple candidates have identical `score.total`,
 *   selects the one with the lowest `candidateIndex`.
 * - Empty input: throws a documented error (the interface returns
 *   `CandidatePlan`, not `CandidatePlan | undefined`).
 *
 * Determinism: the result depends only on the scored candidates and their
 * candidateIndex — not on the order of the input array.
 */
export class PlanSelector implements PlanSelectorInterface {
  selectBest(scoredCandidates: ScoredCandidate[]): CandidatePlan {
    if (scoredCandidates.length === 0) {
      throw new Error('PlanSelector.selectBest: cannot select from an empty candidate list.');
    }

    let best = scoredCandidates[0];

    for (let i = 1; i < scoredCandidates.length; i++) {
      const current = scoredCandidates[i];
      const isLowerScore = current.score.total < best.score.total;
      const isTieWithLowerIndex =
        current.score.total === best.score.total &&
        current.plan.candidateIndex < best.plan.candidateIndex;

      if (isLowerScore || isTieWithLowerIndex) {
        best = current;
      }
    }

    return best.plan;
  }
}