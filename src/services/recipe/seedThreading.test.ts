import { describe, it, expect } from 'vitest';
import { generateWeeklyMealPlan } from './weeklyPlanGenerator';
import type { MacroTargets } from '@/types';
import type { WeeklyMealPlanResult } from './types';

const LIKED_FOODS = [
  'chicken-breast', 'eggs', 'salmon', 'greek-yogurt',
  'brown-rice', 'oats', 'sweet-potato', 'banana',
  'apple', 'broccoli', 'spinach', 'olive-oil',
  'almonds', 'peanut-butter', 'garlic', 'lemon',
];

const MACRO_TARGETS: MacroTargets = {
  calories: 2200,
  protein: 165,
  carbs: 220,
  fat: 75,
};

function extractRecipeTexts(plan: WeeklyMealPlanResult): string[] {
  const texts: string[] = [];
  for (const day of plan.days) {
    for (const mealType of ['breakfast', 'lunch', 'dinner', 'snack'] as const) {
      texts.push(day.plan.dailyPlan[mealType].recipeText);
    }
  }
  return texts;
}

describe('generateWeeklyMealPlan seed threading', () => {
  it('produces different plans for different seeds', () => {
    const planA = generateWeeklyMealPlan(LIKED_FOODS, MACRO_TARGETS, 'candidate-A');
    const planB = generateWeeklyMealPlan(LIKED_FOODS, MACRO_TARGETS, 'candidate-B');
    expect(extractRecipeTexts(planA)).not.toEqual(extractRecipeTexts(planB));
  });

  it('produces identical plans for the same seed (reproducible)', () => {
    const planA = generateWeeklyMealPlan(LIKED_FOODS, MACRO_TARGETS, 'candidate-A');
    const planB = generateWeeklyMealPlan(LIKED_FOODS, MACRO_TARGETS, 'candidate-A');
    expect(extractRecipeTexts(planA)).toEqual(extractRecipeTexts(planB));
    expect(planA.weeklyTotalMacros).toEqual(planB.weeklyTotalMacros);
    expect(planA.weeklyVariance).toEqual(planB.weeklyVariance);
  });

  it('produces identical plans when no seed is provided (backward compatible)', () => {
    const planA = generateWeeklyMealPlan(LIKED_FOODS, MACRO_TARGETS);
    const planB = generateWeeklyMealPlan(LIKED_FOODS, MACRO_TARGETS);
    expect(extractRecipeTexts(planA)).toEqual(extractRecipeTexts(planB));
    expect(planA.weeklyTotalMacros).toEqual(planB.weeklyTotalMacros);
  });

  it('produces a different plan when a seed is provided vs no seed', () => {
    const noSeedPlan = generateWeeklyMealPlan(LIKED_FOODS, MACRO_TARGETS);
    const seededPlan = generateWeeklyMealPlan(LIKED_FOODS, MACRO_TARGETS, 'candidate-A');
    expect(extractRecipeTexts(noSeedPlan)).not.toEqual(extractRecipeTexts(seededPlan));
  });

  it('produces a valid 7-day plan structure regardless of seed', () => {
    const plan = generateWeeklyMealPlan(LIKED_FOODS, MACRO_TARGETS, 'candidate-A');
    expect(plan.days).toHaveLength(7);
    for (const day of plan.days) {
      expect(day.plan.dailyPlan.breakfast).toBeDefined();
      expect(day.plan.dailyPlan.lunch).toBeDefined();
      expect(day.plan.dailyPlan.dinner).toBeDefined();
      expect(day.plan.dailyPlan.snack).toBeDefined();
    }
  });
});