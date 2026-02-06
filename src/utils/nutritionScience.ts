/**
 * Science-Based Nutrition Utilities
 * 
 * Implements data-driven ingredient roles and portion constraints
 * based on macronutrient energy contribution and nutrition science principles.
 */

import type { IngredientData } from '@/data/ingredientDatabase';
import { PORTION_CONSTRAINTS } from '@/domain/shared/constants';

// ============= INGREDIENT ROLE TYPES =============

export type IngredientRole = 'protein' | 'carb' | 'fat' | 'secondary';

export interface IngredientWithRole extends IngredientData {
  /** Computed role based on macronutrient energy contribution */
  role: IngredientRole;
  /** Maximum grams per meal based on science (computed or fallback) */
  maxPerMealGrams: number;
  /** Preferred serving range in grams [min, max] */
  preferredRangeGrams: [number, number];
}

// ============= ROLE CALCULATION =============

/**
 * Calculates the macronutrient role of an ingredient based on energy contribution.
 * 
 * Rules (never hardcoded by ingredient name):
 * - Protein-dominant: ≥40% of calories from protein
 * - Carb-dominant: ≥50% of calories from carbohydrates  
 * - Fat-dominant: ≥50% of calories from fat
 * - Secondary: none of the above
 */
export function calculateIngredientRole(macros: IngredientData['macros']): IngredientRole {
  const { protein, carbs, fat, calories } = macros;
  
  // Avoid division by zero
  if (calories <= 0) {
    return 'secondary';
  }
  
  // Calculate calories from each macronutrient
  // Protein: 4 kcal/g, Carbs: 4 kcal/g, Fat: 9 kcal/g
  const proteinCalories = protein * 4;
  const carbCalories = carbs * 4;
  const fatCalories = fat * 9;
  
  // Calculate percentage contribution
  const proteinPercent = proteinCalories / calories;
  const carbPercent = carbCalories / calories;
  const fatPercent = fatCalories / calories;
  
  // Apply role assignment rules in order of specificity
  if (proteinPercent >= 0.40) {
    return 'protein';
  }
  if (carbPercent >= 0.50) {
    return 'carb';
  }
  if (fatPercent >= 0.50) {
    return 'fat';
  }
  
  return 'secondary';
}

// ============= PORTION CONSTRAINTS =============

/**
 * Science-based portion limits per meal by role.
 * These are conservative, evidence-aligned defaults.
 */
interface PortionLimits {
  /** Fallback max grams when bodyweight unavailable */
  fallbackMaxGrams: number;
  /** Preferred range [min, max] in grams */
  preferredRangeGrams: [number, number];
  /** Grams of macro per kg bodyweight limit (for calculation) */
  macroPerKgLimit: number;
  /** Which macro to use for calculation */
  limitMacro: 'protein' | 'carbs' | 'fat';
}

const PORTION_LIMITS_BY_ROLE: Record<IngredientRole, PortionLimits> = {
  protein: {
    // Max protein/kg bodyweight per meal from domain constants
    fallbackMaxGrams: 225, // midpoint of 200-250g cooked equivalent
    preferredRangeGrams: [80, 180],
    macroPerKgLimit: PORTION_CONSTRAINTS.MAX_PROTEIN_PER_MEAL_G_PER_KG,
    limitMacro: 'protein',
  },
  carb: {
    // Max ~1.75g carbs/kg bodyweight per meal (midpoint of 1.5-2)
    fallbackMaxGrams: 400, // midpoint of 350-450g cooked equivalent
    preferredRangeGrams: [100, 300],
    macroPerKgLimit: 1.75,
    limitMacro: 'carbs',
  },
  fat: {
    // Max ~0.325g fat/kg bodyweight per meal (midpoint of 0.25-0.4)
    fallbackMaxGrams: 70, // midpoint of 60-80g
    preferredRangeGrams: [15, 50],
    macroPerKgLimit: 0.325,
    limitMacro: 'fat',
  },
  secondary: {
    // Secondary ingredients have no strict limits
    fallbackMaxGrams: 300,
    preferredRangeGrams: [30, 200],
    macroPerKgLimit: 0,
    limitMacro: 'protein',
  },
};

/**
 * Calculates the maximum grams per meal for an ingredient based on:
 * 1. Its computed role
 * 2. Client bodyweight (if available)
 * 3. Fallback values when bodyweight unavailable
 */
export function calculateMaxPerMealGrams(
  ingredient: IngredientData,
  role: IngredientRole,
  bodyweightKg?: number
): number {
  const limits = PORTION_LIMITS_BY_ROLE[role];
  
  // If no bodyweight, use fallback
  if (!bodyweightKg || bodyweightKg <= 0 || role === 'secondary') {
    return limits.fallbackMaxGrams;
  }
  
  // Calculate max grams based on macro content and bodyweight limit
  const macroContent = ingredient.macros[limits.limitMacro];
  
  // Avoid division by zero
  if (macroContent <= 0) {
    return limits.fallbackMaxGrams;
  }
  
  // Max macro allowed per meal = bodyweight * limit per kg
  const maxMacroPerMeal = bodyweightKg * limits.macroPerKgLimit;
  
  // Convert to grams of ingredient: (macro needed * 100) / macro per 100g
  const maxGramsFromBodyweight = (maxMacroPerMeal * 100) / macroContent;
  
  // Return the more conservative of calculated vs fallback
  return Math.min(maxGramsFromBodyweight, limits.fallbackMaxGrams);
}

/**
 * Gets the preferred serving range for an ingredient based on its role
 */
export function getPreferredRangeGrams(role: IngredientRole): [number, number] {
  return PORTION_LIMITS_BY_ROLE[role].preferredRangeGrams;
}

// ============= INGREDIENT ENHANCEMENT =============

/**
 * Enhances an ingredient with computed role and portion constraints.
 * This is deterministic - same input always produces same output.
 */
export function enhanceIngredientWithRole(
  ingredient: IngredientData,
  bodyweightKg?: number
): IngredientWithRole {
  const role = calculateIngredientRole(ingredient.macros);
  const maxPerMealGrams = calculateMaxPerMealGrams(ingredient, role, bodyweightKg);
  const preferredRangeGrams = getPreferredRangeGrams(role);
  
  return {
    ...ingredient,
    role,
    maxPerMealGrams,
    preferredRangeGrams,
  };
}

/**
 * Enhances a list of ingredients with computed roles and constraints.
 */
export function enhanceIngredientsWithRoles(
  ingredients: IngredientData[],
  bodyweightKg?: number
): IngredientWithRole[] {
  return ingredients.map(ing => enhanceIngredientWithRole(ing, bodyweightKg));
}

// ============= MACRO ADJUSTMENT HIERARCHY =============

/**
 * The science-based order for macro adjustments during convergence:
 * 1. Protein first - preserve lean mass and satiety
 * 2. Carbohydrates second - primary performance/energy substrate
 * 3. Fats last - energy-dense, avoid large swings
 */
export const MACRO_ADJUSTMENT_ORDER: Array<'protein' | 'carbs' | 'fat'> = [
  'protein',
  'carbs', 
  'fat',
];

/**
 * Maps macro type to ingredient role for adjustment targeting
 */
export const MACRO_TO_ROLE: Record<'protein' | 'carbs' | 'fat', IngredientRole> = {
  protein: 'protein',
  carbs: 'carb',
  fat: 'fat',
};

// ============= CONVERGENCE CONSTRAINT TRACKING =============

export interface ConvergenceConstraints {
  /** True if any ingredient hit its max cap during adjustment */
  realismConstraintHit: boolean;
  /** Details of which constraints were hit */
  constraintsHitDetails: Array<{
    ingredientId: string;
    ingredientName: string;
    maxGrams: number;
    requestedGrams: number;
  }>;
}

/**
 * Creates an empty constraints tracking object
 */
export function createEmptyConstraints(): ConvergenceConstraints {
  return {
    realismConstraintHit: false,
    constraintsHitDetails: [],
  };
}

/**
 * Records a constraint hit when an ingredient reaches its max
 */
export function recordConstraintHit(
  constraints: ConvergenceConstraints,
  ingredientId: string,
  ingredientName: string,
  maxGrams: number,
  requestedGrams: number
): void {
  constraints.realismConstraintHit = true;
  constraints.constraintsHitDetails.push({
    ingredientId,
    ingredientName,
    maxGrams,
    requestedGrams,
  });
}
