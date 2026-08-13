/**
 * Types for EnhancedIngredientManager.
 *
 * Extracted from EnhancedIngredientManager.tsx so the component itself
 * can stay focused on rendering. The only plan shape here is the nutrition
 * diet-plan contract used by the ingredient/recipe flow — the Ingredients
 * tab has no training-plan responsibility.
 */

export type GeneratedDietPlan = {
  totalCalories: number;
  macros: { protein: number; carbs: number; fat: number };
  meals: Array<{
    day: number;
    meals: Array<{
      name: string;
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
    }>;
  }>;
  shoppingList?: unknown[];
};

export type IngredientStatus = 'blocked' | 'preferred' | 'neutral';
