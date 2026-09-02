/**
 * Snapshot Adapter — maps live plan structures to canonical snapshot types.
 *
 * This is the ONLY place where WeeklyMealPlanResult → MealPlan[] conversion happens.
 * It preserves 100% of generated plan data: meals, recipes, ingredients, macros, hydration.
 */

import type { WeeklyMealPlanResult, FullDayMealPlanResult } from '@/services/recipeService';
import type {
  MealPlan,
  Meal,
  Recipe,
  Ingredient,
  RecipeServing,
  Macros,
  GroceryItem,
} from '@/types';
import type { MealData, MealTimeType, IngredientData } from '@/data/ingredientDatabase';
import { sumMacros, DAYS_PER_WEEK } from '@/domain/nutrition/engine';

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
    unit: 'g',
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
    totalMacros: { ...recipe.macrosPerServing },
  };
}

function mapIngredientCategory(cat: IngredientData['category']): Ingredient['category'] {
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
 * Hydration is per-day meal-plan data: it is populated from the canonical
 * daily water target (`hydrationLiters`, i.e. `metrics.waterLiters`) when the
 * caller has resolved one. Keeping the per-day value consistent with
 * `snapshot.metrics.waterLiters` removes the contradictory `hydration: 0`
 * representation that previously dropped water at persistence.
 */
export function mapWeeklyMealPlanToSnapshot(
  weeklyPlan: WeeklyMealPlanResult,
  hydrationLiters?: number,
): MealPlan[] {
  const hydration = Number.isFinite(hydrationLiters) ? (hydrationLiters as number) : 0;
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
      totalMacros: { ...day.plan.totalMacros },
      hydration,
    };
  });
}

/**
 * Convert PlanSnapshot back to WeeklyMealPlanResult
 */
export function mapSnapshotToWeeklyPlan(snapshot: {
  weeklyPlan: readonly Readonly<MealPlan>[];
  metrics: Readonly<Macros>;
}): WeeklyMealPlanResult {
  // A week is 7 daily cycles: weekly targets are the daily macro set repeated
  // for DAYS_PER_WEEK days (canonical weekly scaling, NOT a single day).
  const weeklyTargetMacros: Macros = {
    calories: snapshot.metrics.calories * DAYS_PER_WEEK,
    protein: snapshot.metrics.protein * DAYS_PER_WEEK,
    carbs: snapshot.metrics.carbs * DAYS_PER_WEEK,
    fat: snapshot.metrics.fat * DAYS_PER_WEEK,
    fiber: snapshot.metrics.fiber ? snapshot.metrics.fiber * DAYS_PER_WEEK : 0,
  };

  // Weekly total = the sum of each day's *actual* aggregated macros, computed
  // from the canonical `sumMacros` helper (single source of truth).
  const weeklyTotalMacros = sumMacros(
    snapshot.weeklyPlan.map((day) => day.totalMacros),
  );

  const weeklyVariance: Macros = {
    calories: weeklyTotalMacros.calories - weeklyTargetMacros.calories,
    protein: weeklyTotalMacros.protein - weeklyTargetMacros.protein,
    carbs: weeklyTotalMacros.carbs - weeklyTargetMacros.carbs,
    fat: weeklyTotalMacros.fat - weeklyTargetMacros.fat,
    fiber: (weeklyTotalMacros.fiber ?? 0) - (weeklyTargetMacros.fiber ?? 0),
  };

  return {
    days: snapshot.weeklyPlan.map((day) => ({
      dayNumber: day.day,
      dayName: `Day ${day.day}`,
      plan: {
        dailyPlan: reconstructDailyPlan(day.meals),
        totalMacros: { ...day.totalMacros },
        targetMacros: { ...snapshot.metrics },
        variance: zeroMacros(),
      },
    })),
    weeklyTotalMacros,
    weeklyTargetMacros,
    weeklyVariance,
  };
}

/**
 * Build a grocery list from the full weekly plan.
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

/**
 * Reconstruct dailyPlan from Meal[] for mapSnapshotToWeeklyPlan
 */
function reconstructDailyPlan(meals: Meal[]): FullDayMealPlanResult['dailyPlan'] {
  const emptyMeal = {
    ingredients: [] as IngredientData[],
    macros: zeroMacros(),
    recipeText: '',
  };

  const dailyPlan: FullDayMealPlanResult['dailyPlan'] = {
    breakfast: { ...emptyMeal },
    lunch: { ...emptyMeal },
    dinner: { ...emptyMeal },
    snack: { ...emptyMeal },
  };

  for (const meal of meals) {
    const recipe = meal.recipes[0]?.recipe;
    dailyPlan[meal.mealType] = {
      ingredients:
        recipe?.ingredients.map((ing) => ({
          id: ing.id,
          name: ing.name,
          category: ing.category,
          typical_serving_size_g: ing.amount,
          macros: {
            calories: ing.macrosPer100g.calories,
            protein: ing.macrosPer100g.protein,
            carbs: ing.macrosPer100g.carbs,
            fat: ing.macrosPer100g.fat,
            fiber: ing.macrosPer100g.fiber ?? 0,
          },
          allowedMeals: [],
          tags: [],
        })) ?? [],
      macros: { ...meal.totalMacros },
      recipeText: recipe?.name ?? '',
    };
  }

  return dailyPlan;
}

function zeroMacros(): Macros {
  return { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
}
