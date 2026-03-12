/**
 * Tests for snapshotAdapter — full-fidelity mapping from WeeklyMealPlanResult to MealPlan[]
 */

import { describe, it, expect } from 'vitest';
import { mapWeeklyMealPlanToSnapshot, buildGroceryListFromPlan } from './snapshotAdapter';
import type { WeeklyMealPlanResult } from '@/services/recipeService';
import type { IngredientData, MealData, DailyMealPlan } from '@/data/ingredientDatabase';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const chicken: IngredientData = {
  id: 'chicken-breast',
  name: 'Chicken Breast',
  category: 'protein',
  macros: { protein: 31, carbs: 0, fat: 3.6, calories: 165, fiber: 0 },
  allowedMeals: ['lunch', 'dinner'],
  typical_serving_size_g: 150,
  tags: ['lean'],
};

const rice: IngredientData = {
  id: 'brown-rice',
  name: 'Brown Rice',
  category: 'carbohydrate',
  macros: { protein: 2.6, carbs: 23, fat: 0.9, calories: 111, fiber: 1.8 },
  allowedMeals: ['lunch', 'dinner'],
  typical_serving_size_g: 200,
  tags: ['complex-carb'],
};

const oats: IngredientData = {
  id: 'oats',
  name: 'Oats',
  category: 'carbohydrate',
  macros: { protein: 5, carbs: 27, fat: 3, calories: 150, fiber: 4 },
  allowedMeals: ['breakfast'],
  typical_serving_size_g: 80,
  tags: ['whole-grain'],
};

function makeMealData(ingredients: IngredientData[], recipeName: string): MealData {
  const macros = {
    calories: ingredients.reduce((s, i) => s + i.macros.calories, 0),
    protein: ingredients.reduce((s, i) => s + i.macros.protein, 0),
    carbs: ingredients.reduce((s, i) => s + i.macros.carbs, 0),
    fat: ingredients.reduce((s, i) => s + i.macros.fat, 0),
    fiber: ingredients.reduce((s, i) => s + (i.macros.fiber ?? 0), 0),
  };
  return { ingredients, recipeText: recipeName, macros };
}

const emptyMeal: MealData = { ingredients: [], recipeText: '', macros: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 } };

function buildDay(dayNumber: number, dailyPlan: DailyMealPlan): WeeklyMealPlanResult['days'][0] {
  const totalMacros = {
    calories: Object.values(dailyPlan).reduce((s, m: MealData) => s + m.macros.calories, 0),
    protein: Object.values(dailyPlan).reduce((s, m: MealData) => s + m.macros.protein, 0),
    carbs: Object.values(dailyPlan).reduce((s, m: MealData) => s + m.macros.carbs, 0),
    fat: Object.values(dailyPlan).reduce((s, m: MealData) => s + m.macros.fat, 0),
    fiber: Object.values(dailyPlan).reduce((s, m: MealData) => s + (m.macros.fiber ?? 0), 0),
  };
  return {
    dayNumber,
    dayName: `Day ${dayNumber}`,
    plan: {
      dailyPlan,
      totalMacros,
      targetMacros: { calories: 2000, protein: 150, carbs: 200, fat: 70 },
      variance: { calories: 0, protein: 0, carbs: 0, fat: 0 },
    },
  };
}

function buildWeeklyPlan(days: WeeklyMealPlanResult['days']): WeeklyMealPlanResult {
  return {
    days,
    weeklyTotalMacros: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
    weeklyTargetMacros: { calories: 2000, protein: 150, carbs: 200, fat: 70 },
    weeklyVariance: { calories: 0, protein: 0, carbs: 0, fat: 0 },
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('mapWeeklyMealPlanToSnapshot', () => {
  it('preserves all days, meals, recipes, ingredients, and macros', () => {
    const dailyPlan: DailyMealPlan = {
      breakfast: makeMealData([oats], 'Porridge aux flocons d\'avoine'),
      lunch: makeMealData([chicken, rice], 'Poulet grillé avec riz brun'),
      dinner: makeMealData([chicken], 'Poulet rôti'),
      snack: emptyMeal,
    };

    const weekly = buildWeeklyPlan([buildDay(1, dailyPlan)]);
    const result = mapWeeklyMealPlanToSnapshot(weekly);

    // One day
    expect(result).toHaveLength(1);
    expect(result[0].day).toBe(1);

    // 3 meals (snack is empty → skipped)
    expect(result[0].meals).toHaveLength(3);

    // Breakfast
    const breakfast = result[0].meals[0];
    expect(breakfast.mealType).toBe('breakfast');
    expect(breakfast.recipes).toHaveLength(1);
    expect(breakfast.recipes[0].recipe.name).toBe('Porridge aux flocons d\'avoine');
    expect(breakfast.recipes[0].recipe.ingredients).toHaveLength(1);
    expect(breakfast.recipes[0].recipe.ingredients[0].name).toBe('Oats');
    expect(breakfast.recipes[0].recipe.ingredients[0].amount).toBe(80);
    expect(breakfast.totalMacros.calories).toBe(150);

    // Lunch — 2 ingredients
    const lunch = result[0].meals[1];
    expect(lunch.mealType).toBe('lunch');
    expect(lunch.recipes[0].recipe.ingredients).toHaveLength(2);
    expect(lunch.recipes[0].recipe.ingredients.map(i => i.name)).toEqual(['Chicken Breast', 'Brown Rice']);
    expect(lunch.totalMacros.protein).toBe(chicken.macros.protein + rice.macros.protein);

    // Day total macros
    expect(result[0].totalMacros.calories).toBe(
      oats.macros.calories + chicken.macros.calories + rice.macros.calories + chicken.macros.calories
    );
  });
});

describe('buildGroceryListFromPlan', () => {
  it('aggregates ingredients across days and meals', () => {
    const day1: DailyMealPlan = {
      breakfast: makeMealData([oats], 'Porridge'),
      lunch: makeMealData([chicken, rice], 'Poulet riz'),
      dinner: makeMealData([chicken], 'Poulet seul'),
      snack: emptyMeal,
    };

    const weekly = buildWeeklyPlan([buildDay(1, day1), buildDay(2, day1)]);
    const groceries = buildGroceryListFromPlan(weekly);

    const chickenItem = groceries.find(g => g.ingredient === 'Chicken Breast');
    expect(chickenItem).toBeDefined();
    // chicken appears in lunch (150g) + dinner (150g) × 2 days = 600g
    expect(chickenItem!.totalAmount).toBe(600);

    const riceItem = groceries.find(g => g.ingredient === 'Brown Rice');
    expect(riceItem).toBeDefined();
    expect(riceItem!.totalAmount).toBe(400); // 200g × 2 days

    const oatsItem = groceries.find(g => g.ingredient === 'Oats');
    expect(oatsItem).toBeDefined();
    expect(oatsItem!.totalAmount).toBe(160); // 80g × 2 days
  });
});
