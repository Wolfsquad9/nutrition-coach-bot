import type { Recipe, Macros, MacroTargets } from '@/types';
import type { IngredientData, DailyMealPlan } from '@/data/ingredientDatabase';
import type { MealType } from './constants';

/**
 * Generation-time eligibility constraints.
 *
 * When `allowedIngredientIds` is provided it is a HARD allow-list: no
 * ingredient outside it may enter a recipe, whatever the caller passed as
 * `selectedFoods`. The list is produced by `resolveEligibleIngredients()` in
 * `./eligibility`, the single source of truth for ingredient eligibility.
 */
export interface RecipeGenerationOptions {
  allowedIngredientIds?: readonly string[];
}

export interface GeneratedRecipe extends Recipe {
  suitableFor: MealType;
  selectedIngredients: IngredientData[];
}

export interface MacroVariance {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface ToleranceCheckResult {
  withinTolerance: boolean;
  outOfTolerance: {
    calories: boolean;
    protein: boolean;
    carbs: boolean;
    fat: boolean;
  };
  percentageVariance: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
}

export interface FullDayMealPlanResult {
  dailyPlan: DailyMealPlan;
  totalMacros: Macros;
  targetMacros: MacroTargets;
  variance: MacroVariance;
  convergenceInfo?: {
    converged: boolean;
    iterations: number;
    warningMessage?: string;
    /** True if scientific constraints prevented full macro convergence */
    realismConstraintHit: boolean;
    constraintsHitDetails?: Array<{
      ingredientId: string;
      ingredientName: string;
      maxGrams: number;
      requestedGrams: number;
    }>;
  };
}

export interface WeeklyMealPlanResult {
  days: {
    dayNumber: number;
    dayName: string;
    plan: FullDayMealPlanResult;
  }[];
  weeklyTotalMacros: Macros;
  weeklyTargetMacros: MacroTargets;
  weeklyVariance: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
}
