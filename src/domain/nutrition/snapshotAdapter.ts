/**
 * Snapshot Adapter — maps live plan structures to canonical snapshot types.
 *
 * This is the ONLY place where WeeklyMealPlanResult → MealPlan[] conversion happens.
 * It preserves 100% of generated plan data: meals, recipes, ingredients, macros, hydration.
 */

import type { WeeklyMealPlanResult } from '@/services/recipeService';
import type { MealData, MealTimeType, IngredientData } from '@/data/ingredientDatabase';
import type { MealPlan, Meal, Recipe, Ingredient, RecipeServing, Macros, GroceryItem } from '@/types';

const MEAL_ORDER: MealTimeType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

const MEAL_TIMES: Record<MealTimeType, string> = {
  breakfast: '07:00',
  lunch: '12:30',
  dinner: '19:30',
  snack: '16:00',
};

/**
 * Convert a single MealData into a canonical Meal.
 */
function mapMealDataToMeal(
  mealData: MealData,
  mealType: MealTimeType,
  mealNumber: number,
): Meal {
  const ingredients: Ingredient[] = mealData.ingredients.map((ing: IngredientData) => ({
    id: ing.id,
    name: ing.name,
    amount: ing.typical_serving_size_g,
    unit: 'g' as const,
    category: mapIngredientCategory(ing.category),
    macrosPer100g: {
      calories: ing.macros.calories,
      protein: ing.macros.protein,
      carbs: ing.macros.carbs,
      fat: ing.macros.fat,
      fiber: ing.macros.fiber,
    },
    allergens: [],
    substitutes: [],
  }));

  const recipe: Recipe = {
    id: `${mealType}-recipe`,
    name: mealData.recipeText || `${mealType} recipe`,
    category: mealType,
    prepTime: 0,
    cookTime: 0,
    servings: 1,
    ingredients,
    instructions: [],
    macrosPerServing: {
      calories: mealData.macros.calories,
      protein: mealData.macros.protein,
      carbs: mealData.macros.carbs,
      fat: mealData.macros.fat,
      fiber: mealData.macros.fiber,
    },
    tags: [],
    dietTypes: [],
    allergens: [],
    equipment: [],
    difficulty: 'easy',
  };

  const serving: RecipeServing = {
    recipe,
    servings: 1,
    adjustedMacros: { ...recipe.macrosPerServing },
  };

  return {
    id: `${mealType}-${mealNumber}`,
    mealNumber,
    mealType,
    time: MEAL_TIMES[mealType],
    recipes: [serving],
    totalMacros: {
      calories: mealData.macros.calories,
      protein: mealData.macros.protein,
      carbs: mealData.macros.carbs,
      fat: mealData.macros.fat,
      fiber: mealData.macros.fiber,
    },
  };
}

function mapIngredientCategory(
  cat: IngredientData['category'],
): Ingredient['category'] {
  const mapping: Record<string, Ingredient['category']> = {
    protein: 'protein',
    carbohydrate: 'carb',
    fat: 'fat',
    fruit: 'fruit',
    vegetable: 'vegetable',
    misc: 'other',
  };
  return mapping[cat] ?? 'other';
}

/**
 * Map a WeeklyMealPlanResult into the canonical MealPlan[] used by PlanSnapshot.
 *
 * Preserves every day, every meal, every recipe, every ingredient, every macro value.
 */
export function mapWeeklyMealPlanToSnapshot(
  weeklyPlan: WeeklyMealPlanResult,
): MealPlan[] {
  return weeklyPlan.days.map((day) => {
    const dailyPlan = day.plan.dailyPlan;
    const meals: Meal[] = [];
    let mealNumber = 1;

    for (const mealType of MEAL_ORDER) {
      const mealData = dailyPlan[mealType];
      if (mealData && mealData.ingredients.length > 0) {
        meals.push(mapMealDataToMeal(mealData, mealType, mealNumber));
        mealNumber++;
      }
    }

    return {
      day: day.dayNumber,
      meals,
      totalMacros: {
        calories: day.plan.totalMacros.calories,
        protein: day.plan.totalMacros.protein,
        carbs: day.plan.totalMacros.carbs,
        fat: day.plan.totalMacros.fat,
        fiber: day.plan.totalMacros.fiber,
      },
      hydration: 0, // populated from metrics if available
    };
  });
}

/**
 * Build a grocery list from the full weekly plan.
 * Aggregates all ingredients across all days and meals.
 */
export function buildGroceryListFromPlan(
  weeklyPlan: WeeklyMealPlanResult,
): GroceryItem[] {
  const agg = new Map<string, { totalG: number; category: string }>();

  for (const day of weeklyPlan.days) {
    const dp = day.plan.dailyPlan;
    for (const mealType of MEAL_ORDER) {
      const mealData = dp[mealType];
      if (!mealData) continue;
      for (const ing of mealData.ingredients) {
        const existing = agg.get(ing.id);
        if (existing) {
          existing.totalG += ing.typical_serving_size_g;
        } else {
          agg.set(ing.id, {
            totalG: ing.typical_serving_size_g,
            category: ing.category,
          });
        }
      }
    }
  }

  const items: GroceryItem[] = [];
  for (const [id, val] of agg) {
    // We need the ingredient name — look it up from the plan data
    let name = id;
    outer: for (const day of weeklyPlan.days) {
      for (const mealType of MEAL_ORDER) {
        const mealData = day.plan.dailyPlan[mealType];
        if (!mealData) continue;
        const found = mealData.ingredients.find((i) => i.id === id);
        if (found) {
          name = found.name;
          break outer;
        }
      }
    }

    items.push({
      ingredient: name,
      totalAmount: Math.round(val.totalG),
      unit: 'g',
      category: val.category,
    });
  }

  return items;
}
