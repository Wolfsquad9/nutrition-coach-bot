import type { Recipe, Macros, MacroTargets } from '@/types';
import type { IngredientData, DailyMealPlan } from '@/data/ingredientDatabase';
import type { MealType } from './constants';
import type { DietType } from './eligibility';

/**
 * Generation-time eligibility constraints.
 *
 * When `allowedIngredientIds` is provided it is a HARD allow-list: no
 * ingredient outside it may enter a recipe, whatever the caller passed as
 * `selectedFoods`. The list is produced by `resolveEligibleIngredients()` in
 * `./eligibility`, the single source of truth for ingredient eligibility.
 *
 * `archetypeGeneration` is the Phase 3C opt-in. When it is `false` or omitted
 * (the default) generation runs the LEGACY balanced-selection path and its
 * output is byte-for-byte what it has always been. When `true`, the archetype
 * catalogue in `./archetypes` selects the meal's structure instead of the
 * fixed protein+carb+veg+fruit+fat+misc heuristic. Either way the pool is
 * `allowedIngredientIds ∩ meal-slot eligibility`, resolved by
 * `getSuitableIngredients`, so enabling archetypes cannot widen eligibility.
 */
export interface RecipeGenerationOptions {
  allowedIngredientIds?: readonly string[];
  /**
   * Opt in to archetype-structured generation. Default `false` = legacy path.
   * @see ./archetypes for the catalogue and its skip rules.
   */
  archetypeGeneration?: boolean;
  /**
   * Client diet, used only to filter archetypes. Required for a meaningful
   * archetype path; when absent every diet-compatible archetype is eligible.
   * Note this is a *client-level* filter applied downstream of eligibility —
   * it never re-interprets ingredient `dietTags` itself.
   */
  dietType?: DietType | null;
}

export interface GeneratedRecipe extends Recipe {
  suitableFor: MealType;
  selectedIngredients: IngredientData[];
  /**
   * Id of the archetype that produced this recipe, or `undefined` on the
   * legacy path. Present so structural diversity can be scored without
   * inferring structure back from recipe text.
   */
  archetypeId?: string;
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
