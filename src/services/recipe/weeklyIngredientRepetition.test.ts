import { describe, it, expect } from 'vitest';
import {
  generateWeeklyMealPlan,
  buildRecipeGenerationOptions,
  selectBalancedIngredients,
  getSuitableIngredients,
} from './index';
import type { IngredientData } from '@/data/ingredientDatabase';
import { preferUnusedPick, preferUnusedOrdered } from './selectors';
import type { RecipeArchetype } from './archetypes';
import { resolveArchetypeIngredients, selectArchetypeForMeal, isArchetypeSatisfiable } from './archetypeSelection';
import { createSeededRng, type Rng } from '@/utils/random';
import type { MealType } from './constants';
import type { RecipeGenerationOptions } from './types';

const macroTargets = { calories: 2000, protein: 150, carbs: 200, fat: 70 };

function makeIngredient(id: string, category: IngredientData['category'], allowedMeals: readonly MealType[]): IngredientData {
  return {
    id,
    name: id,
    category,
    macros: { protein: 5, carbs: 10, fat: 3, calories: 100 },
    allowedMeals: [...allowedMeals],
    typical_serving_size_g: 100,
    tags: [] as string[],
    allergens: undefined,
    dietTags: undefined,
  };
}

const WIDE: string[] = [
  'eggs', 'greek-yogurt', 'skyr', 'whey-protein-powder',
  'chicken-breast', 'salmon', 'tofu', 'lentils', 'turkey-breast',
  'black-beans', 'chickpeas', 'tempeh', 'edamame', 'tuna', 'cod', 'shrimp', 'lean-beef', 'mackerel',
  'brown-rice', 'quinoa', 'oats', 'whole-wheat-bread', 'sweet-potato', 'couscous', 'bulgur-wheat', 'corn-tortilla',
  'broccoli', 'spinach', 'tomato', 'carrot', 'kale', 'bell-pepper', 'garlic', 'olive-oil', 'lemon',
  'banana', 'apple', 'berries-mixed', 'orange', 'avocado', 'almonds', 'walnuts',
];

const NARROW: string[] = ['eggs', 'greek-yogurt', 'skyr', 'turkey-breast', 'salmon'];
const GRACE: string[] = [
  'oats', 'banana', 'greek-yogurt', 'skyr', 'whey-protein-powder',
  'almonds', 'whole-wheat-bread', 'brown-rice', 'quinoa', 'chicken-breast',
  'broccoli', 'spinach', 'olive-oil', 'garlic', 'lemon', 'herbs-mixed',
];

const build = (archetype: boolean, diversity: boolean | undefined, history?: readonly string[] | undefined): RecipeGenerationOptions => ({
  ...buildRecipeGenerationOptions({
    allowedIngredientIds: WIDE,
    activation: { archetypeGeneration: archetype },
    dietType: null,
  }),
  weekIngredientDiversity: diversity,
  weekUsedIngredientIds: history,
});

const legacy = (): RecipeGenerationOptions => build(false, false, []);
const enriched = (): RecipeGenerationOptions => build(true, true);
const mealTypes = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

function lunchProtein(plan: any, day: number): string {
  return plan.days[day].plan.dailyPlan.lunch.ingredients.find((i: IngredientData) => i.category === 'protein')!.id;
}

function repetitionReport(plan: any) {
  const seen = new Set<string>();
  let repeated = 0;
  let total = 0;
  let empties = 0;
  for (const day of plan.days) {
    for (const meal of mealTypes) {
      const ids = day.plan.dailyPlan[meal].ingredients.map((i: IngredientData) => i.id);
      total += ids.length;
      if (ids.length === 0) empties++;
      for (const id of ids) {
        if (seen.has(id)) repeated++;
        else seen.add(id);
      }
    }
  }
  return { repeated, total, empties };
}

function isFull(plan: any): boolean {
  return plan.days.every((d: any) => mealTypes.every((m) => d.plan.dailyPlan[m].ingredients.length > 0));
}

describe('selector units — unused candidates are preferred, exhausted is graceful', () => {
  it('preferUnusedPick prefers unused candidates and falls back to all when exhausted', () => {
    const candidates = [
      makeIngredient('turkey-breast', 'protein', ['lunch', 'dinner']),
      makeIngredient('salmon', 'protein', ['lunch', 'dinner']),
      makeIngredient('tofu', 'protein', ['lunch', 'dinner']),
    ];
    const used = new Set(['salmon', 'turkey-breast']);
    // Fresh candidates only — repetition is preferred away, never banned; the
    // caller backfills the remaining count from the used ones behind them.
    expect(preferUnusedPick(candidates, used).map((i) => i.id)).toEqual(['tofu']);
    // Exhausted: every candidate is already used, so the full list comes back
    // in its original order rather than an empty result.
    const allUsed = new Set(['turkey-breast', 'salmon', 'tofu']);
    expect(preferUnusedPick(candidates, allUsed).map((i) => i.id)).toEqual([
      'turkey-breast',
      'salmon',
      'tofu',
    ]);
  });

  it('preferUnusedPick is identity when the used set is absent or empty', () => {
    const candidates = [makeIngredient('turkey-breast', 'protein', ['lunch', 'dinner'])];
    expect(preferUnusedPick(candidates, undefined).map((i) => i.id)).toEqual(['turkey-breast']);
    expect(preferUnusedPick(candidates, new Set<string>()).map((i) => i.id)).toEqual(['turkey-breast']);
  });

  it('preferUnusedOrdered hoists fresh then preserves used order', () => {
    const candidates = [
      makeIngredient('turkey-breast', 'protein', ['lunch', 'dinner']),
      makeIngredient('salmon', 'protein', ['lunch', 'dinner']),
      makeIngredient('tofu', 'protein', ['lunch', 'dinner']),
    ];
    const used = new Set(['salmon', 'turkey-breast']);
    expect(preferUnusedOrdered(candidates, used).map((i) => i.id)).toEqual(['tofu', 'turkey-breast', 'salmon']);
  });

  it('selectBalancedIngredients prefers an unused protein when a soft history is present', () => {
    const suitable = getSuitableIngredients(WIDE, 'lunch', { allowedIngredientIds: WIDE });
    const rng: Rng = { next: () => 0, int: (n) => 0, pick: <T>(arr: readonly T[]) => arr[0], shuffle: <T>(arr: T[]) => arr.slice() };
    const withHistory = new Set(['turkey-breast', 'salmon']);
    const picked = selectBalancedIngredients(suitable, 'lunch', rng, withHistory);
    expect(picked.find((i) => i.category === 'protein')?.id).not.toBe('turkey-breast');
    expect(picked.find((i) => i.category === 'protein')?.id).not.toBe('salmon');
  });
});

describe('weekly generation — flag omitted, undefined, and explicitly false are inert', () => {
  it('omitted flag, undefined flag, empty history, and legacy are byte-identical', () => {
    // Hold the archetype flag constant so ONLY the diversity flag varies — that
    // is the isolation this test is about. (Comparing an archetype-on plan to an
    // archetype-off baseline would differ for unrelated structural reasons.)
    const legacyPlan = generateWeeklyMealPlan(WIDE, macroTargets, 'flag-state-1', build(false, false, []));
    const offWithHistory = generateWeeklyMealPlan(WIDE, macroTargets, 'flag-state-1', build(false, false, ['turkey-breast']));
    const offUndefined = generateWeeklyMealPlan(WIDE, macroTargets, 'flag-state-1', build(false, undefined));
    expect(offWithHistory).toEqual(legacyPlan);
    expect(offUndefined).toEqual(legacyPlan);
    expect(legacyPlan.days.every((d: any) => mealTypes.every((m) => d.plan.dailyPlan[m].ingredients.length > 0))).toBe(true);
  });

  it('determinism holds for a fixed seed in both modes', () => {
    const a = generateWeeklyMealPlan(WIDE, macroTargets, 'deterministic-3a', enriched());
    const b = generateWeeklyMealPlan(WIDE, macroTargets, 'deterministic-3a', enriched());
    expect(a).toEqual(b);
    const c = generateWeeklyMealPlan(WIDE, macroTargets, 'deterministic-3a', legacy());
    const d = generateWeeklyMealPlan(WIDE, macroTargets, 'deterministic-3a', legacy());
    expect(c).toEqual(d);
  });
});


describe('weekly generation — archetype behaviour preserved', () => {
  it('both archetype-on and archetype-off weekly plans stay valid and non-empty', () => {
    const on = generateWeeklyMealPlan(WIDE, macroTargets, 'archetype-3a', build(true, true));
    const off = generateWeeklyMealPlan(WIDE, macroTargets, 'archetype-3a', build(false, false, []));
    expect(isFull(on)).toBe(true);
    expect(isFull(off)).toBe(true);
  });

  it('archetype role-filling prefers unused candidates', () => {
    const pool: IngredientData[] = [
      makeIngredient('turkey-breast', 'protein', ['lunch', 'dinner']),
      makeIngredient('salmon', 'protein', ['lunch', 'dinner']),
      makeIngredient('brown-rice', 'carbohydrate', ['lunch', 'dinner']),
      makeIngredient('quinoa', 'carbohydrate', ['lunch', 'dinner']),
      makeIngredient('broccoli', 'vegetable', ['lunch', 'dinner']),
    ];
    const archetype: RecipeArchetype = {
      id: 'test-archetype',
      name: 'Test Archetype',
      supportedMeals: ['lunch'],
      requiredRoles: { protein: 1, carbohydrate: 1 },
      optionalRoles: { vegetable: 1 },
      maxIngredients: 3,
      compatibleDiets: ['omnivore'],
      template: { title: 'Test {protein} & {carbohydrate}', steps: ['Mix'] },
    };
    expect(isArchetypeSatisfiable(archetype, pool)).toBe(true);
    // Only `salmon` is spent, so `turkey-breast` is a genuinely unused protein and
    // must win the required protein slot. (Marking EVERY protein as used would
    // leave nothing unused to prefer, which is the exhaustion case covered by the
    // selector-unit test instead.)
    const chosen = resolveArchetypeIngredients(archetype, pool, createSeededRng('arch-unit'), new Set(['salmon']))!;
    const proteins = chosen.filter((i) => i.category === 'protein').map((i) => i.id);
    const carbs = chosen.filter((i) => i.category === 'carbohydrate').map((i) => i.id);
    expect(proteins).toContain('turkey-breast');
    expect(proteins).not.toContain('salmon');
    // `carbohydrate: 1` fills exactly one carb slot, so exactly one carb is chosen.
    // Both pool carbs are week-unused, so the seeded shuffle decides which.
    expect(carbs).toHaveLength(1);
    expect(['brown-rice', 'quinoa']).toContain(carbs[0]);
    expect(chosen.length).toBeGreaterThanOrEqual(2);
  });
});

describe('weekly generation — pre-existing history', () => {
  it('day 0 avoids ids already present in the supplied weekUsedIngredientIds', () => {
    const seeds = ['turkey-breast', 'salmon', 'tofu', 'lentils', 'tempeh'];
    const plan = generateWeeklyMealPlan(WIDE, macroTargets, 'hist-3a', {
      ...buildRecipeGenerationOptions({ allowedIngredientIds: WIDE, activation: { archetypeGeneration: true } }),
      weekIngredientDiversity: true,
      weekUsedIngredientIds: seeds,
    });
    for (const seed of seeds) {
      expect(plan.days[0].plan.dailyPlan.lunch.ingredients.map((i: IngredientData) => i.id)).not.toContain(seed);
      expect(plan.days[0].plan.dailyPlan.dinner.ingredients.map((i: IngredientData) => i.id)).not.toContain(seed);
    }
    expect(isFull(plan)).toBe(true);
  });
});


describe('weekly generation — enabled diversity reduces repetition', () => {
  it('same seed: enabled diversity repeats fewer ingredients while meals stay full', () => {
    const off = repetitionReport(generateWeeklyMealPlan(WIDE, macroTargets, 'seed-cmp-1', legacy()));
    const on = repetitionReport(generateWeeklyMealPlan(WIDE, macroTargets, 'seed-cmp-1', enriched()));
    expect(on.repeated).toBeLessThan(off.repeated);
    expect(on.empties).toBe(off.empties);
    expect(isFull(generateWeeklyMealPlan(WIDE, macroTargets, 'seed-cmp-1', enriched()))).toBe(true);
  });
});

describe('weekly generation — accumulation and threading without initial history', () => {
  it('enabling the flag with no initial history still accumulates and threads across days', () => {
    const plan = generateWeeklyMealPlan(NARROW, macroTargets, 'accum-3a', enriched());
    const sets = plan.days.map((d: any) => new Set<string>(d.plan.dailyPlan.lunch.ingredients.map((i: IngredientData) => i.id)));
    const seen = new Set<string>();
    let prev = 0;
    for (const set of sets) {
      for (const id of set) seen.add(id);
      // The CUMULATIVE view must grow monotonically; the per-day lunch set is
      // capped by maxIngredients, so it cannot grow every day on its own.
      expect(seen.size).toBeGreaterThanOrEqual(prev);
      expect(sets[0].size).toBe(set.size);
      prev = seen.size;
    }
    // The week must surface more distinct lunch ingredients than a single day does,
    // which is only possible if day 1+ actually saw day 0's picks.
    expect(seen.size).toBeGreaterThan(sets[0].size);
  });
});


describe('weekly generation — narrow pool avoidance executes', () => {
  it('diversity avoids the repeated lunch/dinner protein on the second day', () => {
    const off = generateWeeklyMealPlan(NARROW, macroTargets, 'nav-9', legacy());
    const on = generateWeeklyMealPlan(NARROW, macroTargets, 'nav-9', enriched());
    const offLunch = lunchProtein(off, 1);
    const onLunch = lunchProtein(on, 1);
    const onDay0 = lunchProtein(on, 0);
    // Measured for seed 'nav-9' on NARROW (legacy day0/1 = turkey-breast/eggs,
    // enabled day0/1 = turkey-breast/salmon): the enabled path routes day 1 away
    // from day 0's protein and away from what legacy would have picked. Comparing
    // a legacy day-1 pick against an enabled day-0 pick across two plans is not a
    // meaningful equality, so only the enabled-plan relations are asserted.
    expect(onLunch).not.toBe(onDay0);
    expect(onLunch).not.toBe(offLunch);
  });
});

describe('weekly generation — graceful degradation', () => {
  it('sole lunch/dinner protein repeats while all meals remain non-empty', () => {
    const plan = generateWeeklyMealPlan(GRACE, macroTargets, 'grace-3a', enriched());
    expect(isFull(plan)).toBe(true);
    for (let d = 0; d < 7; d++) {
      const lunch = plan.days[d].plan.dailyPlan.lunch.ingredients.find((i: IngredientData) => i.category === 'protein');
      const dinner = plan.days[d].plan.dailyPlan.dinner.ingredients.find((i: IngredientData) => i.category === 'protein');
      expect(lunch?.id).toBe('chicken-breast');
      expect(dinner?.id).toBe('chicken-breast');
    }
    expect(repetitionReport(plan).empties).toBe(0);
  });
});

describe('weekly generation — legacy fallback preserved', () => {
  it('archetype-incapable pool yields full non-empty days with the preference active', () => {
    const plan = generateWeeklyMealPlan(NARROW, macroTargets, 'fallback-3a', {
      ...buildRecipeGenerationOptions({ allowedIngredientIds: NARROW, activation: { archetypeGeneration: true } }),
      weekIngredientDiversity: true,
    });
    expect(plan.days.length).toBe(7);
    expect(plan.days.every((d: any) => mealTypes.every((m) => d.plan.dailyPlan[m].ingredients.length > 0))).toBe(true);
  });
});

