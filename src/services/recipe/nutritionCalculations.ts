import { type IngredientData, type AllergenTag } from '@/data/ingredientDatabase';
import type { Macros, MacroTargets } from '@/types';
import { sumMacros, caloriesFromMacros } from '@/domain/nutrition/engine';
import { MACRO_TOLERANCES, type MealType } from './constants';
import type { ToleranceCheckResult } from './types';
import { isIngredientCompatibleWithDiet } from './eligibility';

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
 * Allergen report order — stable so UI badges and snapshots stay stable as the
 * library grows. Derived purely from each ingredient's structured `allergens`
 * metadata (no hardcoded ingredient-ID lists).
 */
const ALLERGEN_REPORT_ORDER: readonly AllergenTag[] = [
  'eggs',
  'dairy',
  'nuts',
  'fish',
  'soy',
  'gluten',
  'sesame',
  'shellfish',
];

/**
 * Determines diet types based on each ingredient's structured `dietTags`.
 *
 * Replaces the previous hardcoded ingredient-ID lists, which silently
 * mislabelled meals as soon as a new ingredient was added. The diet nesting
 * rule lives in exactly one place (`isIngredientCompatibleWithDiet`).
 */
export function determineDietTypes(ingredients: IngredientData[]): string[] {
  const dietTypes: string[] = [];

  const isVegan = ingredients.every((i) => isIngredientCompatibleWithDiet(i, 'vegan'));
  const isVegetarian = ingredients.every((i) => isIngredientCompatibleWithDiet(i, 'vegetarian'));

  if (isVegan) {
    dietTypes.push('vegan');
  } else if (isVegetarian) {
    dietTypes.push('vegetarian');
  }

  // "Gluten-free" is derived from the allergen metadata, so an ingredient that
  // carries gluten can never be presented as gluten-free.
  const isGlutenFree = !ingredients.some((i) => (i.allergens ?? []).includes('gluten'));
  if (isGlutenFree) dietTypes.push('gluten-free');

  return dietTypes;
}

/**
 * Determines allergens based on each ingredient's structured `allergens`
 * metadata (replaces the previous hardcoded ingredient-ID lists).
 */
export function determineAllergens(ingredients: IngredientData[]): string[] {
  const present = new Set<AllergenTag>();
  for (const ingredient of ingredients) {
    for (const tag of ingredient.allergens ?? []) present.add(tag);
  }
  return ALLERGEN_REPORT_ORDER.filter((tag) => present.has(tag));
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
