import { describe, it, expect } from 'vitest';
import { PlanScorer, macroAccuracyCriterion, diversityCriterion, createDefaultScoringConfig } from './PlanScorer';
import type { CandidatePlan, ScoringContext, ScoringConfig } from './types';
import type { WeeklyMealPlanResult, FullDayMealPlanResult } from '@/services/recipe/types';
import type { IngredientData } from '@/data/ingredientDatabase';
import type { Macros, MacroTargets } from '@/types';

/* ------------------------------------------------------------------ */
/* Test fixtures                                                       */
/* ------------------------------------------------------------------ */

const TARGETS: MacroTargets = {
  calories: 2200,
  protein: 165,
  carbs: 220,
  fat: 75,
};

const WEEKLY_TARGETS: MacroTargets = {
  calories: 15400,
  protein: 1155,
  carbs: 1540,
  fat: 525,
};

function makeDay(
  mealIngredients: Record<'breakfast' | 'lunch' | 'dinner' | 'snack', Array<{ id: string; category: string }>>,
  recipeTexts: Record<'breakfast' | 'lunch' | 'dinner' | 'snack', string>,
  mealMacros: Macros
): FullDayMealPlanResult {
  const dailyPlan = {} as FullDayMealPlanResult['dailyPlan'];
  for (const slot of ['breakfast', 'lunch', 'dinner', 'snack'] as const) {
    dailyPlan[slot] = {
      ingredients: mealIngredients[slot].map(({ id, category }) => ({
        id,
        name: id,
        category: category as IngredientData['category'],
        macros: { protein: 0, carbs: 0, fat: 0, calories: 0 },
        allowedMeals: [],
        typical_serving_size_g: 100,
        tags: [],
      })),
      recipeText: recipeTexts[slot],
      macros: { protein: 0, carbs: 0, fat: 0, calories: 0 },
    };
  }
  return {
    dailyPlan,
    totalMacros: mealMacros,
    targetMacros: TARGETS,
    variance: {
      calories: mealMacros.calories - TARGETS.calories,
      protein: mealMacros.protein - TARGETS.protein,
      carbs: mealMacros.carbs - TARGETS.carbs,
      fat: mealMacros.fat - TARGETS.fat,
    },
    convergenceInfo: { converged: true, iterations: 1, realismConstraintHit: false },
  };
}

function makePlan(options: {
  weeklyVariance: Macros;
  days: Array<{
    ingredients: Record<'breakfast' | 'lunch' | 'dinner' | 'snack', Array<{ id: string; category: string }>>;
    recipeTexts: Record<'breakfast' | 'lunch' | 'dinner' | 'snack', string>;
  }>;
}): WeeklyMealPlanResult {
  const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

  const plan: WeeklyMealPlanResult = {
    days: options.days.map((day, i) => ({
      dayNumber: i + 1,
      dayName: `Day ${i + 1}`,
      plan: makeDay(
        day.ingredients,
        day.recipeTexts,
        {
          calories: 2200,
          protein: 165,
          carbs: 220,
          fat: 75,
        }
      ),
    })),
    weeklyTotalMacros: {
      calories: 15400 - options.weeklyVariance.calories,
      protein: 1155 - options.weeklyVariance.protein,
      carbs: 1540 - options.weeklyVariance.carbs,
      fat: 525 - options.weeklyVariance.fat,
    },
    weeklyTargetMacros: WEEKLY_TARGETS,
    weeklyVariance: options.weeklyVariance,
  };

  void MEAL_SLOTS;
  return plan;
}

function makeCandidate(
  plan: WeeklyMealPlanResult,
  seed = 'seed-A',
  candidateIndex = 0
): CandidatePlan {
  return { plan, seed, candidateIndex };
}

const CONTEXT: ScoringContext = {
  input: {
    clientId: 'client-1',
    likedFoods: [],
    macroTargets: TARGETS,
    regenerationCount: 1,
    candidateCount: 10,
  },
};

const BASE_INGREDIENTS = {
  breakfast: [
    { id: 'eggs', category: 'protein' },
    { id: 'oats', category: 'carbohydrate' },
    { id: 'banana', category: 'fruit' },
    { id: 'almonds', category: 'fat' },
  ],
  lunch: [
    { id: 'chicken-breast', category: 'protein' },
    { id: 'brown-rice', category: 'carbohydrate' },
    { id: 'broccoli', category: 'vegetable' },
    { id: 'olive-oil', category: 'fat' },
  ],
  dinner: [
    { id: 'salmon', category: 'protein' },
    { id: 'sweet-potato', category: 'carbohydrate' },
    { id: 'spinach', category: 'vegetable' },
    { id: 'olive-oil', category: 'fat' },
  ],
  snack: [
    { id: 'greek-yogurt', category: 'protein' },
    { id: 'apple', category: 'fruit' },
    { id: 'peanut-butter', category: 'fat' },
  ],
} as const;

const BASE_RECIPE_TEXTS = {
  breakfast: 'Eggs Power Bowl',
  lunch: 'Chicken & Rice Plate',
  dinner: 'Salmon Dinner',
  snack: 'Yogurt & Apple Snack',
} as const;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function uniqueWeek(): WeeklyMealPlanResult {
  return makePlan({
    weeklyVariance: { calories: 0, protein: 0, carbs: 0, fat: 0 },
    days: Array.from({ length: 7 }, (_, dayIdx) => ({
      ingredients: {
        breakfast: [
          { id: `eggs-${dayIdx}`, category: 'protein' },
          { id: 'oats', category: 'carbohydrate' },
          { id: 'banana', category: 'fruit' },
          { id: 'almonds', category: 'fat' },
        ],
        lunch: [
          { id: `protein-${dayIdx}`, category: 'protein' },
          { id: 'brown-rice', category: 'carbohydrate' },
          { id: 'broccoli', category: 'vegetable' },
          { id: 'olive-oil', category: 'fat' },
        ],
        dinner: [
          { id: `protein-${dayIdx}-d`, category: 'protein' },
          { id: 'sweet-potato', category: 'carbohydrate' },
          { id: 'spinach', category: 'vegetable' },
          { id: 'olive-oil', category: 'fat' },
        ],
        snack: [
          { id: `protein-s-${dayIdx}`, category: 'protein' },
          { id: 'apple', category: 'fruit' },
          { id: 'peanut-butter', category: 'fat' },
        ],
      },
      recipeTexts: {
        breakfast: `Breakfast ${dayIdx}`,
        lunch: `Lunch ${dayIdx}`,
        dinner: `Dinner ${dayIdx}`,
        snack: `Snack ${dayIdx}`,
      },
    })),
  });
}

/** A week where every meal has identical recipe text and identical ingredients. */
function repetitiveWeek(): WeeklyMealPlanResult {
  const dayIngredients: Record<'breakfast' | 'lunch' | 'dinner' | 'snack', Array<{ id: string; category: string }>> = {
    breakfast: BASE_INGREDIENTS.breakfast.map(i => ({ id: i.id, category: i.category })),
    lunch: BASE_INGREDIENTS.lunch.map(i => ({ id: i.id, category: i.category })),
    dinner: BASE_INGREDIENTS.dinner.map(i => ({ id: i.id, category: i.category })),
    snack: BASE_INGREDIENTS.snack.map(i => ({ id: i.id, category: i.category })),
  };

  return makePlan({
    weeklyVariance: { calories: 0, protein: 0, carbs: 0, fat: 0 },
    days: Array.from({ length: 7 }, () => ({
      ingredients: dayIngredients,
      recipeTexts: { ...BASE_RECIPE_TEXTS },
    })),
  });
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe('macroAccuracyCriterion', () => {
  it('scores a perfect plan at 0', () => {
    const plan = uniqueWeek();
    const score = macroAccuracyCriterion.score(makeCandidate(plan), CONTEXT);
    expect(score).toBe(0);
  });

  it('scores a plan with variance higher than a perfect plan', () => {
    const perfect = makeCandidate(uniqueWeek());
    const imperfect = makeCandidate(
      makePlan({
        weeklyVariance: { calories: 1540, protein: 115, carbs: 154, fat: 52 }, // ~10% off each
        days: Array.from({ length: 7 }, (_, dayIdx) => ({
          ingredients: {
            breakfast: [{ id: `eggs-${dayIdx}`, category: 'protein' }, { id: 'oats', category: 'carbohydrate' }, { id: 'banana', category: 'fruit' }, { id: 'almonds', category: 'fat' }],
            lunch: [{ id: `protein-${dayIdx}`, category: 'protein' }, { id: 'brown-rice', category: 'carbohydrate' }, { id: 'broccoli', category: 'vegetable' }, { id: 'olive-oil', category: 'fat' }],
            dinner: [{ id: `protein-${dayIdx}-d`, category: 'protein' }, { id: 'sweet-potato', category: 'carbohydrate' }, { id: 'spinach', category: 'vegetable' }, { id: 'olive-oil', category: 'fat' }],
            snack: [{ id: `protein-s-${dayIdx}`, category: 'protein' }, { id: 'apple', category: 'fruit' }, { id: 'peanut-butter', category: 'fat' }],
          },
          recipeTexts: {
            breakfast: `Breakfast ${dayIdx}`,
            lunch: `Lunch ${dayIdx}`,
            dinner: `Dinner ${dayIdx}`,
            snack: `Snack ${dayIdx}`,
          },
        })),
      })
    );

    const perfectScore = macroAccuracyCriterion.score(perfect, CONTEXT);
    const imperfectScore = macroAccuracyCriterion.score(imperfect, CONTEXT);
    expect(perfectScore).toBeLessThan(imperfectScore);
  });
});

describe('diversityCriterion', () => {
  it('scores a repetitive plan higher than a diverse plan with equal macros', () => {
    const diverse = diversityCriterion.score(makeCandidate(uniqueWeek()), CONTEXT);
    const repetitive = diversityCriterion.score(makeCandidate(repetitiveWeek()), CONTEXT);
    expect(repetitive).toBeGreaterThan(diverse);
  });

  it('scores a fully unique week at 0', () => {
    const score = diversityCriterion.score(makeCandidate(uniqueWeek()), CONTEXT);
    expect(score).toBe(0);
  });
});

describe('PlanScorer', () => {
  it('better macro accuracy wins when diversity is equal', () => {
    const scorer = new PlanScorer(createDefaultScoringConfig());
    const goodCandidate = makeCandidate(uniqueWeek(), 'good', 0);
    const badCandidate = makeCandidate(
      makePlan({
        weeklyVariance: { calories: 1540, protein: 115, carbs: 154, fat: 52 },
        days: Array.from({ length: 7 }, (_, dayIdx) => ({
          ingredients: {
            breakfast: [{ id: `eggs-${dayIdx}`, category: 'protein' }, { id: 'oats', category: 'carbohydrate' }, { id: 'banana', category: 'fruit' }, { id: 'almonds', category: 'fat' }],
            lunch: [{ id: `protein-${dayIdx}`, category: 'protein' }, { id: 'brown-rice', category: 'carbohydrate' }, { id: 'broccoli', category: 'vegetable' }, { id: 'olive-oil', category: 'fat' }],
            dinner: [{ id: `protein-${dayIdx}-d`, category: 'protein' }, { id: 'sweet-potato', category: 'carbohydrate' }, { id: 'spinach', category: 'vegetable' }, { id: 'olive-oil', category: 'fat' }],
            snack: [{ id: `protein-s-${dayIdx}`, category: 'protein' }, { id: 'apple', category: 'fruit' }, { id: 'peanut-butter', category: 'fat' }],
          },
          recipeTexts: {
            breakfast: `Breakfast ${dayIdx}`,
            lunch: `Lunch ${dayIdx}`,
            dinner: `Dinner ${dayIdx}`,
            snack: `Snack ${dayIdx}`,
          },
        })),
      }),
      'bad',
      1
    );

    const goodScore = scorer.score(goodCandidate, CONTEXT);
    const badScore = scorer.score(badCandidate, CONTEXT);
    expect(goodScore.total).toBeLessThan(badScore.total);
  });

  it('better diversity wins when macros are equal', () => {
    const scorer = new PlanScorer(createDefaultScoringConfig());
    const diverse = scorer.score(makeCandidate(uniqueWeek(), 'diverse', 0), CONTEXT);
    const repetitive = scorer.score(makeCandidate(repetitiveWeek(), 'repetitive', 1), CONTEXT);
    expect(diverse.total).toBeLessThan(repetitive.total);
  });

  it('adding a criterion changes the total score', () => {
    const config: ScoringConfig = { criteria: [macroAccuracyCriterion] };
    const basicScorer = new PlanScorer(config);
    const enhancedConfig: ScoringConfig = {
      criteria: [
        macroAccuracyCriterion,
        diversityCriterion,
        {
          id: 'extra-criterion',
          weight: 0.5,
          score: () => 1,
        },
      ],
    };
    const enhancedScorer = new PlanScorer(enhancedConfig);

    const candidate = makeCandidate(uniqueWeek());
    const basicScore = basicScorer.score(candidate, CONTEXT);
    const enhancedScore = enhancedScorer.score(candidate, CONTEXT);

    expect(enhancedScore.total).toBeGreaterThan(basicScore.total);
    expect(enhancedScore.breakdown['extra-criterion']).toBe(0.5);
  });

  it('is deterministic: same plan + config + context => same score', () => {
    const scorer = new PlanScorer(createDefaultScoringConfig());
    const candidate = makeCandidate(uniqueWeek());
    const a = scorer.score(candidate, CONTEXT);
    const b = scorer.score(candidate, CONTEXT);
    expect(a).toEqual(b);
  });

  it('includes expected breakdown keys', () => {
    const scorer = new PlanScorer(createDefaultScoringConfig());
    const result = scorer.score(makeCandidate(uniqueWeek()), CONTEXT);
    expect(Object.keys(result.breakdown).sort()).toEqual(['diversity', 'macro-accuracy']);
  });
});