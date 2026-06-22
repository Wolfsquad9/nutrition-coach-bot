/**
 * Types for EnhancedIngredientManager.
 *
 * Extracted from EnhancedIngredientManager.tsx so the component itself
 * can stay focused on rendering. The plan shapes here are the data
 * contracts between the in-component plan generators and the display
 * components (DietPlanDisplay, TrainingPlanDisplay).
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

export type GeneratedTrainingPlan = {
  split: string;
  sessions: number;
  workouts: Array<{
    day: number;
    name: string;
    exercises: Array<{
      name: string;
      sets: number;
      reps: string;
    }>;
  }>;
};

export type IngredientStatus = 'blocked' | 'preferred' | 'neutral';

export type PlanType = 'full';
