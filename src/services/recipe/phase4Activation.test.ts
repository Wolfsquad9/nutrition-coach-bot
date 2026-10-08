/**
 * Phase 4 — controlled production activation of the archetype pipeline.
 *
 * Two things are pinned here:
 *  1. ONE configuration point decides whether archetypes are live, and it
 *     reaches both the daily and the weekly/optimizer path.
 *  2. An activated generation that cannot satisfy any archetype degrades to the
 *     legacy selector OVER THE SAME ALLOW-LIST instead of throwing, which would
 *     otherwise surface upstream as an empty production meal.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  RECIPE_ACTIVATION,
  buildRecipeGenerationOptions,
  canFallBackToLegacy,
  generateRecipe,
  generateFullDayMealPlan,
  generateWeeklyMealPlan,
  resolveEligibleIngredients,
} from '@/services/recipeService';
import { SeededCandidateGenerator } from '@/services/optimization/CandidateGenerator';
import { DEFAULT_CANDIDATE_COUNT, type GenerationInput } from '@/services/optimization/types';
import { selectArchetypeForMeal } from '@/services/recipe/archetypeSelection';
import { getSuitableIngredients } from '@/services/recipe/ingredientUtils';
import { createSeededRng } from '@/utils/random';
import { coreIngredients } from '@/data/ingredientDatabase';
import type { MacroTargets } from '@/types';

const TARGETS: MacroTargets = { calories: 2000, protein: 120, carbs: 250, fat: 55 };

const ALL_IDS = coreIngredients.map((ingredient) => ingredient.id);
const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

const activated = (allowedIngredientIds: readonly string[], dietType: string | null = null) =>
  buildRecipeGenerationOptions({ allowedIngredientIds, dietType: dietType as never });

const disabled = (allowedIngredientIds: readonly string[]) =>
  buildRecipeGenerationOptions({
    allowedIngredientIds,
    activation: { archetypeGeneration: false },
  });

describe('Phase 4 · (1) single activation configuration', () => {
  it('production activation is ON', () => {
    expect(RECIPE_ACTIVATION.archetypeGeneration).toBe(true);
  });

  it('the builder is the only place the flag is decided, and it is overridable', () => {
    expect(buildRecipeGenerationOptions({ allowedIngredientIds: ['brown-rice'] }).archetypeGeneration).toBe(true);
    expect(
      buildRecipeGenerationOptions({
        allowedIngredientIds: ['brown-rice'],
        activation: { archetypeGeneration: false },
      }).archetypeGeneration,
    ).toBe(false);
  });

  it('no `archetypeGeneration: true` literal exists outside the activation module', () => {
    const files = [
      'src/components/NutritionTabContent.tsx',
      'src/components/ingredient-manager/recipeActionHandler.ts',
      'src/services/optimization/CandidateGenerator.ts',
      'src/services/optimization/OptimizationEngine.ts',
      'src/services/recipe/mealPlanGenerator.ts',
      'src/services/recipe/weeklyPlanGenerator.ts',
    ];
    for (const file of files) {
      expect(readFileSync(file, 'utf8')).not.toMatch(/archetypeGeneration:\s*true/);
    }
  });

  it('the builder always carries the caller allow-list through verbatim', () => {
    const allowed = ['chicken-breast', 'brown-rice'];
    for (const flag of [true, false]) {
      const options = buildRecipeGenerationOptions({
        allowedIngredientIds: allowed,
        activation: { archetypeGeneration: flag },
      });
      expect(options.allowedIngredientIds).toEqual(allowed);
    }
  });
});
describe('Phase 4 · (2) activation propagates through the daily path', () => {
  it('a daily plan generated through the config produces real meals', () => {
    const plan = generateFullDayMealPlan(ALL_IDS, TARGETS, 'p4-daily', activated(ALL_IDS));
    const used = MEALS.map((meal) => plan.dailyPlan[meal].ingredients.length);
    expect(used.some((count) => count > 0)).toBe(true);
  });

  it('the activated daily plan differs from the disabled one (activation is real)', () => {
    const textOf = (plan: ReturnType<typeof generateFullDayMealPlan>) =>
      MEALS.map((meal) => plan.dailyPlan[meal].recipeText).join('|');
    const on = textOf(generateFullDayMealPlan(ALL_IDS, TARGETS, 'p4-daily-diff', activated(ALL_IDS)));
    const off = textOf(generateFullDayMealPlan(ALL_IDS, TARGETS, 'p4-daily-diff', disabled(ALL_IDS)));
    expect(on).not.toBe(off);
  });
});

describe('Phase 4 · (3) activation propagates through the weekly/optimizer path', () => {
  const baseInput = (): GenerationInput => ({
    clientId: 'client-1',
    likedFoods: ALL_IDS,
    macroTargets: TARGETS,
    regenerationCount: 0,
    candidateCount: 2,
  });

  it('candidate plans honour archetypeGeneration forwarded from the input', () => {
    const candidates = new SeededCandidateGenerator(DEFAULT_CANDIDATE_COUNT).generateCandidates({
      ...baseInput(),
      archetypeGeneration: true,
      allowedIngredientIds: ALL_IDS,
    });
    expect(candidates).toHaveLength(2);
    const meals = candidates[0].plan.days.flatMap((day) => MEALS.map((meal) => day.plan.dailyPlan[meal]));
    expect(meals.some((meal) => meal.ingredients.length > 0)).toBe(true);
  });

  it('the config shape matches GenerationInput, so it can be spread in', () => {
    const input: GenerationInput = {
      ...baseInput(),
      candidateCount: 1,
      ...activated(ALL_IDS, 'omnivore'),
    };
    expect(input.archetypeGeneration).toBe(true);
    expect(input.dietType).toBe('omnivore');
    expect(new SeededCandidateGenerator(1).generateCandidates(input)).toHaveLength(1);
  });

  it('weekly generation stays inside the allow-list when archetypes are active', () => {
    const allowed = ['chicken-breast', 'brown-rice', 'broccoli', 'olive-oil', 'banana', 'eggs'];
    const plan = generateWeeklyMealPlan(ALL_IDS, TARGETS, 'p4-week', activated(allowed));
    const used = plan.days
      .flatMap((day) => MEALS.map((meal) => day.plan.dailyPlan[meal]))
      .flatMap((meal) => meal.ingredients.map((ingredient) => ingredient.id));
    expect(used.length).toBeGreaterThan(0);
    for (const id of used) expect(allowed).toContain(id);
  });
});

describe('Phase 4 · (4) an activated recipe carries archetypeId', () => {
  it('produces a recipe with an archetypeId on a rich pool', () => {
    const recipe = generateRecipe(ALL_IDS, 'lunch', 'p4-arch', activated(ALL_IDS));
    expect(typeof recipe.archetypeId).toBe('string');
    expect(recipe.selectedIngredients.length).toBeGreaterThan(0);
  });

  it('several slots yield several distinct archetypes', () => {
    const ids = MEALS.map(
      (meal) => generateRecipe(ALL_IDS, meal, `p4-arch-${meal}`, activated(ALL_IDS)).archetypeId,
    );
    expect(new Set(ids).size).toBeGreaterThan(1);
  });
});
describe('Phase 4 · (5) unsatisfiable archetype falls back to the legacy generator', () => {
  // A thin vegan breakfast pool: no archetype can satisfy its required roles, so
  // the archetype path has nothing to pick.
  const THIN = ['oats', 'banana', 'chia-seeds'];

  it('does not throw when no archetype is satisfiable', () => {
    expect(() => generateRecipe(THIN, 'breakfast', 'p4-fallback', activated(THIN))).not.toThrow();
  });

  it('returns a usable legacy recipe with no archetypeId', () => {
    const recipe = generateRecipe(THIN, 'breakfast', 'p4-fallback', activated(THIN));
    expect(recipe.archetypeId).toBeUndefined();
    expect(recipe.selectedIngredients.length).toBeGreaterThan(0);
    expect(recipe.name.length).toBeGreaterThan(0);
    expect(recipe.instructions.length).toBeGreaterThan(0);
  });

  it('confirms the archetype path genuinely had no selection (so fallback ran)', () => {
    const pool = getSuitableIngredients(THIN, 'breakfast', activated(THIN));
    expect(selectArchetypeForMeal(pool, 'breakfast', null, createSeededRng('p4-fallback'))).toBeNull();
    expect(canFallBackToLegacy(pool)).toBe(true);
  });

  it('still throws when the eligible pool is genuinely empty (nothing to fall back to)', () => {
    expect(() => generateRecipe([], 'breakfast', 'p4-empty', activated([]))).toThrow(
      /No suitable ingredients selected/,
    );
    expect(canFallBackToLegacy([])).toBe(false);
  });
});

describe('Phase 4 · (6) fallback respects the exact same allow-list', () => {
  it('the fallback recipe contains only allow-listed ingredients', () => {
    const allowed = ['oats', 'banana', 'chia-seeds'];
    const recipe = generateRecipe(ALL_IDS, 'breakfast', 'p4-fb-allow', activated(allowed));
    expect(recipe.archetypeId).toBeUndefined();
    for (const ingredient of recipe.selectedIngredients) expect(allowed).toContain(ingredient.id);
  });

  it('a blocked ingredient cannot reappear through the fallback path', () => {
    const blocked = ['salmon', 'eggs', 'greek-yogurt', 'almonds', 'walnuts', 'peanut-butter', 'tuna'];
    const allowed = ['oats', 'banana', 'chia-seeds', 'blueberries'];
    const pool = resolveEligibleIngredients({
      preferredIngredientIds: [...allowed, ...blocked],
      blockedIngredientIds: blocked,
      dietType: 'omnivore',
    });
    const recipe = generateRecipe([...pool.ingredientIds], 'breakfast', 'p4-fb-blocked', activated(pool.ingredientIds));
    for (const ingredient of recipe.selectedIngredients) {
      expect(pool.ingredientIds).toContain(ingredient.id);
      expect(blocked).not.toContain(ingredient.id);
    }
  });

  it('a whole activated day never leaves the allow-list, fallback or not', () => {
    const allowed = ['oats', 'banana', 'chia-seeds', 'blueberries'];
    const plan = generateFullDayMealPlan(ALL_IDS, TARGETS, 'p4-fb-day', activated(allowed));
    const used = MEALS.flatMap((meal) => plan.dailyPlan[meal].ingredients.map((ingredient) => ingredient.id));
    for (const id of used) expect(allowed).toContain(id);
  });
});

describe('Phase 4 · (7) disabled activation preserves legacy behaviour', () => {
  it('a disabled recipe has no archetypeId', () => {
    expect(generateRecipe(ALL_IDS, 'lunch', 'p4-off', disabled(ALL_IDS)).archetypeId).toBeUndefined();
  });

  it('disabled output is identical to passing no options at all', () => {
    const legacy = generateRecipe(ALL_IDS, 'dinner', 'p4-off-identical');
    const viaConfig = generateRecipe(ALL_IDS, 'dinner', 'p4-off-identical', disabled(ALL_IDS));
    expect(viaConfig.selectedIngredients.map((i) => i.id)).toEqual(
      legacy.selectedIngredients.map((i) => i.id),
    );
    expect(viaConfig.name).toBe(legacy.name);
    expect(viaConfig.instructions).toEqual(legacy.instructions);
    expect(viaConfig.macrosPerServing).toEqual(legacy.macrosPerServing);
  });

  it('disabled daily generation is byte-identical to the legacy call', () => {
    const legacy = generateFullDayMealPlan(ALL_IDS, TARGETS, 'p4-off-day');
    const viaConfig = generateFullDayMealPlan(ALL_IDS, TARGETS, 'p4-off-day', disabled(ALL_IDS));
    expect(JSON.stringify(viaConfig.dailyPlan)).toBe(JSON.stringify(legacy.dailyPlan));
  });
});

describe('Phase 4 · (8) generation remains deterministic', () => {
  it('the same seed produces an identical activated recipe', () => {
    const a = generateRecipe(ALL_IDS, 'lunch', 'p4-det', activated(ALL_IDS));
    const b = generateRecipe(ALL_IDS, 'lunch', 'p4-det', activated(ALL_IDS));
    expect(b.archetypeId).toBe(a.archetypeId);
    expect(b.selectedIngredients.map((i) => i.id)).toEqual(a.selectedIngredients.map((i) => i.id));
  });

  it('the same seed produces an identical activated weekly plan', () => {
    const shape = (plan: ReturnType<typeof generateWeeklyMealPlan>) =>
      JSON.stringify(plan.days.map((day) => day.plan.dailyPlan));
    expect(shape(generateWeeklyMealPlan(ALL_IDS, TARGETS, 'p4-det-week', activated(ALL_IDS)))).toBe(
      shape(generateWeeklyMealPlan(ALL_IDS, TARGETS, 'p4-det-week', activated(ALL_IDS))),
    );
  });

  it('the fallback path is deterministic too', () => {
    const thin = ['oats', 'banana', 'chia-seeds'];
    const a = generateRecipe(thin, 'breakfast', 'p4-det-fb', activated(thin));
    const b = generateRecipe(thin, 'breakfast', 'p4-det-fb', activated(thin));
    expect(b.selectedIngredients.map((i) => i.id)).toEqual(a.selectedIngredients.map((i) => i.id));
  });

  it('different seeds still explore different structures', () => {
    const ids = new Set(
      Array.from({ length: 24 }, (_, i) =>
        generateRecipe(ALL_IDS, 'lunch', `p4-variety-${i}`, activated(ALL_IDS)).archetypeId,
      ),
    );
    expect(ids.size).toBeGreaterThan(1);
  });
});