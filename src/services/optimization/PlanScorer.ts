import type {
  CandidatePlan,
  PlanScore,
  PlanScorer as PlanScorerInterface,
  ScoringConfig,
  ScoringContext,
  ScoringCriterion,
} from './types';
import type { WeeklyMealPlanResult } from '@/services/recipe/types';
import type { MealData } from '@/data/ingredientDatabase';

const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
type MealSlot = (typeof MEAL_SLOTS)[number];

/** Extract all meals from a weekly plan as flat records. */
function extractMeals(plan: WeeklyMealPlanResult): MealData[] {
  const meals: MealData[] = [];
  for (const day of plan.days) {
    for (const slot of MEAL_SLOTS) {
      meals.push(day.plan.dailyPlan[slot]);
    }
  }
  return meals;
}

/** Count excess occurrences of duplicated values (e.g. 3 identical => 2 excess). */
function countDuplicates(values: string[]): number {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let excess = 0;
  for (const count of counts.values()) {
    if (count > 1) excess += count - 1;
  }
  return excess;
}

/** Percentage variance helper: |actual| / target, 0 when target is 0. */
function pctVariance(actual: number, target: number): number {
  return target > 0 ? Math.abs(actual / target) : 0;
}

/**
 * Macro accuracy criterion.
 * Sum of absolute percentage variances (calories, protein, carbs, fat).
 * Reuses the already-computed weeklyVariance / weeklyTargetMacros — no recomputation.
 * Lower = better.
 */
export const macroAccuracyCriterion: ScoringCriterion = {
  id: 'macro-accuracy',
  weight: 1.0,
  score: (candidate) => {
    const { weeklyVariance, weeklyTargetMacros } = candidate.plan;
    return (
      pctVariance(weeklyVariance.calories, weeklyTargetMacros.calories) +
      pctVariance(weeklyVariance.protein, weeklyTargetMacros.protein) +
      pctVariance(weeklyVariance.carbs, weeklyTargetMacros.carbs) +
      pctVariance(weeklyVariance.fat, weeklyTargetMacros.fat)
    );
  },
};

/**
 * Diversity criterion.
 * Penalizes:
 *  - repeated recipe texts across meals
 *  - repeated ingredient-ID combinations across meals
 *  - repeated meal structure (same protein in the same meal slot across days)
 * Normalized by total meal count. Lower = better.
 */
export const diversityCriterion: ScoringCriterion = {
  id: 'diversity',
  weight: 0.3,
  score: (candidate) => {
    const meals = extractMeals(candidate.plan);
    const totalMeals = meals.length;
    if (totalMeals === 0) return 0;

    const recipeTexts = meals.map(m => m.recipeText);
    const ingredientCombos = meals.map(m =>
      m.ingredients.map(i => i.id).sort().join('|')
    );

    const repeatedRecipes = countDuplicates(recipeTexts);
    const repeatedCombos = countDuplicates(ingredientCombos);
    const repeatedStructure = countRepeatedMealStructure(candidate.plan);

    return (repeatedRecipes + repeatedCombos + repeatedStructure) / totalMeals;
  },
};

/** Count how often the same protein appears in the same meal slot across days. */
function countRepeatedMealStructure(plan: WeeklyMealPlanResult): number {
  let repeats = 0;
  for (const slot of MEAL_SLOTS) {
    const proteins: string[] = [];
    for (const day of plan.days) {
      const meal = day.plan.dailyPlan[slot];
      const protein = meal.ingredients.find(i => i.category === 'protein');
      if (protein) proteins.push(protein.id);
    }
    repeats += countDuplicates(proteins);
  }
  return repeats;
}

/** Default scoring configuration: macro accuracy + diversity. */
export function createDefaultScoringConfig(): ScoringConfig {
  return { criteria: [macroAccuracyCriterion, diversityCriterion] };
}

/**
 * Criterion-based scorer.
 * Iterates configured criteria, sums weight × raw score, returns breakdown.
 * Lower total = better. Deterministic: same plan + config + context => same score.
 */
export class PlanScorer implements PlanScorerInterface {
  constructor(private readonly config: ScoringConfig) {}

  score(plan: CandidatePlan, context: ScoringContext): PlanScore {
    const breakdown: Record<string, number> = {};
    let total = 0;

    for (const criterion of this.config.criteria) {
      const raw = criterion.score(plan, context);
      const weighted = raw * criterion.weight;
      breakdown[criterion.id] = weighted;
      total += weighted;
    }

    return { total, breakdown };
  }
}