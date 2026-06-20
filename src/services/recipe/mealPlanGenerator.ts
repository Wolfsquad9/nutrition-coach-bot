import { type Macros, type MacroTargets } from '@/types';
import { createEmptyConstraints } from '@/utils/nutritionScience';
import {
  type MealType,
  MEAL_MACRO_SPLIT,
  MAX_CONVERGENCE_ITERATIONS,
} from './constants';
import { checkMacroTolerance } from './nutritionCalculations';
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
  macroTargets: MacroTargets
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
      const recipe = generateRecipe(selectedFoods, mealType);
      
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
      
      // Recalculate macros with scaled ingredients
      const scaledMacros = {
        calories: Math.round(recipe.macrosPerServing.calories * clampedScale),
        protein: Math.round(recipe.macrosPerServing.protein * clampedScale),
        carbs: Math.round(recipe.macrosPerServing.carbs * clampedScale),
        fat: Math.round(recipe.macrosPerServing.fat * clampedScale),
        fiber: Math.round((recipe.macrosPerServing.fiber || 0) * clampedScale),
      };
      
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

  // Final check after loop
  const finalCheck = checkMacroTolerance(totalMacros, macroTargets);
  if (finalCheck.withinTolerance) {
    converged = true;
  }

  // If not converged, use best result
  if (!converged) {
    const finalVariance = 
      Math.abs(finalCheck.percentageVariance.calories) +
      Math.abs(finalCheck.percentageVariance.protein) +
      Math.abs(finalCheck.percentageVariance.carbs) +
      Math.abs(finalCheck.percentageVariance.fat);

    if (finalVariance > bestVariance) {
      dailyPlan = bestResult.plan;
      totalMacros = bestResult.macros;
    }
  }

  // FINAL STEP: Regenerate all recipe texts with final adjusted quantities
  // This happens ONCE after convergence completes (not during iterations)
  for (const mealType of mealTypes) {
    const meal = dailyPlan[mealType];
    if (meal.ingredients && meal.ingredients.length > 0) {
      meal.recipeText = generateFinalRecipeText(meal.ingredients, mealType);
      
      // Also recalculate and update the meal macros to ensure accuracy
      const recalculatedMacros = meal.ingredients.reduce((acc, ing) => {
        const factor = ing.typical_serving_size_g / 100;
        return {
          calories: acc.calories + Math.round(ing.macros.calories * factor),
          protein: acc.protein + Math.round(ing.macros.protein * factor),
          carbs: acc.carbs + Math.round(ing.macros.carbs * factor),
          fat: acc.fat + Math.round(ing.macros.fat * factor),
        };
      }, { calories: 0, protein: 0, carbs: 0, fat: 0 });
      
      meal.macros = recalculatedMacros;
    }
  }
  
  // Recalculate total macros after final adjustments
  totalMacros = {
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    fiber: 0,
  };
  for (const mealType of mealTypes) {
    totalMacros.calories += dailyPlan[mealType].macros.calories;
    totalMacros.protein += dailyPlan[mealType].macros.protein;
    totalMacros.carbs += dailyPlan[mealType].macros.carbs;
    totalMacros.fat += dailyPlan[mealType].macros.fat;
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