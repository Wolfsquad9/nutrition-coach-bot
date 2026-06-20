import { type Macros, type MacroTargets } from '@/types';
import {
  enhanceIngredientWithRole,
  calculateIngredientRole,
  MACRO_ADJUSTMENT_ORDER,
  MACRO_TO_ROLE,
  type ConvergenceConstraints,
  createEmptyConstraints,
  recordConstraintHit,
} from '@/utils/nutritionScience';
import { type MealType, MACRO_TOLERANCES, MIN_INGREDIENT_GRAMS } from './constants';
import type { ToleranceCheckResult } from './types';

/**
 * Adjusts ingredient quantities using science-based hierarchy and constraints.
 * 
 * Adjustment order (nutrition science priority):
 * 1. Protein first - preserve lean mass and satiety
 * 2. Carbohydrates second - primary performance/energy substrate  
 * 3. Fats last - energy-dense, avoid large swings
 * 
 * Respects maximum portion constraints per ingredient role.
 */
export function adjustMealIngredients(
  dailyPlan: import('@/data/ingredientDatabase').DailyMealPlan,
  totalMacros: Macros,
  targetMacros: MacroTargets,
  toleranceCheck: ToleranceCheckResult,
  bodyweightKg?: number
): { 
  adjustedPlan: import('@/data/ingredientDatabase').DailyMealPlan; 
  adjustedMacros: Macros;
  constraints: ConvergenceConstraints;
} {
  const mealTypes: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
  const adjustedPlan = JSON.parse(JSON.stringify(dailyPlan));
  const adjustedMacros = { ...totalMacros };
  const constraints = createEmptyConstraints();

  // Calculate how much adjustment is needed for each macro
  const deficits = {
    calories: targetMacros.calories - totalMacros.calories,
    protein: targetMacros.protein - totalMacros.protein,
    carbs: targetMacros.carbs - totalMacros.carbs,
    fat: targetMacros.fat - totalMacros.fat,
  };

  // Build adjustment list following science-based order: protein → carbs → fat
  const priorityAdjustments: Array<{ macro: 'protein' | 'carbs' | 'fat'; deficit: number }> = [];
  
  for (const macro of MACRO_ADJUSTMENT_ORDER) {
    if (toleranceCheck.outOfTolerance[macro]) {
      priorityAdjustments.push({ macro, deficit: deficits[macro] });
    }
  }

  for (const adjustment of priorityAdjustments) {
    const { macro, deficit } = adjustment;
    let remainingDeficit = deficit;
    const targetRole = MACRO_TO_ROLE[macro];
    
    // Find ingredients in meals that can be adjusted for this macro
    for (const mealType of mealTypes) {
      const meal = adjustedPlan[mealType];
      if (!meal.ingredients || meal.ingredients.length === 0) continue;

      for (let i = 0; i < meal.ingredients.length; i++) {
        const ing = meal.ingredients[i];
        
        // Calculate ingredient role based on its macro profile (not hardcoded by name)
        const ingRole = calculateIngredientRole(ing.macros);
        
        // Check if this ingredient is good for adjusting the target macro
        const isGoodForMacro = ingRole === targetRole;

        if (!isGoodForMacro) continue;

        // Enhance ingredient with science-based constraints
        const enhancedIng = enhanceIngredientWithRole(ing, bodyweightKg);
        
        // Calculate how much to adjust this ingredient
        const macrosPer100g = ing.macros;
        const macroPerGram = macro === 'protein' ? macrosPer100g.protein / 100 :
                             macro === 'carbs' ? macrosPer100g.carbs / 100 :
                             macrosPer100g.fat / 100;

        if (macroPerGram <= 0) continue;

        // Calculate grams needed to correct deficit
        const gramsNeeded = remainingDeficit / macroPerGram;
        const newServingRaw = ing.typical_serving_size_g + gramsNeeded;
        
        // Apply science-based constraints
        const maxGrams = enhancedIng.maxPerMealGrams;
        const minGrams = MIN_INGREDIENT_GRAMS;
        
        // Clamp to science-based bounds
        const newServing = Math.max(minGrams, Math.min(maxGrams, newServingRaw));
        
        // Track if constraint was hit
        if (newServingRaw > maxGrams) {
          recordConstraintHit(
            constraints,
            ing.id,
            ing.name,
            maxGrams,
            newServingRaw
          );
        }
        
        // Calculate actual change applied
        const servingChange = newServing - ing.typical_serving_size_g;
        
        // Only adjust if significant (>5g change)
        if (Math.abs(servingChange) < 5) continue;

        // Update ingredient serving
        meal.ingredients[i] = {
          ...ing,
          typical_serving_size_g: Math.round(newServing),
        };

        // Update meal macros
        const macroChange = {
          calories: (ing.macros.calories / 100) * servingChange,
          protein: (ing.macros.protein / 100) * servingChange,
          carbs: (ing.macros.carbs / 100) * servingChange,
          fat: (ing.macros.fat / 100) * servingChange,
        };

        meal.macros = {
          calories: Math.round(meal.macros.calories + macroChange.calories),
          protein: Math.round(meal.macros.protein + macroChange.protein),
          carbs: Math.round(meal.macros.carbs + macroChange.carbs),
          fat: Math.round(meal.macros.fat + macroChange.fat),
        };

        // Update total macros
        adjustedMacros.calories += macroChange.calories;
        adjustedMacros.protein += macroChange.protein;
        adjustedMacros.carbs += macroChange.carbs;
        adjustedMacros.fat += macroChange.fat;

        // Reduce remaining deficit by actual change (not requested)
        remainingDeficit -= (macroPerGram * servingChange);

        // Move to next macro if this one is mostly corrected
        if (Math.abs(remainingDeficit) < targetMacros[macro] * MACRO_TOLERANCES[macro]) {
          break;
        }
      }
      
      // If constraint hit and deficit still large, try secondary ingredients of same role
      if (constraints.realismConstraintHit && Math.abs(remainingDeficit) > targetMacros[macro] * MACRO_TOLERANCES[macro]) {
        // Try to find another ingredient of the same role in this meal
        for (let i = 0; i < meal.ingredients.length; i++) {
          const ing = meal.ingredients[i];
          const ingRole = calculateIngredientRole(ing.macros);
          
          // Skip if not the target role or already at limit
          if (ingRole !== targetRole) continue;
          
          const enhancedIng = enhanceIngredientWithRole(ing, bodyweightKg);
          if (ing.typical_serving_size_g >= enhancedIng.maxPerMealGrams) continue;
          
          const macroPerGram = macro === 'protein' ? ing.macros.protein / 100 :
                               macro === 'carbs' ? ing.macros.carbs / 100 :
                               ing.macros.fat / 100;
          
          if (macroPerGram <= 0) continue;
          
          const gramsNeeded = remainingDeficit / macroPerGram;
          const maxAdditional = enhancedIng.maxPerMealGrams - ing.typical_serving_size_g;
          const addGrams = Math.min(maxAdditional, Math.max(0, gramsNeeded));
          
          if (addGrams < 5) continue;
          
          const newServing = ing.typical_serving_size_g + addGrams;
          meal.ingredients[i] = { ...ing, typical_serving_size_g: Math.round(newServing) };
          
          const macroChange = {
            calories: (ing.macros.calories / 100) * addGrams,
            protein: (ing.macros.protein / 100) * addGrams,
            carbs: (ing.macros.carbs / 100) * addGrams,
            fat: (ing.macros.fat / 100) * addGrams,
          };
          
          meal.macros = {
            calories: Math.round(meal.macros.calories + macroChange.calories),
            protein: Math.round(meal.macros.protein + macroChange.protein),
            carbs: Math.round(meal.macros.carbs + macroChange.carbs),
            fat: Math.round(meal.macros.fat + macroChange.fat),
          };
          
          adjustedMacros.calories += macroChange.calories;
          adjustedMacros.protein += macroChange.protein;
          adjustedMacros.carbs += macroChange.carbs;
          adjustedMacros.fat += macroChange.fat;
          
          remainingDeficit -= (macroPerGram * addGrams);
        }
      }
    }
  }

  // Round final macros
  adjustedMacros.calories = Math.round(adjustedMacros.calories);
  adjustedMacros.protein = Math.round(adjustedMacros.protein);
  adjustedMacros.carbs = Math.round(adjustedMacros.carbs);
  adjustedMacros.fat = Math.round(adjustedMacros.fat);

  return { adjustedPlan, adjustedMacros, constraints };
}