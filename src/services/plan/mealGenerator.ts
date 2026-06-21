import { Client, NutritionPlan, MealPlan, Meal, RecipeServing, NutritionMetrics } from '@/types';
import { distributeMacrosAcrossMeals } from '@/utils/calculations';
import { generateRecipe, MealType } from '../recipeService';
import { calculatePersonalizedMetrics } from './metricsCalculator';
import { generateDynamicGroceryList } from './groceryListGenerator';

/**
 * Generate a daily meal plan using liked foods
 */
export function generateDynamicDailyMealPlan(
  dayNumber: number,
  metrics: NutritionMetrics,
  mealsPerDay: number,
  likedFoods: string[]
): MealPlan {
  const mealMacros = distributeMacrosAcrossMeals(metrics, mealsPerDay);
  
  // Define meal structure based on meals per day
  const mealTypes: MealType[] = 
    mealsPerDay === 3 ? ['breakfast', 'lunch', 'dinner'] :
    mealsPerDay === 4 ? ['breakfast', 'lunch', 'snack', 'dinner'] :
    mealsPerDay === 5 ? ['breakfast', 'snack', 'lunch', 'snack', 'dinner'] :
    ['breakfast', 'snack', 'lunch', 'snack', 'dinner', 'snack'];
  
  const mealTimes = 
    mealsPerDay === 3 ? ['07:00', '12:30', '19:00'] :
    mealsPerDay === 4 ? ['07:00', '12:30', '16:00', '19:30'] :
    mealsPerDay === 5 ? ['07:00', '10:00', '13:00', '16:00', '19:30'] :
    ['06:30', '09:30', '12:30', '15:30', '18:30', '21:00'];
  
  const meals: Meal[] = [];
  
  mealTypes.forEach((mealType, index) => {
    try {
      // Generate recipe using liked foods
      const recipe = generateRecipe(likedFoods, mealType);
      
      // Calculate serving size to match target macros
      const targetMacros = mealMacros[index];
      const baseCalories = recipe.macrosPerServing.calories;
      const servings = Math.max(0.5, Math.min(2.5, targetMacros.calories / baseCalories));
      
      const adjustedMacros = {
        calories: Math.round(recipe.macrosPerServing.calories * servings),
        protein: Math.round(recipe.macrosPerServing.protein * servings),
        carbs: Math.round(recipe.macrosPerServing.carbs * servings),
        fat: Math.round(recipe.macrosPerServing.fat * servings),
        fiber: Math.round((recipe.macrosPerServing.fiber || 0) * servings),
      };
      
      const recipeServing: RecipeServing = {
        recipe,
        servings: Math.round(servings * 10) / 10,
        adjustedMacros,
      };
      
      meals.push({
        id: `meal-${dayNumber}-${index + 1}`,
        mealNumber: index + 1,
        mealType,
        time: mealTimes[index],
        recipes: [recipeServing],
        totalMacros: adjustedMacros,
      });
    } catch (error) {
      // Fallback to placeholder if recipe generation fails
      console.warn(`Could not generate ${mealType} for day ${dayNumber}:`, error);
      const targetMacros = mealMacros[index];
      meals.push({
        id: `meal-${dayNumber}-${index + 1}`,
        mealNumber: index + 1,
        mealType,
        time: mealTimes[index],
        recipes: [],
        totalMacros: targetMacros,
      });
    }
  });
  
  // Calculate daily totals
  const totalDayMacros = meals.reduce((acc, meal) => ({
    calories: acc.calories + meal.totalMacros.calories,
    protein: acc.protein + meal.totalMacros.protein,
    carbs: acc.carbs + meal.totalMacros.carbs,
    fat: acc.fat + meal.totalMacros.fat,
    fiber: acc.fiber + (meal.totalMacros.fiber || 0),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
  
  return {
    day: dayNumber,
    meals,
    totalMacros: totalDayMacros,
    hydration: metrics.waterLiters,
  };
}

/**
 * Generate a complete nutrition plan using liked foods
 */
export function generateDynamicNutritionPlan(client: Client, likedFoods: string[]): NutritionPlan {
  const metrics = calculatePersonalizedMetrics(client);
  const mealsPerDay = client.mealsPerDay || 4;
  
  // Ensure we have enough liked foods
  if (likedFoods.length < 5) {
    throw new Error('Please select at least 5 foods you like to generate a personalized meal plan.');
  }
  
  // Generate 7-day meal plan
  const weeklyMealPlan: MealPlan[] = [];
  for (let day = 1; day <= 7; day++) {
    weeklyMealPlan.push(generateDynamicDailyMealPlan(day, metrics, mealsPerDay, likedFoods));
  }
  
  // Generate grocery list
  const groceryList = generateDynamicGroceryList(weeklyMealPlan);
  
  return {
    id: `nutrition-${Date.now()}`,
    clientId: client.id,
    name: `${client.primaryGoal.replace('_', ' ')} Nutrition Plan`,
    startDate: new Date().toISOString(),
    endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    metrics,
    weeklyMealPlan,
    groceryList,
    notes: `Personalized plan with ${metrics.targetCalories} kcal/day | ${metrics.proteinGrams}g protein | ${metrics.carbsGrams}g carbs | ${metrics.fatGrams}g fat`,
    createdAt: new Date().toISOString(),
  };
}
