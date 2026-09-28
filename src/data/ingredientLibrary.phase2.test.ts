/**
 * Phase 2 — ingredient library expansion (`docs/recipe-phase2-plan.md` §4).
 *
 * Guards the properties that Phase 1's data-driven classification depends on:
 * if these fail, a newly added ingredient can be silently mislabelled or
 * silently unusable. The energy question is deliberately NOT asserted here —
 * see OPEN DECISION O-1 in `ingredientDatabase.ts`.
 */

import { describe, it, expect } from 'vitest';
import {
  coreIngredients,
  getIngredientsByCategory,
  getIngredientsByMealTime,
  type AllergenTag,
  type DietTag,
  type MealTimeType,
} from '@/data/ingredientDatabase';
import { determineDietTypes, determineAllergens } from '@/services/recipe/nutritionCalculations';
import { isIngredientCompatibleWithDiet, resolveEligibleIngredients } from '@/services/recipe/eligibility';
import { caloriesFromMacros } from '@/domain/nutrition/engine';

const SLOTS: MealTimeType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const byId = (id: string) => coreIngredients.find((ingredient) => ingredient.id === id)!;

const PHASE2_IDS = [
  'tahini', 'sesame-seeds', 'pumpkin-seeds', 'kalamata-olives', 'feta-cheese',
  'parmesan-cheese', 'cashews', 'buckwheat', 'rice-cakes', 'granola',
  'english-muffin', 'corn-tortilla', 'couscous', 'bulgur-wheat', 'rice-noodles',
  'pomegranate-arils', 'pineapple', 'pear', 'melon', 'dates', 'kiwi', 'lean-beef',
  'pork-tenderloin', 'cod', 'mackerel', 'shrimp', 'tempeh', 'edamame', 'chickpeas',
  'whey-protein-powder', 'skyr', 'yellow-onion', 'mushrooms', 'eggplant',
  'green-beans', 'red-cabbage', 'peas', 'mixed-leaf-salad', 'sweetcorn',
  'brussels-sprouts', 'beetroot', 'cumin', 'smoked-paprika', 'chilli-flakes',
  'fresh-coriander', 'fresh-basil', 'dried-oregano', 'soy-sauce',
  'balsamic-vinegar', 'dijon-mustard', 'curry-powder', 'vegetable-stock',
  'tomato-paste',
];

describe('Phase 2 · library size and identity', () => {
  it('grew from 47 to 100 ingredients', () => {
    expect(coreIngredients).toHaveLength(100);
    expect(PHASE2_IDS).toHaveLength(53);
  });

  it('every planned Phase 2 ingredient is present', () => {
    for (const id of PHASE2_IDS) {
      expect(byId(id), `missing planned ingredient: ${id}`).toBeDefined();
    }
  });

  it('all ingredient ids are unique', () => {
    const ids = coreIngredients.map((ingredient) => ingredient.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all ingredient names are unique', () => {
    const names = coreIngredients.map((ingredient) => ingredient.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('Phase 2 · metadata completeness (the Phase 1 guard, now over 100 rows)', () => {
  it('every ingredient declares allergens and dietTags', () => {
    const missing = coreIngredients
      .filter((ingredient) => !Array.isArray(ingredient.allergens) || !Array.isArray(ingredient.dietTags))
      .map((ingredient) => ingredient.id);
    expect(missing).toEqual([]);
  });

  it('every ingredient declares at least one meal slot and a positive serving', () => {
    for (const ingredient of coreIngredients) {
      expect(ingredient.allowedMeals.length, ingredient.id).toBeGreaterThan(0);
      expect(ingredient.typical_serving_size_g, ingredient.id).toBeGreaterThan(0);
      for (const slot of ingredient.allowedMeals) {
        expect(SLOTS, `${ingredient.id} -> ${slot}`).toContain(slot);
      }
    }
  });

  it('every ingredient has non-negative macros and at least one declared tag', () => {
    for (const ingredient of coreIngredients) {
      const { protein, carbs, fat, fiber } = ingredient.macros;
      for (const [name, value] of Object.entries({ protein, carbs, fat, fiber: fiber ?? 0 })) {
        expect(value, `${ingredient.id}.${name}`).toBeGreaterThanOrEqual(0);
      }
      expect(ingredient.tags.length, ingredient.id).toBeGreaterThan(0);
    }
  });

  it('every allergen value is in the closed vocabulary', () => {
    const valid: AllergenTag[] = ['gluten', 'dairy', 'eggs', 'fish', 'nuts', 'soy', 'sesame', 'shellfish'];
    for (const ingredient of coreIngredients) {
      for (const allergen of ingredient.allergens ?? []) {
        expect(valid, `${ingredient.id} -> ${allergen}`).toContain(allergen);
      }
    }
  });

  it('every diet tag is in the closed vocabulary', () => {
    const valid: DietTag[] = ['vegan', 'vegetarian', 'pescatarian', 'omnivore'];
    for (const ingredient of coreIngredients) {
      expect(ingredient.dietTags?.length, ingredient.id).toBeGreaterThan(0);
      for (const tag of ingredient.dietTags ?? []) {
        expect(valid, `${ingredient.id} -> ${tag}`).toContain(tag);
      }
    }
  });

  it('a vegan-tagged ingredient never declares a dairy, eggs or fish allergen', () => {
    for (const ingredient of coreIngredients) {
      if (!ingredient.dietTags?.includes('vegan')) continue;
      for (const forbidden of ['dairy', 'eggs', 'fish'] as AllergenTag[]) {
        expect(ingredient.allergens ?? [], `${ingredient.id} -> ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it('an omnivore-tagged ingredient is never vegan-compatible', () => {
    for (const ingredient of coreIngredients) {
      if (ingredient.dietTags?.includes('omnivore')) {
        expect(ingredient.dietTags, ingredient.id).not.toContain('vegan');
        expect(ingredient.dietTags, ingredient.id).not.toContain('vegetarian');
      }
    }
  });

  it('an animal protein is not labelled vegan', () => {
    for (const id of ['lean-beef', 'pork-tenderloin', 'cod', 'mackerel', 'shrimp', 'eggs', 'greek-yogurt', 'cottage-cheese', 'salmon', 'tuna', 'feta-cheese', 'parmesan-cheese', 'whey-protein-powder', 'skyr']) {
      expect(byId(id).dietTags, id).not.toContain('vegan');
    }
  });
});
describe('Phase 2 · allergen classification is data-driven across the new rows', () => {
  it('classifies the new animal proteins and their allergens', () => {
    expect(determineAllergens([byId('cod'), byId('mackerel')])).toEqual(['fish']);
    expect(determineAllergens([byId('shrimp')])).toEqual(['shellfish']);
    expect(determineAllergens([byId('lean-beef'), byId('pork-tenderloin')])).toEqual([]);
    expect(determineAllergens([byId('tempeh'), byId('edamame')])).toEqual(['soy']);
    expect(determineAllergens([byId('tahini'), byId('sesame-seeds')])).toEqual(['sesame']);
    expect(determineAllergens([byId('feta-cheese'), byId('skyr')])).toEqual(['dairy']);
    expect(determineAllergens([byId('cashews')])).toEqual(['nuts']);
    // `determineAllergens` reports in ALLERGEN_REPORT_ORDER, not data order.
    expect(determineAllergens([byId('soy-sauce')])).toEqual(['soy', 'gluten']);
    expect(determineAllergens([byId('shrimp'), byId('soy-sauce')])).toEqual(['soy', 'gluten', 'shellfish']);
  });

  it('never classifies gluten-free grains as gluten-containing', () => {
    for (const id of ['buckwheat', 'rice-cakes', 'corn-tortilla', 'rice-noodles', 'couscous']) {
      expect(byId(id).allergens ?? [], id).not.toContain('gluten');
    }
    for (const id of ['granola', 'english-muffin', 'bulgur-wheat', 'soy-sauce']) {
      expect(byId(id).allergens ?? [], id).toContain('gluten');
    }
  });

  it('keeps oats classified as gluten-containing (Phase 1 decision, unchanged here)', () => {
    expect(byId('oats').allergens).toEqual(['gluten']);
    expect(determineAllergens([byId('oats')])).toEqual(['gluten']);
  });

  it('determineDietTypes reads the new metadata', () => {
    expect(determineDietTypes([byId('chickpeas'), byId('couscous'), byId('peas')])).toEqual(['vegan', 'gluten-free']);
    // Cod is pescatarian-only, so the meal is neither vegan nor vegetarian.
    expect(determineDietTypes([byId('cod'), byId('couscous')])).toEqual(['gluten-free']);
    expect(determineDietTypes([byId('lean-beef'), byId('yellow-onion')])).toEqual(['gluten-free']);
    // Feta is vegetarian and genuinely gluten-free (no gluten-bearing tag).
    expect(determineDietTypes([byId('feta-cheese')])).toEqual(['vegetarian', 'gluten-free']);
    // Gluten-bearing new grains can never be presented as gluten-free.
    expect(determineDietTypes([byId('bulgur-wheat')])).toEqual(['vegan']);
  });
});

describe('Phase 2 · diet eligibility over the expanded library', () => {
  const ALL_IDS = coreIngredients.map((i) => i.id);
  const veganPool = (ids: string[]) =>
    new Set(resolveEligibleIngredients({ preferredIngredientIds: ids, dietType: 'vegan' }).ingredientIds);

  it('a vegan client is offered no animal product', () => {
    const allowed = veganPool(ALL_IDS);
    for (const id of ['lean-beef', 'pork-tenderloin', 'cod', 'mackerel', 'shrimp', 'salmon', 'tuna', 'eggs', 'greek-yogurt', 'cottage-cheese', 'feta-cheese', 'parmesan-cheese', 'skyr', 'whey-protein-powder']) {
      expect(allowed.has(id), `${id} must not be vegan-eligible`).toBe(false);
    }
    expect(allowed.has('tofu')).toBe(true);
    expect(allowed.has('tempeh')).toBe(true);
    expect(allowed.has('chickpeas')).toBe(true);
  });

  it('a vegan client is still offered the new plant fats, grains and vegetables', () => {
    const allowed = veganPool(ALL_IDS);
    for (const id of ['tahini', 'sesame-seeds', 'pumpkin-seeds', 'cashews', 'buckwheat', 'corn-tortilla', 'couscous', 'yellow-onion', 'mushrooms']) {
      expect(allowed.has(id), `${id} should be vegan-eligible`).toBe(true);
    }
  });

  it('pescatarian gains fish but not meat', () => {
    const allowed = new Set(
      resolveEligibleIngredients({ preferredIngredientIds: ALL_IDS, dietType: 'pescatarian' }).ingredientIds,
    );
    expect(allowed.has('cod')).toBe(true);
    expect(allowed.has('shrimp')).toBe(true);
    expect(allowed.has('lean-beef')).toBe(false);
    expect(allowed.has('pork-tenderloin')).toBe(false);
  });

  it('declares a diet tag consistent with its eligibility (nesting-aware)', () => {
    // dietTags declare the MOST RESTRICTIVE level satisfied, so a 'vegetarian'
    // ingredient is vegetarian- and pescatarian-eligible without carrying
    // either additional tag. The invariant is: eligibility must be derivable
    // from the declared tags, and a diet-compatible ingredient must carry at
    // least one tag from that diet's allowed set.
    const allowedFor = (diet: 'vegan' | 'vegetarian' | 'pescatarian') =>
      diet === 'vegan' ? ['vegan'] : diet === 'vegetarian' ? ['vegan', 'vegetarian'] : ['vegan', 'vegetarian', 'pescatarian'];

    for (const ingredient of coreIngredients) {
      const tags = ingredient.dietTags!;
      for (const diet of ['vegan', 'vegetarian', 'pescatarian'] as const) {
        const eligible = isIngredientCompatibleWithDiet(ingredient, diet);
        const derivable = tags.some((tag) => allowedFor(diet).includes(tag));
        expect(derivable, `${ingredient.id} tags=${tags} diet=${diet}`).toBe(eligible);
      }
      // An omnivore-only ingredient is never compatible with a lesser diet.
      if (tags.length === 1 && tags[0] === 'omnivore') {
        for (const diet of ['vegan', 'vegetarian', 'pescatarian'] as const) {
          expect(isIngredientCompatibleWithDiet(ingredient, diet), `${ingredient.id}/${diet}`).toBe(false);
        }
      }
    }
  });
});
describe('Phase 2 · slot scarcity (the objective of the expansion)', () => {
  const eligibleIn = (slot: MealTimeType, category?: string) =>
    getIngredientsByMealTime(slot).filter((i) => !category || i.category === category);

  it('lunch/dinner fats: 3 → at least 9', () => {
    for (const slot of ['lunch', 'dinner'] as MealTimeType[]) {
      const fats = eligibleIn(slot, 'fat');
      expect(fats.length, `${slot} fats`).toBeGreaterThanOrEqual(9);
      expect(fats.map((i) => i.id)).toEqual(
        expect.arrayContaining(['tahini', 'sesame-seeds', 'pumpkin-seeds', 'kalamata-olives', 'feta-cheese', 'parmesan-cheese']),
      );
    }
  });

  it('breakfast carbs: 2 → at least 6', () => {
    const carbs = eligibleIn('breakfast', 'carbohydrate');
    expect(carbs.length).toBeGreaterThanOrEqual(6);
    expect(carbs.map((i) => i.id)).toEqual(
      expect.arrayContaining(['oats', 'whole-wheat-bread', 'buckwheat', 'rice-cakes', 'granola', 'english-muffin']),
    );
  });

  it('lunch/dinner fruits: 0 → at least 3', () => {
    for (const slot of ['lunch', 'dinner'] as MealTimeType[]) {
      const fruits = eligibleIn(slot, 'fruit');
      expect(fruits.length, `${slot} fruits`).toBeGreaterThanOrEqual(3);
      expect(fruits.map((i) => i.id)).toEqual(
        expect.arrayContaining(['pomegranate-arils', 'pineapple', 'pear', 'melon']),
      );
    }
  });

  it('every slot pool grew past the pre-expansion baseline', () => {
    // Pre-expansion eligible counts: breakfast 24, lunch 32, dinner 30, snack 21.
    // Post-expansion measured counts:    breakfast 34, lunch 78, dinner 76, snack 37.
    const minimums: Record<MealTimeType, number> = { breakfast: 34, lunch: 78, dinner: 76, snack: 37 };
    for (const slot of SLOTS) {
      expect(eligibleIn(slot).length, slot).toBeGreaterThanOrEqual(minimums[slot]);
    }
  });

  it('lunch and dinner pools more than doubled', () => {
    expect(eligibleIn('lunch').length).toBeGreaterThan(32 * 2);
    expect(eligibleIn('dinner').length).toBeGreaterThan(30 * 2);
  });

  it('every slot keeps at least two options in each role the selector uses', () => {
    for (const slot of SLOTS) {
      for (const category of ['protein', 'carbohydrate', 'vegetable', 'fat'] as const) {
        // Breakfast has no vegetable role in the current selector.
        const floor = slot === 'breakfast' && category === 'vegetable' ? 0 : 2;
        expect(eligibleIn(slot, category).length, `${slot}/${category}`).toBeGreaterThanOrEqual(floor);
      }
    }
  });

  it('library category totals grew in the targeted directions', () => {
    const count = (category: string) => getIngredientsByCategory(category as never).length;
    // Pre-expansion: protein 10, carbohydrate 8, fat 8, fruit 6, vegetable 10, misc 5.
    expect(count('fat')).toBeGreaterThanOrEqual(15);
    expect(count('fruit')).toBeGreaterThanOrEqual(12);
    expect(count('protein')).toBeGreaterThanOrEqual(20);
    expect(count('carbohydrate')).toBeGreaterThanOrEqual(16);
    expect(count('vegetable')).toBeGreaterThanOrEqual(20);
    expect(count('misc')).toBeGreaterThanOrEqual(17);
  });
});
