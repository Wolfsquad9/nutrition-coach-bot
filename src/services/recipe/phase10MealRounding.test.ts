/**
 * Phase 10 — P1: the final returned meal/day values are the values that were
 * actually validated against the convergence tolerance.
 *
 * The generator must not validate one numerical object during convergence and
 * then return a materially different object after a second rounding/recompute.
 * After the final boundary rounding, the returned meal macros and day total
 * are exactly the object the tolerance check saw (no post-validation mutation).
 */

import { describe, it, expect } from 'vitest';
import { generateFullDayMealPlan } from '@/services/recipeService';
import { sumMacros } from '@/domain/nutrition/engine';
import { checkMacroTolerance } from '@/services/recipe/nutritionCalculations';
import type { MacroTargets } from '@/types';

const FOODS = ['chicken-breast', 'brown-rice', 'sweet-potato', 'broccoli', 'olive-oil', 'eggs'];
// A target this food set demonstrably converges to (proven by the convergence
// loop itself), so the returned object is expected to satisfy tolerance.
const TARGETS: MacroTargets = { calories: 2000, protein: 120, carbs: 250, fat: 55 };

type IngredientLike = {
  typical_serving_size_g: number;
  macros: { protein: number; carbs: number; fat: number; fiber?: number };
};

const render = (ing: IngredientLike) => {
  const factor = ing.typical_serving_size_g / 100;
  return {
    protein: ing.macros.protein * factor,
    carbs: ing.macros.carbs * factor,
    fat: ing.macros.fat * factor,
    fiber: ing.macros.fiber !== undefined ? ing.macros.fiber * factor : undefined,
  };
};

type DailyPlan = import('@/services/recipeService').FullDayMealPlanResult['dailyPlan'];

const mealsOf = (dailyPlan: DailyPlan) =>
  (['breakfast', 'lunch', 'dinner', 'snack'] as const)
    .map((t) => dailyPlan[t])
    .filter((m): m is NonNullable<typeof m> => !!m && m.ingredients.length > 0);

describe('P1 · returned macros are exactly the validated macros (no post-validation drift)', () => {
  const plan = generateFullDayMealPlan(FOODS, TARGETS, 'p10-seed-c');
  const meals = mealsOf(plan.dailyPlan);

  it('day total calories equal the sum of the returned meal calories', () => {
    expect(plan.totalMacros.calories).toBe(meals.reduce((s, m) => s + m.macros.calories, 0));
  });

  it('every returned meal macro set matches its own canonical recomputation', () => {
    for (const meal of meals) {
      const exact = sumMacros(meal.ingredients.map(render));
      expect(meal.macros.calories).toBe(Math.round(exact.calories));
      expect(meal.macros.protein).toBe(Math.round(exact.protein));
      expect(meal.macros.carbs).toBe(Math.round(exact.carbs));
      expect(meal.macros.fat).toBe(Math.round(exact.fat));
    }
  });

  it('returned day total macros re-aggregate exactly from the returned meals', () => {
    expect(plan.totalMacros.protein).toBe(meals.reduce((s, m) => s + m.macros.protein, 0));
    expect(plan.totalMacros.carbs).toBe(meals.reduce((s, m) => s + m.macros.carbs, 0));
    expect(plan.totalMacros.fat).toBe(meals.reduce((s, m) => s + m.macros.fat, 0));
  });

  it('the returned object satisfies the canonical calorie tolerance', () => {
    const check = checkMacroTolerance(plan.totalMacros, TARGETS);
    expect(Math.abs(check.percentageVariance.calories)).toBeLessThanOrEqual(0.05);
  });

  it('deterministic repeated generation for the same seed', () => {
    const again = generateFullDayMealPlan(FOODS, TARGETS, 'p10-seed-c');
    expect(JSON.stringify(again.totalMacros)).toBe(JSON.stringify(plan.totalMacros));
    expect(JSON.stringify(mealsOf(again.dailyPlan).map((m) => m.macros))).toBe(
      JSON.stringify(meals.map((m) => m.macros)),
    );
  });
});