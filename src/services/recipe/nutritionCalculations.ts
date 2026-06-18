import { calculateMacros, type IngredientData } from '@/data/ingredientDatabase';
import type { Macros, MacroTargets } from '@/types';
import { MACRO_TOLERANCES, type MealType } from './constants';
import type { ToleranceCheckResult } from './types';

/**
 * Calculates total macros of selected ingredients based on their typical serving sizes
 */
export function calculateTotalMacros(ingredients: IngredientData[]): Macros {
  return ingredients.reduce((total, ing) => {
    const macros = calculateMacros(ing, ing.typical_serving_size_g);
    return {
      calories: total.calories + macros.calories,
      protein: total.protein + macros.protein,
      carbs: total.carbs + macros.carbs,
      fat: total.fat + macros.fat,
      fiber: (total.fiber || 0) + (macros.fiber || 0),
    };
  }, { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
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
