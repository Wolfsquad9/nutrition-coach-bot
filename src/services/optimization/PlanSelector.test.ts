import { describe, it, expect } from 'vitest';
import { PlanSelector } from './PlanSelector';
import type { CandidatePlan, ScoredCandidate } from './types';
import type { WeeklyMealPlanResult } from '@/services/recipe/types';

function makeCandidate(index: number, seed = `seed-${index}`): CandidatePlan {
  const plan = { days: [] } as unknown as WeeklyMealPlanResult;
  return { plan, seed, candidateIndex: index };
}

function makeScored(candidate: CandidatePlan, total: number): ScoredCandidate {
  return { plan: candidate, score: { total, breakdown: {} } };
}

describe('PlanSelector', () => {
  it('selects the candidate with the lowest score', () => {
    const selector = new PlanSelector();
    const scored: ScoredCandidate[] = [
      makeScored(makeCandidate(0), 5.0),
      makeScored(makeCandidate(1), 2.0),
      makeScored(makeCandidate(2), 8.0),
    ];
    const best = selector.selectBest(scored);
    expect(best.candidateIndex).toBe(1);
  });

  it('tie scores select the lowest candidateIndex', () => {
    const selector = new PlanSelector();
    const scored: ScoredCandidate[] = [
      makeScored(makeCandidate(3), 3.0),
      makeScored(makeCandidate(1), 3.0),
      makeScored(makeCandidate(0), 3.0),
      makeScored(makeCandidate(2), 3.0),
    ];
    const best = selector.selectBest(scored);
    expect(best.candidateIndex).toBe(0);
  });

  it('input array order does not change the selected result', () => {
    const selector = new PlanSelector();
    const scoredA: ScoredCandidate[] = [
      makeScored(makeCandidate(0), 5.0),
      makeScored(makeCandidate(1), 2.0),
      makeScored(makeCandidate(2), 8.0),
    ];
    const scoredB: ScoredCandidate[] = [
      makeScored(makeCandidate(2), 8.0),
      makeScored(makeCandidate(0), 5.0),
      makeScored(makeCandidate(1), 2.0),
    ];
    expect(selector.selectBest(scoredA).candidateIndex).toBe(selector.selectBest(scoredB).candidateIndex);
  });

  it('deterministic: repeated selection returns the same candidate', () => {
    const selector = new PlanSelector();
    const scored: ScoredCandidate[] = [
      makeScored(makeCandidate(0), 5.0),
      makeScored(makeCandidate(1), 2.0),
      makeScored(makeCandidate(2), 8.0),
    ];
    const a = selector.selectBest(scored);
    const b = selector.selectBest(scored);
    expect(a).toBe(b);
  });

  it('throws on empty input (documented behavior)', () => {
    const selector = new PlanSelector();
    expect(() => selector.selectBest([])).toThrow('cannot select from an empty candidate list');
  });

  it('selects the only candidate when input has one element', () => {
    const selector = new PlanSelector();
    const scored: ScoredCandidate[] = [makeScored(makeCandidate(0), 5.0)];
    const best = selector.selectBest(scored);
    expect(best.candidateIndex).toBe(0);
  });
});