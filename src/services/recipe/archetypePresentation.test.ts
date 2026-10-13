import { describe, it, expect } from 'vitest';
import type { GeneratedRecipe } from './types';
import type { IngredientData } from '@/data/ingredientDatabase';
import type { MealType } from './constants';
import type { RecipeArchetype } from './archetypes';
import type { ArchetypePresentationResult, ArchetypePresentation } from './archetypePresentation';
import { resolveArchetypePresentation } from './archetypePresentation';
import { ARCHETYPES_BY_ID } from './archetypes';

// ─── test fixture helpers ────────────────────────────────────────────────────

/** Minimal, valid `IngredientData` for resolver unit tests. */
function ingredient(id: string, name: string, category: IngredientData['category']): IngredientData {
  return {
    id,
    name,
    category,
    macros: { protein: 0, carbs: 0, fat: 0, calories: 0 },
    allowedMeals: ['breakfast', 'lunch', 'dinner', 'snack'],
    typical_serving_size_g: 10,
    tags: [],
  };
}

/** Build a `GeneratedRecipe` with only the fields the resolver reads. */
function makeRecipe(overrides: Partial<GeneratedRecipe> = {}): GeneratedRecipe {
  return {
    id: 'generated-test-recipe',
    name: 'Test Meal',
    category: 'breakfast',
    prepTime: 5,
    cookTime: 10,
    servings: 1,
    ingredients: [],
    instructions: [],
    macrosPerServing: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
    tags: [],
    dietTypes: [],
    allergens: [],
    equipment: [],
    difficulty: 'easy',
    suitableFor: 'breakfast',
    selectedIngredients: [],
    ...overrides,
  };
}

/** Construct a fully-specified `RecipeArchetype` from a lightweight descriptor. */
function makeArchetype(entry: {
  id: string;
  name: string;
  supportedMeals: readonly MealType[];
  requiredRoles: Record<string, number>;
  optionalRoles: Record<string, number>;
  maxIngredients: number;
  compatibleDiets: readonly string[];
  templateTitle: string;
  templateSteps: readonly string[];
}): RecipeArchetype {
  return {
    id: entry.id,
    name: entry.name,
    supportedMeals: entry.supportedMeals,
    requiredRoles: entry.requiredRoles,
    optionalRoles: entry.optionalRoles,
    maxIngredients: entry.maxIngredients,
    compatibleDiets: entry.compatibleDiets,
    template: { title: entry.templateTitle, steps: entry.templateSteps },
  } as RecipeArchetype;
}

/** Build a small, fully-specified catalogue for isolated unit tests. */
function makeCatalogue(entries: Array<{
  id: string;
  name: string;
  supportedMeals: readonly MealType[];
  requiredRoles: Record<string, number>;
  optionalRoles: Record<string, number>;
  maxIngredients: number;
  compatibleDiets: readonly string[];
  templateTitle: string;
  templateSteps: readonly string[];
}>): ReadonlyMap<string, RecipeArchetype> {
  const catalogue = new Map<string, RecipeArchetype>();
  for (const entry of entries) {
    catalogue.set(entry.id, makeArchetype(entry));
  }
  return catalogue;
}

/** A self-contained catalogue exposing the `{role}` placeholder title pattern. */
const selfContainedCatalogue = makeCatalogue([
  {
    id: 'overnight-oats',
    name: 'Overnight Oats / Porridge',
    supportedMeals: ['breakfast', 'snack'] as const,
    requiredRoles: { carbohydrate: 1, protein: 1, fat: 1 },
    optionalRoles: { fruit: 1, misc: 1 },
    maxIngredients: 5,
    compatibleDiets: ['omnivore'],
    templateTitle: 'Overnight {carbohydrate} with {protein}',
    templateSteps: ['Combine {carbohydrate} with {protein}.'],
  },
  {
    id: 'yogurt-fruit-bowl',
    name: 'Yogurt & Fruit Bowl',
    supportedMeals: ['breakfast', 'snack'] as const,
    requiredRoles: { protein: 1, fruit: 1 },
    optionalRoles: { fat: 1, carbohydrate: 1, misc: 1 },
    maxIngredients: 5,
    compatibleDiets: ['omnivore'],
    templateTitle: '{protein} & {fruit} Bowl',
    templateSteps: ['Spoon {protein} in.'],
  },
]);

/** A recipe carrying a valid archetype id plus matching selected ingredients. */
const validRecipe = (): GeneratedRecipe =>
  makeRecipe({
    archetypeId: 'overnight-oats',
    selectedIngredients: [
      ingredient('oats', 'Rolled Oats', 'carbohydrate'),
      ingredient('yogurt', 'Greek Yogurt', 'protein'),
    ],
  });

// ─── tests ───────────────────────────────────────────────────────────────────


/**
 * Runtime assertion helpers that double as TypeScript type guards.
 *
 * Vitest's `expect(...).toBe(...)` does not narrow types, so these `asserts`
 * guards let the tests narrow an `ArchetypePresentationResult` to a single
 * member (resolved / legacy / unknown) before reaching into its fields.
 */
function assertResolved(
  result: ArchetypePresentationResult,
): asserts result is ArchetypePresentationResult & { kind: 'resolved'; presentation: ArchetypePresentation } {
  if (result.kind !== 'resolved') {
    throw new Error(`Expected a resolved presentation, got ${result.kind}`);
  }
}

function assertUnknown(
  result: ArchetypePresentationResult,
): asserts result is { kind: 'unknown'; archetypeId: string } {
  if (result.kind !== 'unknown') {
    throw new Error(`Expected an unknown presentation, got ${result.kind}`);
  }
}

function assertLegacy(
  result: ArchetypePresentationResult,
): asserts result is { kind: 'legacy' } {
  if (result.kind !== 'legacy') {
    throw new Error(`Expected a legacy presentation, got ${result.kind}`);
  }
}

describe('archetype presentation resolver', () => {
  describe('valid archetype id', () => {
    it('resolves to the correct catalogue presentation', () => {
      const result = resolveArchetypePresentation(validRecipe(), selfContainedCatalogue);

      assertResolved(result);
      const presentation = result.presentation;

      expect(presentation.archetypeId).toBe('overnight-oats');
      expect(presentation.name).toBe('Overnight Oats / Porridge');
      expect(presentation.title).toBe('Overnight Rolled Oats with Greek Yogurt');
    });

    it('substitutes multiple placeholders from the selected ingredients', () => {
      const result = resolveArchetypePresentation(
        makeRecipe({
          archetypeId: 'yogurt-fruit-bowl',
          selectedIngredients: [
            ingredient('yogurt', 'Greek Yogurt', 'protein'),
            ingredient('banana', 'Banana', 'fruit'),
          ],
        }),
        selfContainedCatalogue,
      );

      assertResolved(result);
      expect(result.presentation.title).toBe('Greek Yogurt & Banana Bowl');
    });

    it('falls back to the catalogue name when the template cannot be resolved', () => {
      const result = resolveArchetypePresentation(
        makeRecipe({
          archetypeId: 'overnight-oats',
          selectedIngredients: [],
        }),
        selfContainedCatalogue,
      );

      assertResolved(result);
      expect(result.presentation.title).toBe('Overnight Oats / Porridge');
      expect(result.presentation.title).not.toMatch(/\{/);
    });
  });

  describe('legacy fallback', () => {
    it('returns no presentation when archetypeId is absent', () => {
      const result = resolveArchetypePresentation(makeRecipe(), selfContainedCatalogue);

      expect(result.kind).toBe('legacy');
      expect('presentation' in result).toBe(false);
    });

    it('returns no presentation when archetypeId is undefined', () => {
      const result = resolveArchetypePresentation(
        makeRecipe({ archetypeId: undefined }),
        selfContainedCatalogue,
      );

      expect(result.kind).toBe('legacy');
    });

    it('never fabricates an archetype from the ingredients', () => {
      const result = resolveArchetypePresentation(
        makeRecipe({
          selectedIngredients: [ingredient('chicken', 'Chicken Breast', 'protein')],
        }),
        selfContainedCatalogue,
      );

      assertLegacy(result);
      expect(result).toEqual({ kind: 'legacy' });
    });
  });

  describe('unknown archetype id', () => {
    it('does not throw', () => {
      expect(() =>
        resolveArchetypePresentation(
          makeRecipe({ archetypeId: 'no-such-archetype' }),
          selfContainedCatalogue,
        ),
      ).not.toThrow();
    });

    it('returns only the id for diagnostics, without a fabricated title', () => {
      const result = resolveArchetypePresentation(
        makeRecipe({ archetypeId: 'no-such-archetype' }),
        selfContainedCatalogue,
      );

      assertUnknown(result);
      expect(result).toEqual({ kind: 'unknown', archetypeId: 'no-such-archetype' });
    });

    it('does not invent a name or title for an unknown id', () => {
      const result = resolveArchetypePresentation(
        makeRecipe({ archetypeId: 'no-such-archetype' }),
        selfContainedCatalogue,
      );

      assertUnknown(result);
      expect(result).toEqual({ kind: 'unknown', archetypeId: 'no-such-archetype' });
    });
  });

  describe('determinism', () => {
    it('returns the same result for the same inputs', () => {
      const recipe = validRecipe();
      const resultA = resolveArchetypePresentation(recipe, selfContainedCatalogue);
      const resultB = resolveArchetypePresentation(recipe, selfContainedCatalogue);

      expect(resultB).toEqual(resultA);
    });

    it('is byte-stable across repeated calls on the real catalogue', () => {
      const recipe = makeRecipe({
        archetypeId: 'grain-bowl',
        selectedIngredients: [
          ingredient('oats', 'Rolled Oats', 'carbohydrate'),
          ingredient('chicken-breast', 'Chicken Breast', 'protein'),
          ingredient('broccoli', 'Broccoli', 'vegetable'),
          ingredient('olive-oil', 'Olive Oil', 'fat'),
        ],
      });

      const first = resolveArchetypePresentation(recipe, ARCHETYPES_BY_ID);
      const second = resolveArchetypePresentation(recipe, ARCHETYPES_BY_ID);

      expect(second).toEqual(first);
    });

    it('produces identical output for two consecutive resolutions', () => {
      const recipe = validRecipe();
      const results = Array.from({ length: 10 }, () =>
        resolveArchetypePresentation(recipe, selfContainedCatalogue),
      );

      const first = results[0];
      for (const result of results) {
        expect(result).toEqual(first);
      }
    });
  });

  describe('catalogue integrity', () => {
    it('does not mutate the catalogue', () => {
      const before = new Map(ARCHETYPES_BY_ID);

      for (const archetypeId of ['overnight-oats', 'grain-bowl', 'stir-fry', 'energy-bites-trail-mix']) {
        resolveArchetypePresentation(makeRecipe({ archetypeId }), ARCHETYPES_BY_ID);
      }

      expect(ARCHETYPES_BY_ID.size).toBe(before.size);
      for (const [id, archetype] of ARCHETYPES_BY_ID) {
        const beforeArchetype = before.get(id)!;
        expect(archetype.id).toBe(beforeArchetype.id);
        expect(archetype.name).toBe(beforeArchetype.name);
        expect(archetype.supportedMeals).toEqual(beforeArchetype.supportedMeals);
        expect(archetype.requiredRoles).toEqual(beforeArchetype.requiredRoles);
        expect(archetype.optionalRoles).toEqual(beforeArchetype.optionalRoles);
        expect(archetype.maxIngredients).toBe(beforeArchetype.maxIngredients);
        expect(archetype.compatibleDiets).toEqual(beforeArchetype.compatibleDiets);
        expect(archetype.template.title).toBe(beforeArchetype.template.title);
        expect(archetype.template.steps).toEqual(beforeArchetype.template.steps);
      }
    });

    it('does not mutate the recipe being resolved', () => {
      const recipe = validRecipe();
      const beforeSelected = recipe.selectedIngredients.map((i) => i.id);

      resolveArchetypePresentation(recipe, selfContainedCatalogue);

      expect(recipe.selectedIngredients.map((i) => i.id)).toEqual(beforeSelected);
      expect(recipe.archetypeId).toBe('overnight-oats');
    });
  });
});

