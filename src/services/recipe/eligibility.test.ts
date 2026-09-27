/**
 * Phase 1 — eligibility boundary.
 *
 * Proves the safety contract the audit demanded:
 *   preferred → minus blocked → minus allergens → minus diet → minus disliked
 * is the ONLY pool that can reach generation, and that blocked always wins.
 *
 * These are safety tests, not culinary tests: each one fails if a restriction
 * can be bypassed.
 */

import { describe, it, expect } from 'vitest';
import {
  resolveEligibleIngredients,
  normalizeAllergenTokens,
  isIngredientCompatibleWithDiet,
  findDislikedMatch,
} from '@/services/recipe/eligibility';
import { generateRecipe, generateFullDayMealPlan, generateWeeklyMealPlan } from '@/services/recipeService';
import { coreIngredients } from '@/data/ingredientDatabase';
import { determineDietTypes, determineAllergens } from '@/services/recipe/nutritionCalculations';
import type { MacroTargets } from '@/types';

const IDS = coreIngredients.map((ingredient) => ingredient.id);
const byId = (id: string) => coreIngredients.find((ingredient) => ingredient.id === id)!;

const TARGETS: MacroTargets = { calories: 2000, protein: 120, carbs: 250, fat: 55 };

/** Ingredient ids referenced by any ingredient name or id in generated meals. */
const ingredientIdsInPlan = (meals: { ingredients?: { name?: string; ingredientId?: string }[] }[]) =>
  meals
    .flatMap((meal) => meal?.ingredients ?? [])
    .map((item) => item.ingredientId ?? item.name ?? '')
    .map((token) => IDS.find((id) => byId(id).name === token || id === token) ?? '')
    .filter(Boolean);

describe('Phase 1 · eligibility · (1) preferred ingredients are allowed', () => {
  it('keeps every preferred ingredient that carries no restriction', () => {
    const pool = resolveEligibleIngredients({
      preferredIngredientIds: ['chicken-breast', 'brown-rice', 'broccoli', 'olive-oil'],
    });
    expect(pool.ingredientIds).toEqual(['chicken-breast', 'brown-rice', 'broccoli', 'olive-oil']);
    expect(pool.excluded).toEqual([]);
  });

  it('preserves the caller order and de-duplicates', () => {
    const pool = resolveEligibleIngredients({
      preferredIngredientIds: ['broccoli', 'brown-rice', 'broccoli', '  brown-rice  '],
    });
    expect(pool.ingredientIds).toEqual(['broccoli', 'brown-rice']);
  });
});

describe('Phase 1 · eligibility · (2)(3) blocked ingredients never enter generation', () => {
  it('excludes a blocked ingredient that was never preferred', () => {
    const pool = resolveEligibleIngredients({
      preferredIngredientIds: ['chicken-breast', 'brown-rice'],
      blockedIngredientIds: ['mango'],
    });
    expect(pool.ingredientIds).toEqual(['chicken-breast', 'brown-rice']);
    expect(pool.excluded).toContainEqual(
      expect.objectContaining({ id: 'mango', reason: 'blocked' }),
    );
  });

  it('blocked WINS when an id is in both lists (hard invariant)', () => {
    const pool = resolveEligibleIngredients({
      preferredIngredientIds: ['chicken-breast', 'brown-rice', 'eggs'],
      blockedIngredientIds: ['chicken-breast', 'eggs'],
    });
    expect(pool.ingredientIds).toEqual(['brown-rice']);
    expect(pool.excluded).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'chicken-breast', reason: 'blocked-and-preferred' }),
        expect.objectContaining({ id: 'eggs', reason: 'blocked-and-preferred' }),
      ]),
    );
  });

  it('blocked wins even when an allergy would also exclude it', () => {
    const pool = resolveEligibleIngredients({
      preferredIngredientIds: ['greek-yogurt'],
      blockedIngredientIds: ['greek-yogurt'],
      allergies: ['dairy'],
    });
    expect(pool.ingredientIds).toEqual([]);
  });
});

describe('Phase 1 · eligibility · (4) unknown ingredient ids are rejected', () => {
  it('drops ids that are not in the library and reports them', () => {
    const pool = resolveEligibleIngredients({
      preferredIngredientIds: ['brown-rice', 'unicorn-steak', '', '   '],
    });
    expect(pool.ingredientIds).toEqual(['brown-rice']);
    expect(pool.excluded).toEqual([{ id: 'unicorn-steak', reason: 'not-in-library' }]);
  });

  it('warns about unknown blocked ids without throwing', () => {
    const pool = resolveEligibleIngredients({
      preferredIngredientIds: ['brown-rice'],
      blockedIngredientIds: ['not-a-real-ingredient'],
    });
    expect(pool.ingredientIds).toEqual(['brown-rice']);
    expect(pool.warnings.join(' ')).toContain('not-a-real-ingredient');
  });

  it('returns an empty pool (not a throw) when nothing is eligible', () => {
    const pool = resolveEligibleIngredients({ preferredIngredientIds: ['nope', 'also-nope'] });
    expect(pool.ingredientIds).toEqual([]);
    expect(pool.ingredients).toEqual([]);
  });
});
describe('Phase 1 · eligibility · (7) supported diet restrictions', () => {
  it('vegan excludes animal products, dairy and eggs', () => {
    const pool = resolveEligibleIngredients({
      preferredIngredientIds: [
        'tofu', 'lentils', 'black-beans', 'brown-rice', 'broccoli',
        'chicken-breast', 'salmon', 'greek-yogurt', 'cottage-cheese', 'eggs',
      ],
      dietType: 'vegan',
    });
    expect(pool.ingredientIds).toEqual(['tofu', 'lentils', 'black-beans', 'brown-rice', 'broccoli']);
  });

  it('vegetarian still allows dairy and eggs but not meat/fish', () => {
    const pool = resolveEligibleIngredients({
      preferredIngredientIds: ['greek-yogurt', 'eggs', 'tofu', 'chicken-breast', 'salmon'],
      dietType: 'vegetarian',
    });
    expect(pool.ingredientIds).toEqual(['greek-yogurt', 'eggs', 'tofu']);
  });

  it('pescatarian allows fish but not meat', () => {
    const pool = resolveEligibleIngredients({
      preferredIngredientIds: ['salmon', 'tofu', 'greek-yogurt', 'chicken-breast'],
      dietType: 'pescatarian',
    });
    expect(pool.ingredientIds).toEqual(['salmon', 'tofu', 'greek-yogurt']);
  });

  it('omnivore and no diet exclude nothing', () => {
    const all = ['chicken-breast', 'salmon', 'eggs', 'greek-yogurt', 'tofu'];
    expect(resolveEligibleIngredients({ preferredIngredientIds: all, dietType: 'omnivore' }).ingredientIds).toEqual(all);
    expect(resolveEligibleIngredients({ preferredIngredientIds: all, dietType: null }).ingredientIds).toEqual(all);
  });

  it('fails closed: an ingredient with no dietTags is not assumed vegan-safe', () => {
    expect(isIngredientCompatibleWithDiet({ ...byId('tofu'), dietTags: undefined }, 'vegan')).toBe(false);
  });

  it('reports keto/paleo as unenforceable rather than guessing', () => {
    const keto = resolveEligibleIngredients({
      preferredIngredientIds: ['chicken-breast', 'broccoli'],
      dietType: 'keto',
    });
    expect(keto.ingredientIds).toEqual(['chicken-breast', 'broccoli']);
    expect(keto.warnings.join(' ')).toContain('keto');

    const paleo = resolveEligibleIngredients({
      preferredIngredientIds: ['chicken-breast', 'broccoli'],
      dietType: 'paleo',
    });
    expect(paleo.warnings.join(' ')).toContain('paleo');
  });
});

describe('Phase 1 · eligibility · (8) supported allergen restrictions', () => {
  it('excludes dairy ingredients when dairy/milk/lactose is declared', () => {
    for (const token of ['dairy', 'milk', 'lactose', 'Dairy', ' LACTOSE ']) {
      const pool = resolveEligibleIngredients({
        preferredIngredientIds: ['greek-yogurt', 'cottage-cheese', 'tofu'],
        allergies: [token],
      });
      expect(pool.ingredientIds).toEqual(['tofu']);
      expect(pool.effectiveAllergens).toContain('dairy');
    }
  });

  it('excludes nuts, fish, soy, eggs and gluten', () => {
    expect(
      resolveEligibleIngredients({ preferredIngredientIds: ['almonds', 'olive-oil'], allergies: ['peanuts'] })
        .ingredientIds,
    ).toEqual(['olive-oil']);
    expect(
      resolveEligibleIngredients({ preferredIngredientIds: ['salmon', 'tofu'], allergies: ['fish'] }).ingredientIds,
    ).toEqual(['tofu']);
    expect(
      resolveEligibleIngredients({ preferredIngredientIds: ['tofu', 'lentils'], intolerances: ['soy'] }).ingredientIds,
    ).toEqual(['lentils']);
    expect(
      resolveEligibleIngredients({ preferredIngredientIds: ['eggs', 'lentils'], allergies: ['eggs'] }).ingredientIds,
    ).toEqual(['lentils']);
    expect(
      resolveEligibleIngredients({
        preferredIngredientIds: ['whole-wheat-bread', 'oats', 'brown-rice'],
        allergies: ['gluten'],
      }).ingredientIds,
    ).toEqual(['brown-rice']);
  });

  it('merges allergies + intolerances and never fuzzy-matches', () => {
    const pool = resolveEligibleIngredients({
      preferredIngredientIds: ['greek-yogurt', 'salmon', 'almonds'],
      allergies: ['dairy'],
      intolerances: ['tree nuts'],
    });
    expect(pool.ingredientIds).toEqual(['salmon']);
    expect(pool.effectiveAllergens).toEqual(['dairy', 'nuts']);
  });

  it('surfaces unmapped free-text allergies as a warning instead of pretending', () => {
    const pool = resolveEligibleIngredients({
      preferredIngredientIds: ['brown-rice'],
      allergies: ['lactose-free psyllium husk', 'mystery substance'],
    });
    expect(pool.ingredientIds).toEqual(['brown-rice']);
    expect(pool.effectiveAllergens).toEqual([]);
    expect(pool.warnings.join(' ')).toContain('NOT enforced');
  });

  it('normalizeAllergenTokens maps the closed vocabulary only', () => {
    expect(normalizeAllergenTokens(['wheat', 'Eggs', 'peanut', ' '])).toEqual({
      tags: ['gluten', 'eggs', 'nuts'],
      unmapped: [],
    });
    expect(normalizeAllergenTokens(['cocoa']).unmapped).toEqual(['cocoa']);
  });
});
describe('Phase 1 · eligibility · disliked foods (exact match only, documented limitation)', () => {
  it('excludes an ingredient whose exact id or name is disliked', () => {
    expect(
      resolveEligibleIngredients({ preferredIngredientIds: ['mango', 'banana'], dislikedFoods: ['Mango'] })
        .ingredientIds,
    ).toEqual(['banana']);
    expect(
      resolveEligibleIngredients({ preferredIngredientIds: ['mango', 'banana'], dislikedFoods: ['mango'] })
        .ingredientIds,
    ).toEqual(['banana']);
  });

  it('does not fuzzy-match and warns about unmatched entries', () => {
    const pool = resolveEligibleIngredients({
      preferredIngredientIds: ['mango'],
      dislikedFoods: ['liver', 'brussels sprouts'],
    });
    expect(pool.ingredientIds).toEqual(['mango']);
    expect(pool.warnings.join(' ')).toContain('exact id/name match only');
  });

  it('findDislikedMatch is exact and case-insensitive', () => {
    expect(findDislikedMatch(byId('mango'), ['MANGO'])).toBe('MANGO');
    expect(findDislikedMatch(byId('mango'), ['mang'])).toBeNull();
  });
});

describe('Phase 1 · eligibility · (9) determinism', () => {
  const input = {
    clientId: 'client-1',
    preferredIngredientIds: ['chicken-breast', 'brown-rice', 'broccoli', 'greek-yogurt', 'eggs'],
    blockedIngredientIds: ['eggs'],
    allergies: ['dairy'],
    dislikedFoods: ['broccoli'],
    dietType: 'omnivore' as const,
  };

  it('returns identical results for identical input', () => {
    expect(resolveEligibleIngredients(input)).toEqual(resolveEligibleIngredients(input));
  });

  it('returns a fresh object (no shared mutable state)', () => {
    const a = resolveEligibleIngredients(input);
    const b = resolveEligibleIngredients(input);
    expect(a).not.toBe(b);
    expect(a.ingredientIds).not.toBe(b.ingredientIds);
  });
});

describe('Phase 1 · eligibility · (10) generation cannot bypass eligibility', () => {
  const LIKED = [
    'chicken-breast', 'brown-rice', 'broccoli', 'olive-oil', 'eggs',
    'greek-yogurt', 'salmon', 'oats', 'banana', 'almonds',
  ];
  const ALLOWED = ['chicken-breast', 'brown-rice', 'broccoli', 'olive-oil', 'banana'];

  it('generateRecipe never selects an ingredient outside the allow-list', () => {
    for (const mealType of ['breakfast', 'lunch', 'dinner', 'snack'] as const) {
      for (let i = 0; i < 12; i += 1) {
        const recipe = generateRecipe([...LIKED], mealType, `bypass-${mealType}-${i}`, {
          allowedIngredientIds: ALLOWED,
        });
        for (const ingredient of recipe.selectedIngredients) {
          expect(ALLOWED).toContain(ingredient.id);
        }
      }
    }
  });

  it('a full day plan contains only allowed ingredients', () => {
    const plan = generateFullDayMealPlan([...LIKED], TARGETS, 'bypass-day', {
      allowedIngredientIds: ALLOWED,
    });
    const used = ingredientIdsInPlan([
      plan.dailyPlan.breakfast,
      plan.dailyPlan.lunch,
      plan.dailyPlan.dinner,
      plan.dailyPlan.snack,
    ]);
    expect(used.length).toBeGreaterThan(0);
    for (const id of used) expect(ALLOWED).toContain(id);
  });

  it('a whole week contains only allowed ingredients', () => {
    const plan = generateWeeklyMealPlan([...LIKED], TARGETS, 'bypass-week', {
      allowedIngredientIds: ALLOWED,
    });
    const used = ingredientIdsInPlan(
      plan.days.flatMap((day) => [
        day.plan.dailyPlan.breakfast,
        day.plan.dailyPlan.lunch,
        day.plan.dailyPlan.dinner,
        day.plan.dailyPlan.snack,
      ]),
    );
    expect(used.length).toBeGreaterThan(0);
    for (const id of used) expect(ALLOWED).toContain(id);
  });

  it('an ingredient blocked by eligibility cannot appear even when passed as liked', () => {
    const pool = resolveEligibleIngredients({
      preferredIngredientIds: [...LIKED],
      blockedIngredientIds: ['salmon', 'eggs', 'greek-yogurt', 'oats', 'almonds'],
      allergies: ['dairy'],
    });
    const plan = generateFullDayMealPlan([...LIKED], TARGETS, 'bypass-blocked', {
      allowedIngredientIds: pool.ingredientIds,
    });
    const used = ingredientIdsInPlan([
      plan.dailyPlan.breakfast,
      plan.dailyPlan.lunch,
      plan.dailyPlan.dinner,
      plan.dailyPlan.snack,
    ]);
    for (const forbidden of ['salmon', 'eggs', 'greek-yogurt', 'oats', 'almonds']) {
      expect(used).not.toContain(forbidden);
      expect(pool.ingredientIds).not.toContain(forbidden);
    }
  });

  it('is opt-in: omitting the allow-list preserves legacy behaviour exactly', () => {
    const legacy = generateRecipe([...LIKED], 'dinner', 'legacy-seed');
    const withFullPool = generateRecipe([...LIKED], 'dinner', 'legacy-seed', {
      allowedIngredientIds: [...LIKED],
    });
    expect(withFullPool.selectedIngredients.map((i) => i.id)).toEqual(
      legacy.selectedIngredients.map((i) => i.id),
    );
    expect(withFullPool.instructions).toEqual(legacy.instructions);
    expect(withFullPool.macrosPerServing).toEqual(legacy.macrosPerServing);
  });
});
describe('Phase 1 · data-driven classification (A5) is complete and cannot silently regress', () => {
  it('every library ingredient declares allergens and dietTags', () => {
    const missing = coreIngredients
      .filter((ingredient) => !Array.isArray(ingredient.allergens) || !Array.isArray(ingredient.dietTags))
      .map((ingredient) => ingredient.id);
    expect(missing).toEqual([]);
  });

  it('a vegan-tagged ingredient never declares a dairy/eggs/fish allergen', () => {
    for (const ingredient of coreIngredients) {
      if (ingredient.dietTags?.includes('vegan')) {
        expect(ingredient.allergens ?? []).not.toContain('dairy');
        expect(ingredient.allergens ?? []).not.toContain('eggs');
        expect(ingredient.allergens ?? []).not.toContain('fish');
      }
    }
  });

  it('determineAllergens derives from metadata, not hardcoded ids', () => {
    expect(determineAllergens([byId('greek-yogurt')])).toEqual(['dairy']);
    expect(determineAllergens([byId('almonds')])).toEqual(['nuts']);
    expect(determineAllergens([byId('salmon')])).toEqual(['fish']);
    expect(determineAllergens([byId('tofu')])).toEqual(['soy']);
    expect(determineAllergens([byId('eggs')])).toEqual(['eggs']);
    expect(determineAllergens([byId('brown-rice')])).toEqual([]);
    // Aggregated and reported in a stable order.
    expect(determineAllergens([byId('oats'), byId('eggs'), byId('tofu')])).toEqual(['eggs', 'soy', 'gluten']);
  });

  it('determineDietTypes derives from metadata, not hardcoded ids', () => {
    expect(determineDietTypes([byId('tofu'), byId('brown-rice'), byId('broccoli')])).toEqual([
      'vegan',
      'gluten-free',
    ]);
    expect(determineDietTypes([byId('greek-yogurt'), byId('oats')])).toEqual(['vegetarian']);
    expect(determineDietTypes([byId('chicken-breast'), byId('oats')])).toEqual([]);
  });

  it('a brand new animal ingredient can no longer be mislabelled vegan', () => {
    // Simulates the Phase 2 expansion: an unlabelled ingredient is NOT vegan.
    const futureBeef = { ...byId('chicken-breast'), id: 'lean-beef', name: 'Lean Beef' };
    expect(isIngredientCompatibleWithDiet(futureBeef, 'vegan')).toBe(false);
    expect(determineDietTypes([futureBeef])).not.toContain('vegan');
  });
});
