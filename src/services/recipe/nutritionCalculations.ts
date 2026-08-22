import { type IngredientData } from '@/data/ingredientDatabase';
import type { Macros, MacroTargets } from '@/types';
import { sumMacros, caloriesFromMacros } from '@/domain/nutrition/engine';
import { MACRO_TOLERANCES, type MealType } from './constants';
import type { ToleranceCheckResult } from './types';

/**
 * Calculates total macros of selected ingredients based on their typical
 * serving sizes.
 *
 * CANONICAL aggregation: each ingredient is scaled exactly to its typical
 * serving (no intermediate rounding) and the portions are summed through the
 * engine's `sumMacros` so the recipe calorie total is exactly the canonical
 * energy of the summed macro grams. The legacy per-ingredient `calories`
 * source field is never used here.
 */
export function calculateTotalMacros(ingredients: IngredientData[]): Macros {
  const portions = ingredients.map((ing) => {
    const factor = ing.typical_serving_size_g / 100;
    return {
      protein: ing.macros.protein * factor,
      carbs: ing.macros.carbs * factor,
      fat: ing.macros.fat * factor,
      fiber: ing.macros.fiber !== undefined ? ing.macros.fiber * factor : undefined,
    };
  });

  const total = sumMacros(portions);

  return {
    calories: total.calories,
    protein: total.protein,
    carbs: total.carbs,
    fat: total.fat,
    fiber: total.fiber,
  };
}

/** Canonical energy (kcal) of an ingredient's macro grams for one 100g unit. */
export function macroCaloriesPer100g(ingredient: IngredientData): number {
  return caloriesFromMacros({
    protein: ingredient.macros.protein,
    carbs: ingredient.macros.carbs,
    fat: ingredient.macros.fat,
  });
}

/**
 * Checks if macros are within acceptable tolerance of targets
 */
export function checkMacroTolerance(
  actual: Macros,
  target: MacroTargets
): ToleranceCheckResult {
  const calcPercentVariance = (actualVal: number, targetVal: number) => 
    targetVal > 0 ? (actualVal - targetVal) / targetVal : 0;

  const percentageVariance = {
    calories: calcPercentVariance(actual.calories, target.calories),
    protein: calcPercentVariance(actual.protein, target.protein),
    carbs: calcPercentVariance(actual.carbs, target.carbs),
    fat: calcPercentVariance(actual.fat, target.fat),
  };

  const outOfTolerance = {
    calories: Math.abs(percentageVariance.calories) > MACRO_TOLERANCES.calories,
    protein: Math.abs(percentageVariance.protein) > MACRO_TOLERANCES.protein,
    carbs: Math.abs(percentageVariance.carbs) > MACRO_TOLERANCES.carbs,
    fat: Math.abs(percentageVariance.fat) > MACRO_TOLERANCES.fat,
  };

  const withinTolerance = !outOfTolerance.calories && !outOfTolerance.protein && 
                          !outOfTolerance.carbs && !outOfTolerance.fat;

  return { withinTolerance, outOfTolerance, percentageVariance };
}

/**
 * Determines diet types based on ingredient profile
 */
export function determineDietTypes(ingredients: IngredientData[]): string[] {
  const dietTypes: string[] = [];
  const hasAnimalProtein = ingredients.some(i => 
    ['chicken-breast', 'salmon', 'turkey-breast', 'tuna'].includes(i.id)
  );
  const hasDairy = ingredients.some(i => 
    ['greek-yogurt', 'cottage-cheese'].includes(i.id)
  );
  const hasEggs = ingredients.some(i => i.id === 'eggs');
  
  if (!hasAnimalProtein && !hasDairy && !hasEggs) {
    dietTypes.push('vegan');
  } else if (!hasAnimalProtein) {
    dietTypes.push('vegetarian');
  }
  
  const isGlutenFree = !ingredients.some(i => 
    ['whole-wheat-pasta', 'whole-wheat-bread', 'barley', 'oats'].includes(i.id)
  );
  if (isGlutenFree) dietTypes.push('gluten-free');
  
  return dietTypes;
}

/**
 * Determines allergens based on ingredient selection
 */
export function determineAllergens(ingredients: IngredientData[]): string[] {
  const allergens: string[] = [];
  
  if (ingredients.some(i => i.id === 'eggs')) allergens.push('eggs');
  if (ingredients.some(i => ['greek-yogurt', 'cottage-cheese'].includes(i.id))) allergens.push('dairy');
  if (ingredients.some(i => ['almonds', 'walnuts', 'peanut-butter'].includes(i.id))) allergens.push('nuts');
  if (ingredients.some(i => ['salmon', 'tuna'].includes(i.id))) allergens.push('fish');
  if (ingredients.some(i => i.id === 'tofu')) allergens.push('soy');
  if (ingredients.some(i => ['whole-wheat-pasta', 'whole-wheat-bread', 'barley'].includes(i.id))) allergens.push('gluten');
  
  return allergens;
}

/**
 * Determines cooking equipment needed for a meal type
 */
export function determineEquipment(mealType: MealType): string[] {
  switch (mealType) {
    case 'breakfast':
      return ['stove', 'pan', 'bowl'];
    case 'lunch':
    case 'dinner':
      return ['stove', 'pan', 'cutting board', 'knife'];
    case 'snack':
      return ['bowl'];
    default:
      return ['bowl'];
  }
}
