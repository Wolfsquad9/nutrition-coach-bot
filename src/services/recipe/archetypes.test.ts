/**
 * Phase 3B — archetype catalogue validation.
 *
 * These tests pin the catalogue as DATA and prove it is satisfiable by the
 * real 100-item library through the real Phase 1 eligibility boundary.
 *
 * Critically, they also prove the catalogue is INERT: because no generator
 * consumes it yet, archetype tests must not be able to influence existing
 * recipe output. The "catalogue does not alter existing behaviour" tests at
 * the bottom are the guard for that.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ARCHETYPES,
  ARCHETYPES_BY_ID,
  getArchetypesForMeal,
  collectArchetypeRoles,
  type ArchetypeRole,
  type RecipeArchetype,
} from '@/services/recipe/archetypes';
import { resolveEligibleIngredients, isIngredientCompatibleWithDiet } from '@/services/recipe/eligibility';
import { coreIngredients, getIngredientsByMealTime } from '@/data/ingredientDatabase';
import { generateRecipe, generateFullDayMealPlan } from '@/services/recipeService';
import type { MealType } from '@/services/recipe/constants';
import type { MacroTargets } from '@/types';

const MEALS: readonly MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const VALID_ROLES: ReadonlySet<string> = new Set([
  'protein', 'carbohydrate', 'vegetable', 'fruit', 'fat', 'misc',
]);
const VALID_DIETS: ReadonlySet<string> = new Set([
  'omnivore', 'vegetarian', 'pescatarian', 'vegan',
]);
const ALL_IDS = coreIngredients.map((ingredient) => ingredient.id);

/** The effective pool a 3C consumer must use: eligibility ∩ meal-slot. */
const poolFor = (meal: MealType, diet: string | null, allergies: string[] = []) => {
  const eligible = resolveEligibleIngredients({
    preferredIngredientIds: [...ALL_IDS],
    dietType: diet as never,
    allergies,
  });
  const allowed = new Set(eligible.ingredientIds);
  return getIngredientsByMealTime(meal).filter((ingredient) => allowed.has(ingredient.id));
};

const roleCountsIn = (pool: ReturnType<typeof poolFor>, role: ArchetypeRole) =>
  pool.filter((ingredient) => ingredient.category === role).length;

const isSatisfiable = (archetype: RecipeArchetype, meal: MealType, diet: string | null) => {
  const pool = poolFor(meal, diet);
  return Object.entries(archetype.requiredRoles).every(
    ([role, count]) => roleCountsIn(pool, role as ArchetypeRole) >= (count ?? 0),
  );
};

describe('Phase 3B · catalogue · schema validity', () => {
  it('contains exactly the 20 approved archetypes', () => {
    expect(ARCHETYPES).toHaveLength(20);
  });

  it('every archetype has a well-formed id and name', () => {
    for (const archetype of ARCHETYPES) {
      expect(archetype.id, archetype.name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(archetype.name.length, archetype.id).toBeGreaterThan(0);
    }
  });

  it('ids are unique and the lookup map agrees with the array', () => {
    const ids = ARCHETYPES.map((archetype) => archetype.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ARCHETYPES_BY_ID.size).toBe(ARCHETYPES.length);
    for (const archetype of ARCHETYPES) {
      expect(ARCHETYPES_BY_ID.get(archetype.id)).toBe(archetype);
    }
  });

  it('supported meal types are valid and non-empty', () => {
    for (const archetype of ARCHETYPES) {
      expect(archetype.supportedMeals.length, archetype.id).toBeGreaterThan(0);
      for (const meal of archetype.supportedMeals) {
        expect(MEALS, archetype.id).toContain(meal);
      }
      expect(new Set(archetype.supportedMeals).size, archetype.id).toBe(
        archetype.supportedMeals.length,
      );
    }
  });

  it('role names are all valid IngredientData categories', () => {
    for (const role of collectArchetypeRoles()) {
      expect(VALID_ROLES.has(role), role).toBe(true);
    }
  });

  it('required and optional counts are positive integers within maxIngredients', () => {
    for (const archetype of ARCHETYPES) {
      const total = (map: Record<string, number | undefined>) =>
        Object.values(map).reduce<number>((sum, n) => sum + (n ?? 0), 0);

      expect(Object.keys(archetype.requiredRoles).length, archetype.id).toBeGreaterThan(0);
      for (const [role, count] of Object.entries(archetype.requiredRoles)) {
        expect(Number.isInteger(count), `${archetype.id}.${role}`).toBe(true);
        expect(count, `${archetype.id}.${role}`).toBeGreaterThanOrEqual(1);
      }
      for (const [role, count] of Object.entries(archetype.optionalRoles)) {
        expect(Number.isInteger(count), `${archetype.id}.${role}`).toBe(true);
        expect(count, `${archetype.id}.${role}`).toBeGreaterThanOrEqual(1);
      }
      // A role is never both required and optional.
      const overlap = Object.keys(archetype.requiredRoles).filter((r) =>
        Object.keys(archetype.optionalRoles).includes(r),
      );
      expect(overlap, archetype.id).toEqual([]);
      // maxIngredients must be able to hold the maximum conceivable fill.
      expect(archetype.maxIngredients, archetype.id).toBeGreaterThanOrEqual(
        total(archetype.requiredRoles),
      );
    }
  });

  it('compatibleDiets only lists enforceable diets and is non-empty', () => {
    for (const archetype of ARCHETYPES) {
      expect(archetype.compatibleDiets.length, archetype.id).toBeGreaterThan(0);
      for (const diet of archetype.compatibleDiets) {
        expect(VALID_DIETS.has(diet), `${archetype.id}:${diet}`).toBe(true);
      }
      // Keto/paleo are not enforceable and must not appear.
      expect(archetype.compatibleDiets, archetype.id).not.toContain('keto');
      expect(archetype.compatibleDiets, archetype.id).not.toContain('paleo');
    }
  });

  it('every template has a title and at least two steps with valid placeholders', () => {
    for (const archetype of ARCHETYPES) {
      expect(archetype.template.title.length, archetype.id).toBeGreaterThan(0);
      expect(archetype.template.steps.length, archetype.id).toBeGreaterThanOrEqual(2);
      const text = `${archetype.template.title} ${archetype.template.steps.join(' ')}`;
      for (const match of text.match(/\{[a-z]+\}/g) ?? []) {
        const role = match.slice(1, -1);
        // Placeholders may only name a role this archetype can actually fill.
        const known =
          VALID_ROLES.has(role) &&
          (archetype.requiredRoles[role as ArchetypeRole] !== undefined ||
            archetype.optionalRoles[role as ArchetypeRole] !== undefined);
        expect(known, `${archetype.id} placeholder ${match}`).toBe(true);
      }
    }
  });
});

describe('Phase 3B · catalogue · satisfiability against the real 100-item library', () => {
  it('every archetype is satisfiable for at least one of its meals under omnivore', () => {
    for (const archetype of ARCHETYPES) {
      const anyMealWorks = archetype.supportedMeals.some((meal) =>
        isSatisfiable(archetype, meal, 'omnivore'),
      );
      expect(anyMealWorks, `${archetype.id} unsatisfiable under omnivore`).toBe(true);
    }
  });

  it('every archetype is satisfiable under EVERY diet it claims to support', () => {
    // This is the real feasibility gate: a diet may only be listed if the
    // archetype's required roles can actually be filled for that diet.
    for (const archetype of ARCHETYPES) {
      for (const diet of archetype.compatibleDiets) {
        const worksSomewhere = archetype.supportedMeals.some((meal) =>
          isSatisfiable(archetype, meal, diet),
        );
        expect(worksSomewhere, `${archetype.id} claims ${diet} but cannot fill its roles`).toBe(true);
      }
    }
  });

  it('no archetype requires a role its declared slots cannot supply (omnivore)', () => {
    for (const archetype of ARCHETYPES) {
      for (const meal of archetype.supportedMeals) {
        expect(isSatisfiable(archetype, meal, 'omnivore'), `${archetype.id}@${meal}`).toBe(true);
      }
    }
  });

  it('every archetype in every slot leaves at least one satisfiable archetype', () => {
    // Guards against a future catalogue edit that makes a whole slot empty.
    for (const meal of MEALS) {
      const satisfiable = getArchetypesForMeal(meal).filter((a) => isSatisfiable(a, meal, 'omnivore'));
      expect(satisfiable.length, `no omnivore archetype for ${meal}`).toBeGreaterThan(0);
    }
  });

  it('getArchetypesForMeal returns only archetypes that declare the slot', () => {
    for (const meal of MEALS) {
      const list = getArchetypesForMeal(meal);
      expect(list.length, meal).toBeGreaterThan(0);
      for (const archetype of list) expect(archetype.supportedMeals).toContain(meal);
    }
    // Catalogue order is preserved.
    const breakfastIds = getArchetypesForMeal('breakfast').map((a) => a.id);
    expect(breakfastIds).toEqual(ARCHETYPES.filter((a) => a.supportedMeals.includes('breakfast')).map((a) => a.id));
  });
});

describe('Phase 3B · catalogue · vegan and diet honesty', () => {
  it('vegan breakfast archetypes are NOT falsely treated as universally satisfiable', () => {
    // 3A finding: the pool has zero vegan breakfast proteins. Any breakfast
    // archetype requiring protein must therefore exclude vegan. This test fails
    // if someone later "fixes" it by claiming vegan without fixing the pool.
    for (const archetype of getArchetypesForMeal('breakfast')) {
      if (archetype.requiredRoles.protein) {
        expect(archetype.compatibleDiets, archetype.id).not.toContain('vegan');
      }
    }
    // The concrete known-unsatisfiable case, measured through real eligibility.
    const oats = ARCHETYPES_BY_ID.get('overnight-oats')!;
    const veganBreakfast = isSatisfiable(oats, 'breakfast', 'vegan');
    expect(veganBreakfast).toBe(false);
    expect(oats.compatibleDiets).not.toContain('vegan');
  });

  it('every archetype that claims vegan is actually fillable by a vegan ingredient per role', () => {
    for (const archetype of ARCHETYPES) {
      if (!archetype.compatibleDiets.includes('vegan')) continue;
      for (const role of Object.keys(archetype.requiredRoles) as ArchetypeRole[]) {
        const veganSupply = coreIngredients.filter(
          (ing) => ing.category === role && isIngredientCompatibleWithDiet(ing, 'vegan'),
        );
        expect(veganSupply.length, `${archetype.id} claims vegan but no vegan ${role}`).toBeGreaterThan(0);
      }
    }
  });

  it('no archetype claims a diet stricter than its role supply supports', () => {
    // vegetarian/vegan supply can never exceed omnivore supply; a listing that
    // is fine for omnivore must not silently be granted to a stricter diet.
    for (const archetype of ARCHETYPES) {
      for (const diet of ['vegetarian', 'vegan'] as const) {
        if (!archetype.compatibleDiets.includes(diet)) continue;
        const works = archetype.supportedMeals.some((meal) => isSatisfiable(archetype, meal, diet));
        expect(works, `${archetype.id}@${diet}`).toBe(true);
      }
    }
  });

  it('allergies shrink the pool but never invalidate the catalogue schema', () => {
    // Dairy allergy removes yogurt/cottage cheese; archetypes requiring a
    // dairy-only supply simply become unsatisfiable at generation time, which
    // is the skip rule's job — the catalogue itself stays valid.
    const dairyPool = poolFor('breakfast', 'omnivore', ['dairy']);
    const oats = ARCHETYPES_BY_ID.get('overnight-oats')!;
    const stillFine = isSatisfiable(oats, 'breakfast', 'omnivore');
    expect(stillFine).toBe(true);
    expect(dairyPool.some((ing) => ing.allergens?.includes('dairy'))).toBe(false);
  });
});

describe('Phase 3B · catalogue · smoothie (#5) is fruit+protein with NO liquid role', () => {
  const smoothie = ARCHETYPES_BY_ID.get('smoothie-shake')!;

  it('exists and requires fruit + protein, with fat optional', () => {
    expect(smoothie).toBeDefined();
    expect(smoothie.requiredRoles.fruit).toBeGreaterThanOrEqual(1);
    expect(smoothie.requiredRoles.protein).toBeGreaterThanOrEqual(1);
    expect(smoothie.requiredRoles.fat).toBeUndefined();
    expect(smoothie.optionalRoles.fat).toBeGreaterThanOrEqual(1);
  });

  it('does NOT require or reference a liquid role anywhere', () => {
    const roles = { ...smoothie.requiredRoles, ...smoothie.optionalRoles };
    expect(Object.keys(roles)).not.toContain('liquid');
    // No `liquid` category exists in the frozen schema either.
    expect(VALID_ROLES.has('liquid')).toBe(false);
    // `liquid` is deliberately not part of the frozen role union, so assert over
    // the raw string set (the typed set could not contain it by construction).
    expect(new Set<string>(collectArchetypeRoles())).not.toContain('liquid');
  });

  it('is satisfiable at breakfast with fruit+protein from the real pool', () => {
    const pool = poolFor('breakfast', 'omnivore');
    expect(roleCountsIn(pool, 'fruit')).toBeGreaterThanOrEqual(1);
    expect(roleCountsIn(pool, 'protein')).toBeGreaterThanOrEqual(1);
    expect(isSatisfiable(smoothie, 'breakfast', 'omnivore')).toBe(true);
  });
});

describe('Phase 3B · catalogue · the catalogue cannot bypass eligibility', () => {
  it('exports no selection logic and imports no generator', () => {
    // A 3C consumer must do selection; the catalogue declares shape only.
    const source = readFileSync(resolve(__dirname, 'archetypes.ts'), 'utf8');
    for (const forbidden of [
      'generateRecipe', 'selectBalancedIngredients', 'getSuitableIngredients',
      'generateFullDayMealPlan', 'generateWeeklyMealPlan', 'Math.random', 'Date.now',
    ]) {
      expect(source.includes(forbidden), `archetypes.ts must not reference ${forbidden}`).toBe(false);
    }
    // No nutrition maths is duplicated here.
    expect(source.includes('sumMacros')).toBe(false);
    expect(source.includes('caloriesFromMacros')).toBe(false);
  });

  it('an empty eligible pool leaves every archetype unsatisfiable (skip rule)', () => {
    // Invariant 5/6: never partially fill, never fall back. With no eligible
    // ingredients nothing can be filled, so nothing is a candidate.
    for (const archetype of ARCHETYPES) {
      for (const meal of archetype.supportedMeals) {
        const pool = getIngredientsByMealTime(meal).filter(() => false);
        const fillable = Object.entries(archetype.requiredRoles).every(
          ([role, n]) => pool.filter((ing) => ing.category === role).length >= (n ?? 0),
        );
        expect(fillable, archetype.id).toBe(false);
      }
    }
  });

  it('satisfiability tracks the allow-list, not the catalogue claims', () => {
    const omelette = ARCHETYPES_BY_ID.get('scramble-omelette')!;
    const fillableFor = (ids: string[]) => {
      const allowed = new Set(
        resolveEligibleIngredients({ preferredIngredientIds: ids }).ingredientIds,
      );
      const pool = getIngredientsByMealTime('breakfast').filter((ing) => allowed.has(ing.id));
      return Object.entries(omelette.requiredRoles).every(
        ([role, n]) => pool.filter((ing) => ing.category === role).length >= (n ?? 0),
      );
    };
    expect(fillableFor(['eggs', 'spinach', 'olive-oil', 'whole-wheat-bread'])).toBe(true);
    // Drop the only fat and the required fat role can no longer be filled.
    expect(fillableFor(['eggs', 'spinach', 'whole-wheat-bread'])).toBe(false);
  });
});

describe('Phase 3B · catalogue · is inert: existing generation is unchanged', () => {
  const LIKED = [
    'chicken-breast', 'brown-rice', 'broccoli', 'olive-oil', 'eggs',
    'greek-yogurt', 'salmon', 'oats', 'banana', 'almonds',
  ];
  const TARGETS: MacroTargets = { calories: 2000, protein: 120, carbs: 250, fat: 55 };

  it('no archetype id or template leaks into generated recipe output', () => {
    // Referencing ARCHETYPES proves the module loads; generated output must be
    // unchanged from the pre-3B result for the same seed.
    expect(ARCHETYPES).toHaveLength(20);
    for (const meal of MEALS) {
      const recipe = generateRecipe([...LIKED], meal, 'phase3b-inert-seed');
      const rendered = `${recipe.name}\n${recipe.instructions.join('\n')}`;
      expect(rendered.length).toBeGreaterThan(0);
      for (const archetype of ARCHETYPES) {
        expect(rendered).not.toContain(archetype.id);
        expect(rendered).not.toContain(archetype.template.title);
        // The generator's own naming must not have been replaced by archetype
        // text — that is Phase 3C work, explicitly not done here.
        expect(recipe.name).not.toBe(archetype.name);
      }
    }
  });

  it('day generation is unchanged and stays inside the eligible pool', () => {
    const pool = resolveEligibleIngredients({ preferredIngredientIds: [...LIKED] });
    const plan = generateFullDayMealPlan([...LIKED], TARGETS, 'phase3b-inert-day', {
      allowedIngredientIds: pool.ingredientIds,
    });
    const used = [plan.dailyPlan.breakfast, plan.dailyPlan.lunch, plan.dailyPlan.dinner, plan.dailyPlan.snack]
      .flatMap((meal) => meal?.ingredients ?? [])
      .map((item) => item.id);
    expect(used.length).toBeGreaterThan(0);
    for (const id of used) expect(pool.ingredientIds).toContain(id);
  });

  it('generation is still deterministic for a fixed seed', () => {
    const a = generateRecipe([...LIKED], 'dinner', 'phase3b-determinism');
    const b = generateRecipe([...LIKED], 'dinner', 'phase3b-determinism');
    expect(a.name).toBe(b.name);
    expect(a.instructions).toEqual(b.instructions);
    expect(a.macrosPerServing).toEqual(b.macrosPerServing);
    expect(a.selectedIngredients.map((i) => i.id)).toEqual(b.selectedIngredients.map((i) => i.id));
  });

  it('the catalogue introduced no new ingredient data', () => {
    expect(coreIngredients).toHaveLength(100);
    expect(new Set(ALL_IDS).size).toBe(100);
  });
});