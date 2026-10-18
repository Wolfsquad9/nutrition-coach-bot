import { describe, it, expect } from 'vitest';
import { SeededCandidateGenerator } from './CandidateGenerator';
import { createCandidateSeed } from './seedFactory';
import { generateWeeklyMealPlan } from '@/services/recipe/weeklyPlanGenerator';
import type { CandidatePlan, GenerationInput } from './types';

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

/* ============================================================================
 * Meal variety — the coach-facing preference threaded into candidate generation
 * ==========================================================================*/

/**
 * Counts ingredient ids that appear more than once across the 7 days for the
 * lunch + dinner slots (the slots where cross-day repetition is most visible
 * to the athlete). Soft-preference measurement only.
 */
function lunchDinnerRepeats(candidates: CandidatePlan[]): number {
  let repeats = 0;
  for (const { plan } of candidates) {
    const seen = new Set<string>();
    for (const day of plan.days) {
      for (const slot of ['lunch', 'dinner'] as const) {
        for (const ingredient of day.plan.dailyPlan[slot].ingredients) {
          if (seen.has(ingredient.id)) repeats++;
          else seen.add(ingredient.id);
        }
      }
    }
  }
  return repeats;
}

const NARROW_POOL = ['eggs', 'greek-yogurt', 'skyr', 'turkey-breast', 'salmon'];

describe('meal variety preference threading', () => {
  const generator = new SeededCandidateGenerator();

  it('preserves the established optimizer default: omitted preference == explicit true', () => {
    const omitted = generator.generateCandidates(makeInput());
    const explicit = generator.generateCandidates(makeInput({ weekIngredientDiversity: true }));
    expect(omitted.map(c => JSON.stringify(c.plan))).toEqual(
      explicit.map(c => JSON.stringify(c.plan)),
    );
  });

  it('explicit false runs candidates on the byte-identical legacy weekly path', () => {
    const input = makeInput({ weekIngredientDiversity: false, allowedIngredientIds: LIKED_FOODS });
    const traditional = generator.generateCandidates(input);

    // Independent legacy reference: the same seeded weekly generation with the
    // diversity flag OMITTED (the established contract: absent == disabled).
    const legacy = LIKED_FOODS.length > 0
      ? Array.from({ length: input.candidateCount }, (_, i) => ({
          plan: generateWeeklyMealPlan(
            LIKED_FOODS,
            MACRO_TARGETS,
            createCandidateSeed(input.clientId, input.regenerationCount, i),
            { allowedIngredientIds: LIKED_FOODS },
          ),
        }))
      : [];

    expect(traditional.map(c => JSON.stringify(c.plan))).toEqual(
      legacy.map(p => JSON.stringify(p.plan)),
    );
  });

  it('more variety is a soft preference: repetition never increases and meals stay full', () => {
    const fixture = makeInput({
      likedFoods: NARROW_POOL,
      allowedIngredientIds: NARROW_POOL,
      candidateCount: 6,
    });
    const more = generator.generateCandidates({ ...fixture, weekIngredientDiversity: true });
    const traditional = generator.generateCandidates({ ...fixture, weekIngredientDiversity: false });

    // Soft preference — may tie when the pool is exhausted, must never worsen.
    expect(lunchDinnerRepeats(more)).toBeLessThanOrEqual(lunchDinnerRepeats(traditional));

    // The mechanism actually executes on this fixture: same seeds, different
    // plans for at least one candidate (not a no-op flag).
    const anyDifferent = more.some(
      (candidate, i) => JSON.stringify(candidate.plan) !== JSON.stringify(traditional[i].plan),
    );
    expect(anyDifferent).toBe(true);

    // Never empties a meal — meals stay full in both modes.
    for (const { plan } of [...more, ...traditional]) {
      expect(plan.days).toHaveLength(7);
      for (const day of plan.days) {
        for (const slot of ['breakfast', 'lunch', 'dinner', 'snack'] as const) {
          expect(day.plan.dailyPlan[slot].ingredients.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('hard eligibility stays authoritative in both modes', () => {
    const allowList = ['oats', 'banana', 'chia-seeds', 'blueberries'];
    const fixture = makeInput({ allowedIngredientIds: allowList, candidateCount: 4 });

    for (const flag of [true, false]) {
      const candidates = generator.generateCandidates({
        ...fixture,
        weekIngredientDiversity: flag,
      });
      for (const { plan } of candidates) {
        for (const day of plan.days) {
          for (const slot of ['breakfast', 'lunch', 'dinner', 'snack'] as const) {
            for (const ingredient of day.plan.dailyPlan[slot].ingredients) {
              expect(allowList).toContain(ingredient.id);
            }
          }
        }
      }
    }
  });

  it('nutrition stays authoritative: day totals remain the canonical sum of meals', () => {
    const fixture = makeInput({ candidateCount: 3 });
    for (const flag of [true, false]) {
      for (const { plan } of generator.generateCandidates({ ...fixture, weekIngredientDiversity: flag })) {
        for (const day of plan.days) {
          const mealCalories = (['breakfast', 'lunch', 'dinner', 'snack'] as const)
            .reduce((sum, slot) => sum + day.plan.dailyPlan[slot].macros.calories, 0);
          expect(day.plan.totalMacros.calories).toBe(mealCalories);
        }
      }
    }
  });
});