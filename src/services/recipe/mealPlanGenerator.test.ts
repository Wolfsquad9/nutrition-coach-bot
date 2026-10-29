/**
 * Regression tests for meal plan generator scale-factor alignment with canonical calories.
 *
 * Contract: the scale-factor denominator must use unrounded canonical calories
 * (4P+4C+9F via calculateTotalMacros), matching final plan aggregation in
 * finalizePlan(). Previously the denominator used recipe.macrosPerServing.calories
 * which is Math.round() of canonical — a small rounding discrepancy that could
 * cause the scaled ingredient portions to diverge from canonical expectations.
 */

import { describe, it, expect } from 'vitest';
import { generateFullDayMealPlan } from './mealPlanGenerator';
import { generateRecipe } from './recipeGenerators';
import { calculateTotalMacros } from './nutritionCalculations';
import type { MacroTargets } from '@/types';

const FOODS = ['chicken-breast', 'brown-rice', 'sweet-potato', 'broccoli', 'olive-oil', 'eggs'];

describe('scale factor uses canonical (unrounded) calories', () => {
  it('documented divergence: macrosPerServing.calories is Math.round of canonical', () => {
    // generateRecipe computes totalMacros via calculateTotalMacros (unrounded canonical)
    // then stores Math.round(totalMacros.calories) in macrosPerServing.calories.
    // When canonical has a fractional part, the two differ — this is the divergence
    // the old scale-factor denominator inherited.
    const recipe = generateRecipe(FOODS, 'lunch', 'scale-divergence-seed');
    const canonical = calculateTotalMacros(recipe.selectedIngredients).calories;
    const rounded = recipe.macrosPerServing.calories;

    expect(rounded).toBe(Math.round(canonical));
    // When canonical is fractional, rounded != canonical (the old scale factor
    // would have used the rounded value as its denominator).
    if (canonical % 1 !== 0) {
      expect(rounded).not.toBe(canonical);
    }
  });

  it('generateFullDayMealPlan meal macros match boundary-rounded canonical recomputation', () => {
    const targets: MacroTargets = { calories: 2000, protein: 120, carbs: 250, fat: 55 };
    const plan = generateFullDayMealPlan(FOODS, targets, 'scale-align-seed');

    // Every returned meal's macros must equal boundary-rounded canonical
    // recomputation from its scaled ingredients. If the scale factor had used
    // rounded canonical calories (old behavior), some meals could be off by
    // the rounding error in the denominator.
    for (const mealType of ['breakfast', 'lunch', 'dinner', 'snack'] as const) {
      const meal = plan.dailyPlan[mealType];
      if (!meal || !meal.ingredients || meal.ingredients.length === 0) continue;

      const exact = calculateTotalMacros(meal.ingredients);
      expect(meal.macros.calories).toBe(Math.round(exact.calories));
      expect(meal.macros.protein).toBe(Math.round(exact.protein));
      expect(meal.macros.carbs).toBe(Math.round(exact.carbs));
      expect(meal.macros.fat).toBe(Math.round(exact.fat));
    }
  });

  it('day total macros equal the sum of returned meal macros', () => {
    const targets: MacroTargets = { calories: 2000, protein: 120, carbs: 250, fat: 55 };
    const plan = generateFullDayMealPlan(FOODS, targets, 'scale-align-seed');

    const mealTypes = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
    const totalCalories = mealTypes.reduce(
      (s, t) => s + (plan.dailyPlan[t]?.macros.calories ?? 0),
      0,
    );
    const totalProtein = mealTypes.reduce(
      (s, t) => s + (plan.dailyPlan[t]?.macros.protein ?? 0),
      0,
    );
    const totalCarbs = mealTypes.reduce(
      (s, t) => s + (plan.dailyPlan[t]?.macros.carbs ?? 0),
      0,
    );
    const totalFat = mealTypes.reduce(
      (s, t) => s + (plan.dailyPlan[t]?.macros.fat ?? 0),
      0,
    );

    expect(plan.totalMacros.calories).toBe(totalCalories);
    expect(plan.totalMacros.protein).toBe(totalProtein);
    expect(plan.totalMacros.carbs).toBe(totalCarbs);
    expect(plan.totalMacros.fat).toBe(totalFat);
  });
});
