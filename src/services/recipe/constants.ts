import type { MealTimeType } from '@/data/ingredientDatabase';

export type MealType = MealTimeType;

// Target macros per meal type (approximate)
export const MEAL_MACRO_TARGETS: Record<MealType, { calorieRatio: number; proteinRatio: number }> = {
  breakfast: { calorieRatio: 0.25, proteinRatio: 0.25 },
  lunch: { calorieRatio: 0.35, proteinRatio: 0.35 },
  dinner: { calorieRatio: 0.30, proteinRatio: 0.30 },
  snack: { calorieRatio: 0.10, proteinRatio: 0.10 },
};

// Recipe name templates by meal type
export const RECIPE_TEMPLATES: Record<MealType, string[]> = {
  breakfast: [
    'Power {protein} Bowl',
    'Energizing {protein} with {carb}',
    '{protein} & {fruit} Morning Boost',
    'Healthy {carb} Delight',
  ],
  lunch: [
    '{protein} & {carb} Power Plate',
    'Grilled {protein} with {vegetable}',
    'Mediterranean {protein} Bowl',
    '{protein} Salad with {vegetable}',
  ],
  dinner: [
    'Savory {protein} with {carb}',
    'Roasted {protein} & {vegetable}',
    '{protein} Stir-fry with {vegetable}',
    'Herb-Crusted {protein} Dinner',
  ],
  snack: [
    '{protein} & {fruit} Bites',
    'Quick {protein} Snack',
    '{fat} Energy Mix',
    'Protein-Packed {protein}',
  ],
};

// Macro allocation per meal (must sum to 1.0)
export const MEAL_MACRO_SPLIT: Record<MealType, number> = {
  breakfast: 0.25,
  lunch: 0.35,
  dinner: 0.30,
  snack: 0.10,
};

// Macro tolerance thresholds (percentage)
export const MACRO_TOLERANCES = {
  calories: 0.05, // ±5%
  protein: 0.05,  // ±5%
  carbs: 0.08,    // ±8%
  fat: 0.08,      // ±8%
};

// Maximum convergence iterations
export const MAX_CONVERGENCE_ITERATIONS = 5;

// Minimum ingredient serving size (grams) - never go below this
export const MIN_INGREDIENT_GRAMS = 10;

export const DAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];