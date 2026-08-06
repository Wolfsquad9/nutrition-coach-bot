import { describe, it, expect } from 'vitest';
import { SeededCandidateGenerator } from './CandidateGenerator';
import type { GenerationInput } from './types';

const LIKED_FOODS = [
  'chicken-breast', 'eggs', 'salmon', 'greek-yogurt',
  'brown-rice', 'oats', 'sweet-potato', 'banana',
  'apple', 'broccoli', 'spinach', 'olive-oil',
  'almonds', 'peanut-butter', 'garlic', 'lemon',
];

const MACRO_TARGETS = {
  calories: 2200,
  protein: 165,
  carbs: 220,
  fat: 75,
};

function makeInput(overrides: Partial<GenerationInput> = {}): GenerationInput {
  return {
    clientId: 'client-1',
    likedFoods: LIKED_FOODS,
    macroTargets: MACRO_TARGETS,
    regenerationCount: 1,
    candidateCount: 10,
    ...overrides,
  };
}

describe('SeededCandidateGenerator', () => {
  it('produces exactly N candidates (default 10)', () => {
    const candidates = new SeededCandidateGenerator().generateCandidates(makeInput());
    expect(candidates).toHaveLength(10);
  });

  it('produces exactly N candidates when candidateCount is overridden', () => {
    const candidates = new SeededCandidateGenerator().generateCandidates(makeInput({ candidateCount: 5 }));
    expect(candidates).toHaveLength(5);
  });

  it('uses the configured default candidate count when input omits it', () => {
    const input = makeInput();
    delete (input as Partial<GenerationInput>).candidateCount;
    const candidates = new SeededCandidateGenerator(3).generateCandidates(input);
    expect(candidates).toHaveLength(3);
  });

  it('assigns unique seeds to every candidate', () => {
    const candidates = new SeededCandidateGenerator().generateCandidates(makeInput());
    const seeds = candidates.map(c => c.seed);
    expect(new Set(seeds).size).toBe(seeds.length);
  });

  it('assigns sequential candidate indices 0..N-1', () => {
    const candidates = new SeededCandidateGenerator().generateCandidates(makeInput());
    expect(candidates.map(c => c.candidateIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('produces identical candidate sets for the same input (deterministic)', () => {
    const generator = new SeededCandidateGenerator();
    const input = makeInput();
    const setA = generator.generateCandidates(input);
    const setB = generator.generateCandidates(input);

    expect(setA.map(c => c.seed)).toEqual(setB.map(c => c.seed));
    expect(setA.map(c => c.plan.weeklyTotalMacros)).toEqual(setB.map(c => c.plan.weeklyTotalMacros));
  });

  it('produces different candidate sets for different regeneration counts', () => {
    const generator = new SeededCandidateGenerator();
    const setA = generator.generateCandidates(makeInput({ regenerationCount: 1 }));
    const setB = generator.generateCandidates(makeInput({ regenerationCount: 2 }));
    expect(setA.map(c => c.seed)).not.toEqual(setB.map(c => c.seed));
  });

  it('produces different candidate sets for different clients', () => {
    const generator = new SeededCandidateGenerator();
    const setA = generator.generateCandidates(makeInput({ clientId: 'client-A' }));
    const setB = generator.generateCandidates(makeInput({ clientId: 'client-B' }));
    expect(setA.map(c => c.seed)).not.toEqual(setB.map(c => c.seed));
  });

  it('produces different plans across candidates (not all identical)', () => {
    const candidates = new SeededCandidateGenerator().generateCandidates(makeInput());
    const recipeTexts = candidates.map(c =>
      c.plan.days.map(d => d.plan.dailyPlan.breakfast.recipeText).join('|')
    );
    expect(new Set(recipeTexts).size).toBeGreaterThan(1);
  });
});