import { describe, it, expect, vi } from 'vitest';
import { OptimizationEngine } from './OptimizationEngine';
import type {
  CandidateGenerator,
  CandidatePlan,
  GenerationInput,
  PlanScorer,
  PlanSelector,
  ScoredCandidate,
} from './types';
import type { WeeklyMealPlanResult } from '@/services/recipe/types';

function makeCandidate(index: number): CandidatePlan {
  return {
    plan: { days: [] } as unknown as WeeklyMealPlanResult,
    seed: `seed-${index}`,
    candidateIndex: index,
  };
}

function makeInput(overrides: Partial<GenerationInput> = {}): GenerationInput {
  return {
    clientId: 'client-1',
    likedFoods: ['eggs', 'oats'],
    macroTargets: { calories: 2200, protein: 165, carbs: 220, fat: 75 },
    regenerationCount: 1,
    candidateCount: 3,
    ...overrides,
  };
}

describe('OptimizationEngine', () => {
  it('calls the generator once', () => {
    const generateSpy = vi.fn(() => [makeCandidate(0), makeCandidate(1), makeCandidate(2)]);
    const generator: CandidateGenerator = { generateCandidates: generateSpy };
    const scorer: PlanScorer = { score: () => ({ total: 0, breakdown: {} }) };
    const selector: PlanSelector = { selectBest: (s) => s[0].plan };

    const engine = new OptimizationEngine({ generator, scorer, selector });
    engine.generate(makeInput());

    expect(generateSpy).toHaveBeenCalledTimes(1);
  });

  it('calls the scorer for every generated candidate', () => {
    const candidates = [makeCandidate(0), makeCandidate(1), makeCandidate(2)];
    const generator: CandidateGenerator = { generateCandidates: () => candidates };
    const scoreSpy = vi.fn(() => ({ total: 0, breakdown: {} }));
    const scorer: PlanScorer = { score: scoreSpy };
    const selector: PlanSelector = { selectBest: (s) => s[0].plan };

    const engine = new OptimizationEngine({ generator, scorer, selector });
    engine.generate(makeInput());

    expect(scoreSpy).toHaveBeenCalledTimes(3);
  });

  it('passes all scored candidates to the selector', () => {
    const candidates = [makeCandidate(0), makeCandidate(1), makeCandidate(2)];
    const generator: CandidateGenerator = { generateCandidates: () => candidates };
    const scorer: PlanScorer = { score: () => ({ total: 1, breakdown: {} }) };
    const selectSpy = vi.fn((s: ScoredCandidate[]) => s[0].plan);
    const selector: PlanSelector = { selectBest: selectSpy };

    const engine = new OptimizationEngine({ generator, scorer, selector });
    engine.generate(makeInput());

    expect(selectSpy).toHaveBeenCalledTimes(1);
    const passed = selectSpy.mock.calls[0][0];
    expect(passed).toHaveLength(3);
  });

  it('returns exactly the selector result', () => {
    const candidates = [makeCandidate(0), makeCandidate(1), makeCandidate(2)];
    const generator: CandidateGenerator = { generateCandidates: () => candidates };
    const scorer: PlanScorer = { score: () => ({ total: 0, breakdown: {} }) };
    const winner = makeCandidate(2);
    const selector: PlanSelector = { selectBest: () => winner };

    const engine = new OptimizationEngine({ generator, scorer, selector });
    const result = engine.generate(makeInput());

    expect(result).toBe(winner);
  });

  it('same input + same regenerationCount = identical winner (deterministic)', () => {
    const candidates = [makeCandidate(0), makeCandidate(1)];
    const generator: CandidateGenerator = { generateCandidates: () => candidates };
    const scorer: PlanScorer = {
      score: (c) => ({ total: c.candidateIndex, breakdown: {} }),
    };
    const selector: PlanSelector = {
      selectBest: (s) => s.reduce((best, cur) => (cur.score.total < best.score.total ? cur : best)).plan,
    };

    const engine = new OptimizationEngine({ generator, scorer, selector });
    const input = makeInput();
    const a = engine.generate(input);
    const b = engine.generate(input);

    expect(a.candidateIndex).toBe(b.candidateIndex);
  });

  it('different regenerationCount produces different winner (via mock)', () => {
    let callCount = 0;
    const candidatesA = [makeCandidate(0), makeCandidate(1)];
    const candidatesB = [makeCandidate(2), makeCandidate(3)];

    const generator: CandidateGenerator = {
      generateCandidates: () => {
        callCount++;
        return callCount === 1 ? candidatesA : candidatesB;
      },
    };
    const scorer: PlanScorer = { score: () => ({ total: 0, breakdown: {} }) };
    const selector: PlanSelector = { selectBest: (s) => s[0].plan };

    const engine = new OptimizationEngine({ generator, scorer, selector });
    const a = engine.generate(makeInput({ regenerationCount: 1 }));
    const b = engine.generate(makeInput({ regenerationCount: 2 }));

    expect(a.candidateIndex).not.toBe(b.candidateIndex);
  });
});