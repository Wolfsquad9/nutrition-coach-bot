import { type Macros, type MacroTargets } from '@/types';
import { createEmptyConstraints } from '@/utils/nutritionScience';
import {
  type MealType,
  MEAL_MACRO_SPLIT,
  MAX_CONVERGENCE_ITERATIONS,
} from './constants';
import { checkMacroTolerance, calculateTotalMacros } from './nutritionCalculations';
import { sumMacros } from '@/domain/nutrition/engine';
import { generateRecipe } from './recipeGenerators';
import { generateMealRecipeText, generateFinalRecipeText } from './deterministicRecipeText';
import { adjustMealIngredients } from './mealAdjuster';
import type { FullDayMealPlanResult, MacroVariance, ToleranceCheckResult } from './types';

/**
 * Generates a complete daily meal plan with breakfast, lunch, dinner, and snack.
 * Uses allowedMeals on ingredients to filter per meal and allocates macros using the split.
 * Includes convergence loop to ensure macros are within tolerance.
 */
export function generateFullDayMealPlan(
  selectedFoods: string[],
  macroTargets: MacroTargets,
  seed?: string
): FullDayMealPlanResult {
  const mealTypes: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
  
  let dailyPlan: import('@/data/ingredientDatabase').DailyMealPlan = {
    breakfast: { ingredients: [], recipeText: '', macros: { protein: 0, carbs: 0, fat: 0, calories: 0 } },
    lunch: { ingredients: [], recipeText: '', macros: { protein: 0, carbs: 0, fat: 0, calories: 0 } },
    dinner: { ingredients: [], recipeText: '', macros: { protein: 0, carbs: 0, fat: 0, calories: 0 } },
    snack: { ingredients: [], recipeText: '', macros: { protein: 0, carbs: 0, fat: 0, calories: 0 } },
  };

  let totalMacros: Macros = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };

  // Initial generation pass
  for (const mealType of mealTypes) {
    const mealSplit = MEAL_MACRO_SPLIT[mealType];
    
    // Calculate target macros for this meal
    const mealTargetCalories = Math.round(macroTargets.calories * mealSplit);
    
    try {
      // Generate recipe for this meal using existing logic
      // The seed (if provided) makes the recipe selection vary per candidate
      const recipe = generateRecipe(selectedFoods, mealType, seed);
      
      // Scale ingredients to meet calorie target for this meal
      const scaleFactor = recipe.macrosPerServing.calories > 0 
        ? mealTargetCalories / recipe.macrosPerServing.calories 
        : 1;
      
      // Clamp scale factor to reasonable range
      const clampedScale = Math.max(0.5, Math.min(2.5, scaleFactor));
      
      // Scale the ingredients
      const scaledIngredients = recipe.selectedIngredients.map(ing => ({
        ...ing,
        typical_serving_size_g: Math.round(ing.typical_serving_size_g * clampedScale),
      }));
      
      // Recalculate macros from the scaled ingredients through the canonical
      // aggregation helper — calories are derived by the engine from the
      // summed macro grams, never scaled from a stored per-serving calorie.
      const scaledMacros = { ...calculateTotalMacros(scaledIngredients) };
      
      // Generate recipe text
      const recipeText = generateMealRecipeText(recipe.name, scaledIngredients, recipe.instructions);
      
      // Populate the meal data
      dailyPlan[mealType] = {
        ingredients: scaledIngredients,
        recipeText,
        macros: scaledMacros,
      };
      
      // Accumulate total macros
      totalMacros.calories += scaledMacros.calories;
      totalMacros.protein += scaledMacros.protein;
      totalMacros.carbs += scaledMacros.carbs;
      totalMacros.fat += scaledMacros.fat;
      totalMacros.fiber = (totalMacros.fiber || 0) + scaledMacros.fiber;
      
    } catch (error) {
      // If no suitable ingredients for this meal, create an empty placeholder
      console.warn(`Could not generate ${mealType}: ${error}`);
      dailyPlan[mealType] = {
        ingredients: [],
        recipeText: `No suitable ingredients available for ${mealType}. Please add more ${mealType}-appropriate foods.`,
        macros: { protein: 0, carbs: 0, fat: 0, calories: 0 },
      };
    }
  }

  // Convergence loop to fine-tune macros using science-based adjustments
  let iteration = 0;
  let converged = false;
  let bestResult = { plan: JSON.parse(JSON.stringify(dailyPlan)), macros: { ...totalMacros } };
  let bestVariance = Infinity;
  const accumulatedConstraints = createEmptyConstraints();

  while (iteration < MAX_CONVERGENCE_ITERATIONS && !converged) {
    const toleranceCheck = checkMacroTolerance(totalMacros, macroTargets);
    
    if (toleranceCheck.withinTolerance) {
      converged = true;
      break;
    }

    // Calculate current variance score (sum of absolute percentage variances)
    const currentVariance = 
      Math.abs(toleranceCheck.percentageVariance.calories) +
      Math.abs(toleranceCheck.percentageVariance.protein) +
      Math.abs(toleranceCheck.percentageVariance.carbs) +
      Math.abs(toleranceCheck.percentageVariance.fat);

    // Track best result
    if (currentVariance < bestVariance) {
      bestVariance = currentVariance;
      bestResult = { 
        plan: JSON.parse(JSON.stringify(dailyPlan)), 
        macros: { ...totalMacros } 
      };
    }

    // Adjust ingredients using science-based hierarchy and constraints
    // Bodyweight could be passed from client data if available
    const { adjustedPlan, adjustedMacros, constraints } = adjustMealIngredients(
      dailyPlan,
      totalMacros,
      macroTargets,
      toleranceCheck
    );

    // Accumulate constraint hits across iterations
    if (constraints.realismConstraintHit) {
      accumulatedConstraints.realismConstraintHit = true;
      accumulatedConstraints.constraintsHitDetails.push(...constraints.constraintsHitDetails);
    }

    dailyPlan = adjustedPlan;
    totalMacros = adjustedMacros;
    iteration++;
  }

  // ------------------------------------------------------------------
  // FINAL BOUNDARY ROUNDING — performed ONCE, BEFORE the final validation.
  // Each meal's macros are recomputed from its exact scaled ingredient grams
  // through the canonical engine's `sumMacros`, then rounded once at the meal
  // boundary. The day total is re-derived from those exact returned values.
  // The object validated below IS the object returned — no post-validation
  // rounding can drift a converged result out of tolerance.
  const finalizePlan = (plan: FullDayMealPlanResult['dailyPlan']): Macros => {
    for (const mealType of mealTypes) {
      const meal = plan[mealType];
      if (!meal.ingredients || meal.ingredients.length === 0) continue;

      // CANONICAL: aggregate the (exact) scaled ingredient grams through the
      // engine's sumMacros, then round ONCE at the meal boundary. The legacy
      // ingredient `calories` field is intentionally never used here.
      const recalculatedMacros = sumMacros(
        meal.ingredients.map((ing) => {
          const factor = ing.typical_serving_size_g / 100;
          return {
            protein: ing.macros.protein * factor,
            carbs: ing.macros.carbs * factor,
            fat: ing.macros.fat * factor,
            fiber: ing.macros.fiber !== undefined ? ing.macros.fiber * factor : undefined,
          };
        }),
      );

      meal.macros = {
        calories: Math.round(recalculatedMacros.calories),
        protein: Math.round(recalculatedMacros.protein),
        carbs: Math.round(recalculatedMacros.carbs),
        fat: Math.round(recalculatedMacros.fat),
        fiber: recalculatedMacros.fiber !== undefined ? Math.round(recalculatedMacros.fiber) : undefined,
      };
    }

    const roundedTotal: Macros = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
    for (const mealType of mealTypes) {
      roundedTotal.calories += plan[mealType].macros.calories;
      roundedTotal.protein += plan[mealType].macros.protein;
      roundedTotal.carbs += plan[mealType].macros.carbs;
      roundedTotal.fat += plan[mealType].macros.fat;
    }
    return roundedTotal;
  };

  // Finalize the active candidate (this is the plan that is returned).
  totalMacros = finalizePlan(dailyPlan);
  const validatedTotal = { ...totalMacros };

  // Finalize the best intermediate result identically so the fallback path
  // also returns exactly the values it was validated against.
  const bestTotal = finalizePlan(bestResult.plan);
  bestResult.macros = bestTotal;

  // Final check against the EXACT returned object (post-rounding).
  const finalCheck = checkMacroTolerance(validatedTotal, macroTargets);
  if (finalCheck.withinTolerance) {
    converged = true;
  }

  const varianceScore = (t: ToleranceCheckResult) =>
    Math.abs(t.percentageVariance.calories) +
    Math.abs(t.percentageVariance.protein) +
    Math.abs(t.percentageVariance.carbs) +
    Math.abs(t.percentageVariance.fat);

  // If not converged, keep the best intermediate result (already finalized up
  // above) — it is returned verbatim, never re-rounded afterwards.
  if (!converged) {
    const bestCheck = checkMacroTolerance(bestResult.macros, macroTargets);
    if (varianceScore(finalCheck) > varianceScore(bestCheck)) {
      dailyPlan = bestResult.plan;
      totalMacros = { ...bestResult.macros };
    }
  }

  // Regenerate all recipe texts with the FINAL adjusted quantities. Macros are
  // NOT recomputed here: they were finalized and validated above exactly.
  for (const mealType of mealTypes) {
    const meal = dailyPlan[mealType];
    if (meal.ingredients && meal.ingredients.length > 0) {
      meal.recipeText = generateFinalRecipeText(meal.ingredients, mealType);
    }
  }

  // Calculate final variance from targets
  const variance = {
    calories: totalMacros.calories - macroTargets.calories,
    protein: totalMacros.protein - macroTargets.protein,
    carbs: totalMacros.carbs - macroTargets.carbs,
    fat: totalMacros.fat - macroTargets.fat,
  };

  // Build convergence info with realism constraint tracking
  let warningMessage: string | undefined;
  if (!converged) {
    if (accumulatedConstraints.realismConstraintHit) {
      warningMessage = `Convergence limitée par contraintes physiologiques après ${iteration} itérations. Certains ingrédients ont atteint leurs limites maximales.`;
    } else {
      warningMessage = `Convergence partielle après ${iteration} itérations. Un ajustement manuel mineur peut être nécessaire.`;
    }
  }

  const convergenceInfo = {
    converged,
    iterations: iteration,
    warningMessage,
    realismConstraintHit: accumulatedConstraints.realismConstraintHit,
    constraintsHitDetails: accumulatedConstraints.constraintsHitDetails.length > 0 
      ? accumulatedConstraints.constraintsHitDetails 
      : undefined,
  };

  return {
    dailyPlan,
    totalMacros,
    targetMacros: macroTargets,
    variance,
    convergenceInfo,
  };
}

/**
 * Shuffles selected foods to create variation between days
 */
export function shuffleForDay(selectedFoods: string[], dayIndex: number): string[] {
  // Create a seeded shuffle based on day index for reproducibility with variation
  const shuffled = [...selectedFoods];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(((dayIndex + 1) * (i + 1) * 0.618) % (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}