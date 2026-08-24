/**
 * DATA-SOURCE DIVERGENCE (F14) regression tests.
 *
 * Establishes the single canonical energy rule for ingredient / recipe / meal /
 * day / week aggregation:
 *
 *     calories = protein_g*4 + carbs_g*4 + fat_g*9
 *
 * The ingredient database still stores a legacy `calories` field per 100g that
 * can diverge from the macro-derived value (e.g. chicken 165 vs 156.4, salmon
 * 208 vs 217). These tests prove the APPLICATION calculation path always uses
 * the canonical macro-derived energy, never the legacy stored field.
 */

import { describe, it, expect } from 'vitest';
import {
  sumMacros,
  caloriesFromMacros,
  KCAL_PER_G_PROTEIN,
  KCAL_PER_G_CARBS,
  KCAL_PER_G_FAT,
} from './engine';
import { calculateMacros, type IngredientData } from '@/data/ingredientDatabase';
import {
  calculateTotalMacros,
  macroCaloriesPer100g,
} from '@/services/recipe/nutritionCalculations';
import { generateFullDayMealPlan } from '@/services/recipe/mealPlanGenerator';
import { generateWeeklyMealPlan } from '@/services/recipe/weeklyPlanGenerator';
import { mapSnapshotToWeeklyPlan } from './snapshotAdapter';
import type { MacroTargets } from '@/types';

// ============================================================================
// INCONSISTENT FIXTURES (stored calories deliberately disagree with macros)
// ============================================================================

// chicken: 31P + 0C + 3.6F -> canonical 156.4 kcal, but stored says 999.
const chickenInconsistent: IngredientData = {
  id: 'chicken-inconsistent',
  name: 'Chicken (inconsistent)',
  category: 'protein',
  macros: { protein: 31, carbs: 0, fat: 3.6, calories: 999, fiber: 0 },
  allowedMeals: ['lunch', 'dinner'],
  typical_serving_size_g: 150,
  tags: [],
};

// oats: 5P + 27C + 3F -> canonical 155 kcal, but stored says 500.
const oatsInconsistent: IngredientData = {
  id: 'oats-inconsistent',
  name: 'Oats (inconsistent)',
  category: 'carbohydrate',
  macros: { protein: 5, carbs: 27, fat: 3, calories: 500, fiber: 4 },
  allowedMeals: ['breakfast'],
  typical_serving_size_g: 80,
  tags: [],
};

const mealTargets: MacroTargets = { calories: 2000, protein: 150, carbs: 200, fat: 66 };

const LIKED_FOODS = [
  'chicken-breast', 'eggs', 'salmon', 'greek-yogurt',
  'brown-rice', 'oats', 'sweet-potato', 'banana',
  'apple', 'broccoli', 'spinach', 'olive-oil',
  'almonds', 'peanut-butter', 'garlic', 'lemon',
];

// Sum the *legacy stored* calories scaled to a serving (the OLD divergent path).
function legacyStoredCalories(ingredients: IngredientData[]): number {
  return ingredients.reduce(
    (sum, ing) => sum + ing.macros.calories * (ing.typical_serving_size_g / 100),
    0,
  );
}

describe('F14: canonical energy is the single rule for ingredient calories', () => {
  it('macro-derived calories win over conflicting stored values (per 100g)', () => {
    expect(macroCaloriesPer100g(chickenInconsistent)).toBeCloseTo(
      31 * KCAL_PER_G_PROTEIN + 3.6 * KCAL_PER_G_FAT,
      1,
    );
    expect(macroCaloriesPer100g(oatsInconsistent)).toBeCloseTo(
      5 * KCAL_PER_G_PROTEIN + 27 * KCAL_PER_G_CARBS + 3 * KCAL_PER_G_FAT,
      1,
    );
  });

  it('scaled macros produce scaled canonical calories (never scaled stored calories)', () => {
    const scaled = calculateMacros(chickenInconsistent, 150);
    // protein 46.5, fat 5.4 -> canonical 46.5*4 + 5.4*9 = 234.6 -> round 235
    expect(scaled.protein).toBeCloseTo(46.5, 1);
    expect(scaled.fat).toBeCloseTo(5.4, 1);
    expect(scaled.calories).toBe(235);
    // The legacy path would have produced Math.round(999 * 1.5) = 1499.
    expect(scaled.calories).not.toBeCloseTo(1499, 0);
  });

  it('ingredient scaling never returns negative macros or NaN', () => {
    const scaled = calculateMacros(chickenInconsistent, 0);
    expect(scaled.protein).toBe(0);
    expect(scaled.carbs).toBe(0);
    expect(scaled.fat).toBe(0);
    expect(Number.isFinite(scaled.calories)).toBe(true);
  });
});

describe('F14: recipe aggregation is canonical', () => {
  it('recipe calories equal the canonical energy of the summed macros', () => {
    const total = calculateTotalMacros([chickenInconsistent, oatsInconsistent]);
    // protein = 46.5 + 4 = 50.5 ; carbs = 0 + 21.6 = 21.6 ; fat = 5.4 + 2.4 = 7.8
    const derived = caloriesFromMacros({ protein: 50.5, carbs: 21.6, fat: 7.8 });
    expect(total.protein).toBeCloseTo(50.5, 5);
    expect(total.carbs).toBeCloseTo(21.6, 5);
    expect(total.fat).toBeCloseTo(7.8, 5);
    expect(total.calories).toBeCloseTo(derived, 5);
    // And it must NOT equal the sum of legacy stored calories (~1499 + ~400).
    expect(total.calories).not.toBeCloseTo(
      legacyStoredCalories([chickenInconsistent, oatsInconsistent]),
      5,
    );
  });

  it('sumMacros aggregation is equivalent to caloriesFromMacros of summed grams', () => {
    const parts = [
      { protein: 10, carbs: 5, fat: 2 },
      { protein: 7, carbs: 12, fat: 4 },
    ];
    const total = sumMacros(parts);
    expect(total.calories).toBeCloseTo(
      caloriesFromMacros({ protein: 17, carbs: 17, fat: 6 }),
      5,
    );
  });
});

describe('F14: meal and daily aggregation stay canonical', () => {
  it('every generated meal total matches the canonical energy of its ingredients', () => {
    const plan = generateFullDayMealPlan(LIKED_FOODS, mealTargets, 'phase4-meal-seed');
    const mealTypes = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
    for (const mt of mealTypes) {
      const meal = plan.dailyPlan[mt];
      if (!meal || meal.ingredients.length === 0) continue;

      const fromIngredients = sumMacros(
        meal.ingredients.map((ing) => ({
          protein: ing.macros.protein * (ing.typical_serving_size_g / 100),
          carbs: ing.macros.carbs * (ing.typical_serving_size_g / 100),
          fat: ing.macros.fat * (ing.typical_serving_size_g / 100),
          fiber: ing.macros.fiber !== undefined ? ing.macros.fiber * (ing.typical_serving_size_g / 100) : undefined,
        }))
      );

      // Meal calories and grams are rounded once at the meal boundary, so they
      // must stay within a couple of kcal of the canonical ingredient sum.
      expect(Math.abs(meal.macros.calories - fromIngredients.calories)).toBeLessThanOrEqual(6);
      expect(meal.macros.protein).toBeGreaterThanOrEqual(0);
      expect(meal.macros.carbs).toBeGreaterThanOrEqual(0);
      expect(meal.macros.fat).toBeGreaterThanOrEqual(0);
    }
  });

  it('daily total equals the canonical energy of its summed macros', () => {
    const plan = generateFullDayMealPlan(LIKED_FOODS, mealTargets, 'phase4-day-seed');
    const derived = caloriesFromMacros({
      protein: plan.totalMacros.protein,
      carbs: plan.totalMacros.carbs,
      fat: plan.totalMacros.fat,
    });
    expect(plan.totalMacros.calories).toBeGreaterThan(0);
    expect(Math.abs(plan.totalMacros.calories - derived)).toBeLessThanOrEqual(12);
    for (const key of ['calories', 'protein', 'carbs', 'fat'] as const) {
      expect(Number.isFinite(plan.totalMacros[key])).toBe(true);
      expect(plan.totalMacros[key]).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('F14: weekly aggregation respects the canonical rules', () => {
  it('weekly total = sum of 7 daily totals and weekly target = 7x daily', () => {
    const weekly = generateWeeklyMealPlan(LIKED_FOODS, mealTargets, 'phase4-week-seed');
    expect(weekly.days).toHaveLength(7);

    const daysCalories = weekly.days.reduce((s, d) => s + d.plan.totalMacros.calories, 0);
    expect(weekly.weeklyTotalMacros.calories).toBeCloseTo(daysCalories, 5);

    expect(weekly.weeklyTargetMacros.calories).toBe(mealTargets.calories * 7);
    expect(weekly.weeklyTargetMacros.protein).toBe(mealTargets.protein * 7);
    expect(weekly.weeklyTargetMacros.carbs).toBe(mealTargets.carbs * 7);
    expect(weekly.weeklyTargetMacros.fat).toBe(mealTargets.fat * 7);
  });

  it('mapSnapshotToWeeklyPlan weekly target is 7x and total is a sum (not a single day)', () => {
    const snapshot = {
      weeklyPlan: [
        { day: 1, meals: [], totalMacros: { calories: 370, protein: 30, carbs: 40, fat: 10, fiber: 2 }, hydration: 0 },
        { day: 2, meals: [], totalMacros: { calories: 495, protein: 40, carbs: 50, fat: 15, fiber: 3 }, hydration: 0 },
        { day: 3, meals: [], totalMacros: { calories: 620, protein: 50, carbs: 60, fat: 20, fiber: 5 }, hydration: 0 },
      ],
      metrics: { calories: 2000, protein: 150, carbs: 200, fat: 70, fiber: 30 },
    } as Parameters<typeof mapSnapshotToWeeklyPlan>[0];

    const result = mapSnapshotToWeeklyPlan(snapshot);
    expect(result.weeklyTargetMacros.calories).toBe(14000);
    // canonical: (30+40+50)*4 + (40+50+60)*4 + (10+15+20)*9 = 480 + 600 + 405 = 1485
    expect(result.weeklyTotalMacros.calories).toBe(1485);
    // Weekly total is not confused with the single-day target.
    expect(result.weeklyTotalMacros.calories).not.toBe(result.weeklyTargetMacros.calories);
  });
});

describe('F14: determinism, negatives, and NaN guards', () => {
  it('recipe aggregation is deterministic for identical input', () => {
    const a = calculateTotalMacros([chickenInconsistent, oatsInconsistent]);
    const b = calculateTotalMacros([chickenInconsistent, oatsInconsistent]);
    expect(a).toEqual(b);
  });

  it('sumMacros never yields negative or non-finite calories', () => {
    const total = sumMacros([{ protein: 0, carbs: 0, fat: 0 }]);
    expect(total.calories).toBe(0);
    expect(Number.isFinite(total.calories)).toBe(true);
    expect(total.calories).toBeGreaterThanOrEqual(0);
  });
});
