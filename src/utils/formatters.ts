/**
 * Formatting utilities for nutrition and macro display
 */

/**
 * Format calories as integer
 */
export function formatCalories(calories: number): string {
  return Math.round(calories).toString();
}

/**
 * Format macro value to 1 decimal place
 */
export function formatMacro(value: number): string {
  return value.toFixed(1);
}

/**
 * Format percentage to 1 decimal place
 */
export function formatPercentage(value: number): string {
  return value.toFixed(1);
}

/**
 * Format weight with units
 */
export function formatWeight(grams: number): string {
  if (grams >= 1000) {
    return `${(grams / 1000).toFixed(1)} kg`;
  }
  return `${Math.round(grams)} g`;
}

/**
 * Scale macros by serving size
 */
export function scaleMacrosByServing(
  macrosPer100g: { protein: number; carbs: number; fat: number; kcal: number },
  servingSizeG: number
): { protein: number; carbs: number; fat: number; calories: number } {
  const factor = servingSizeG / 100;
  return {
    protein: macrosPer100g.protein * factor,
    carbs: macrosPer100g.carbs * factor,
    fat: macrosPer100g.fat * factor,
    calories: macrosPer100g.kcal * factor,
  };
}
