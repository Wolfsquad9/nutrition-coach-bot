import { coreIngredients, type IngredientData } from '@/data/ingredientDatabase';
import { Recipe, Ingredient, Macros, MacroTargets } from '@/types';
import { createSeededRng, type Rng } from '@/utils/random';
import {
  enhanceIngredientWithRole,
  calculateIngredientRole,
  MACRO_ADJUSTMENT_ORDER,
  MACRO_TO_ROLE,
  type ConvergenceConstraints,
  createEmptyConstraints,
  recordConstraintHit,
} from '@/utils/nutritionScience';

import {
  type MealType,
  MEAL_MACRO_TARGETS,
  RECIPE_TEMPLATES,
  MEAL_MACRO_SPLIT,
  MACRO_TOLERANCES,
  MAX_CONVERGENCE_ITERATIONS,
  MIN_INGREDIENT_GRAMS,
  DAY_NAMES,
} from './recipe/constants';
import {
  calculateTotalMacros,
  determineDietTypes,
  determineAllergens,
  determineEquipment,
  checkMacroTolerance,
} from './recipe/nutritionCalculations';
import {
  getSuitableIngredients,
  getMealSuitability,
  canGenerateFullDayPlan,
} from './recipe/ingredientUtils';
import { selectBalancedIngredients } from './recipe/selectors';
import {
  generateRecipeName,
  generateInstructions,
  generateRecipe,
} from './recipe/recipeGenerators';
import type {
  GeneratedRecipe,
  FullDayMealPlanResult,
  WeeklyMealPlanResult,
  ToleranceCheckResult,
} from './recipe/types';

export type { MealType };
export type { GeneratedRecipe, FullDayMealPlanResult, WeeklyMealPlanResult };
export {
  calculateTotalMacros,
  determineDietTypes,
  determineAllergens,
  determineEquipment,
  checkMacroTolerance,
  getSuitableIngredients,
  getMealSuitability,
  canGenerateFullDayPlan,
  selectBalancedIngredients,
  generateRecipeName,
  generateInstructions,
  generateRecipe,
};

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
function adjustMealIngredients(
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

/**
 * Generates a deterministic recipe name based on main ingredients
 */
function generateDeterministicRecipeName(
  ingredients: IngredientData[],
  mealType: MealType
): string {
  const protein = ingredients.find(i => i.category === 'protein');
  const carb = ingredients.find(i => i.category === 'carbohydrate');
  const vegetable = ingredients.find(i => i.category === 'vegetable');
  const fruit = ingredients.find(i => i.category === 'fruit');

  const proteinName = protein?.name.split(' ')[0] || '';
  const carbName = carb?.name.split(' ')[0] || '';
  const vegName = vegetable?.name.split(' ')[0] || '';
  const fruitName = fruit?.name.split(' ')[0] || '';

  switch (mealType) {
    case 'breakfast':
      if (proteinName && carbName) return `${proteinName} Power Bowl with ${carbName}`;
      if (proteinName && fruitName) return `${proteinName} & ${fruitName} Energizer`;
      if (proteinName) return `High-Protein ${proteinName} Breakfast`;
      return 'Balanced Breakfast';
    case 'lunch':
      if (proteinName && vegName) return `Grilled ${proteinName} with ${vegName}`;
      if (proteinName && carbName) return `${proteinName} & ${carbName} Plate`;
      if (proteinName) return `${proteinName} Lunch`;
      return 'Nutritious Lunch';
    case 'dinner':
      if (proteinName && vegName) return `Roasted ${proteinName} with ${vegName}`;
      if (proteinName && carbName) return `Savory ${proteinName} and ${carbName}`;
      if (proteinName) return `${proteinName} Dinner`;
      return 'Complete Dinner';
    case 'snack':
      if (proteinName && fruitName) return `${proteinName} & ${fruitName} Snack`;
      if (proteinName) return `High-Protein Snack`;
      return 'Energy Snack';
    default:
      return 'Balanced Meal';
  }
}

/**
 * Generates deterministic cooking instructions based on ingredients and meal type
 */
function generateDeterministicInstructions(
  ingredients: IngredientData[],
  mealType: MealType
): string[] {
  const protein = ingredients.find(i => i.category === 'protein');
  const carb = ingredients.find(i => i.category === 'carbohydrate');
  const vegetables = ingredients.filter(i => i.category === 'vegetable');
  const fats = ingredients.filter(i => i.category === 'fat');
  const fruits = ingredients.filter(i => i.category === 'fruit');
  
  const instructions: string[] = [];

  if (mealType === 'breakfast') {
    instructions.push('Gather and weigh all ingredients according to the specified quantities.');
    if (carb) {
      const carbName = carb.name.toLowerCase();
      if (carbName.includes('oat') || carbName.includes('avoine')) {
        instructions.push(`Cook ${carb.typical_serving_size_g}g of ${carbName} in water or milk for 5 minutes.`);
      } else {
        instructions.push(`Prepare ${carb.typical_serving_size_g}g of ${carbName} according to package directions.`);
      }
    }
    if (protein) {
      const proteinName = protein.name.toLowerCase();
      if (proteinName.includes('egg') || proteinName.includes('œuf')) {
        instructions.push(`Cook ${protein.typical_serving_size_g}g of eggs (scrambled or poached) over medium heat.`);
      } else if (proteinName.includes('yogurt') || proteinName.includes('yaourt')) {
        instructions.push(`Add ${protein.typical_serving_size_g}g of ${proteinName} to a bowl.`);
      } else {
        instructions.push(`Prepare ${protein.typical_serving_size_g}g of ${proteinName}.`);
      }
    }
    if (fruits.length > 0) {
      const fruitList = fruits.map(f => `${f.typical_serving_size_g}g of ${f.name.toLowerCase()}`).join(', ');
      instructions.push(`Wash and cut the fruits: ${fruitList}.`);
    }
    if (fats.length > 0) {
      const fatList = fats.map(f => `${f.typical_serving_size_g}g of ${f.name.toLowerCase()}`).join(', ');
      instructions.push(`Add the fats: ${fatList}.`);
    }
    instructions.push('Assemble all elements in a bowl and serve immediately.');
  } else if (mealType === 'snack') {
    instructions.push('Weigh ingredients according to the specified quantities.');
    if (protein) {
      instructions.push(`Prepare ${protein.typical_serving_size_g}g of ${protein.name.toLowerCase()}.`);
    }
    if (fruits.length > 0 || fats.length > 0) {
      const items = [...fruits, ...fats].map(i => `${i.typical_serving_size_g}g of ${i.name.toLowerCase()}`);
      instructions.push(`Add: ${items.join(', ')}.`);
    }
    instructions.push('Mix and consume fresh or refrigerate for later.');
  } else {
    // Lunch or Dinner
    instructions.push('Weigh and prepare all ingredients before starting to cook.');
    if (vegetables.length > 0) {
      const vegList = vegetables.map(v => v.name.toLowerCase()).join(', ');
      instructions.push(`Wash and cut the vegetables (${vegList}) into uniform-sized pieces.`);
    }
    if (protein) {
      const proteinName = protein.name.toLowerCase();
      instructions.push(`Season ${protein.typical_serving_size_g}g of ${proteinName} with salt, pepper and spices of choice.`);
      if (proteinName.includes('chicken') || proteinName.includes('poulet') || 
          proteinName.includes('turkey') || proteinName.includes('dinde')) {
        instructions.push(`Cook the ${proteinName} in a pan over medium-high heat, 6-8 minutes per side until fully cooked.`);
      } else if (proteinName.includes('salmon') || proteinName.includes('saumon') ||
                 proteinName.includes('fish') || proteinName.includes('poisson')) {
        instructions.push(`Cook the ${proteinName} in a pan or oven, 4-5 minutes per side.`);
      } else {
        instructions.push(`Cook the ${proteinName} over medium heat to desired temperature.`);
      }
    }
    if (carb) {
      const carbName = carb.name.toLowerCase();
      instructions.push(`Meanwhile, cook ${carb.typical_serving_size_g}g of ${carbName} according to package directions.`);
    }
    if (vegetables.length > 0) {
      const totalVegGrams = vegetables.reduce((sum, v) => sum + v.typical_serving_size_g, 0);
      instructions.push(`Sauté the vegetables (${totalVegGrams}g total) in a little oil for 5-7 minutes until tender.`);
    }
    if (fats.length > 0) {
      const fatItem = fats[0];
      instructions.push(`Finish with ${fatItem.typical_serving_size_g}g of ${fatItem.name.toLowerCase()} for seasoning.`);
    }
    instructions.push('Plate the protein with sides and serve hot.');
  }

  // Limit to 3-6 steps
  return instructions.slice(0, 6);
}

/**
 * Generates complete, high-quality recipe text for a meal with final ingredient quantities.
 * This should be called ONCE after macro convergence is complete.
 */
function generateFinalRecipeText(
  ingredients: IngredientData[],
  mealType: MealType
): string {
  if (ingredients.length === 0) {
    return `No ingredients available for this meal. Please select more suitable foods.`;
  }
  
  // Generate deterministic recipe name
  const recipeName = generateDeterministicRecipeName(ingredients, mealType);
  
  // Build ingredient list with quantities
  const ingredientList = ingredients
    .map(ing => `• ${ing.name}: ${ing.typical_serving_size_g}g`)
    .join('\n');
  
  // Generate deterministic instructions with actual quantities
  const instructions = generateDeterministicInstructions(ingredients, mealType);
  const instructionList = instructions
    .map((inst, idx) => `${idx + 1}. ${inst}`)
    .join('\n');
  
  // Calculate and display meal macros summary
  const mealMacros = ingredients.reduce((acc, ing) => {
    const factor = ing.typical_serving_size_g / 100;
    return {
      calories: acc.calories + Math.round(ing.macros.calories * factor),
      protein: acc.protein + Math.round(ing.macros.protein * factor),
      carbs: acc.carbs + Math.round(ing.macros.carbs * factor),
      fat: acc.fat + Math.round(ing.macros.fat * factor),
    };
  }, { calories: 0, protein: 0, carbs: 0, fat: 0 });
  
  const macroSummary = `Macros: ${mealMacros.calories} kcal | P: ${mealMacros.protein}g | C: ${mealMacros.carbs}g | F: ${mealMacros.fat}g`;
  
  return `**${recipeName}**\n\n${macroSummary}\n\n**Ingredients:**\n${ingredientList}\n\n**Preparation:**\n${instructionList}`;
}

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
 * Generates formatted recipe text for a meal
 */
function generateMealRecipeText(
  recipeName: string,
  ingredients: IngredientData[],
  instructions: string[]
): string {
  const ingredientList = ingredients
    .map(ing => `• ${ing.name}: ${ing.typical_serving_size_g}g`)
    .join('\n');
  
  const instructionList = instructions
    .map((inst, idx) => `${idx + 1}. ${inst}`)
    .join('\n');
  
  return `**${recipeName}**\n\nIngredients:\n${ingredientList}\n\nInstructions:\n${instructionList}`;
}

/**
 * Shuffles selected foods to create variation between days
 */
function shuffleForDay(selectedFoods: string[], dayIndex: number): string[] {
  // Create a seeded shuffle based on day index for reproducibility with variation
  const shuffled = [...selectedFoods];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(((dayIndex + 1) * (i + 1) * 0.618) % (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Generates a complete weekly meal plan with 7 days of meals.
 * Each day uses slightly varied ingredient combinations to avoid repetition.
 */
export function generateWeeklyMealPlan(
  selectedFoods: string[],
  macroTargets: MacroTargets
): WeeklyMealPlanResult {
  const days: WeeklyMealPlanResult['days'] = [];
  
  const weeklyTotalMacros: Macros = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
  
  for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
    // Shuffle ingredients differently for each day to create variation
    const shuffledFoods = shuffleForDay(selectedFoods, dayIndex);
    
    // Generate the daily plan with shuffled ingredients
    const dailyResult = generateFullDayMealPlan(shuffledFoods, macroTargets);
    
    days.push({
      dayNumber: dayIndex + 1,
      dayName: DAY_NAMES[dayIndex],
      plan: dailyResult,
    });
    
    // Accumulate weekly totals
    weeklyTotalMacros.calories += dailyResult.totalMacros.calories;
    weeklyTotalMacros.protein += dailyResult.totalMacros.protein;
    weeklyTotalMacros.carbs += dailyResult.totalMacros.carbs;
    weeklyTotalMacros.fat += dailyResult.totalMacros.fat;
    weeklyTotalMacros.fiber = (weeklyTotalMacros.fiber || 0) + (dailyResult.totalMacros.fiber || 0);
  }
  
  // Calculate weekly targets and variance
  const weeklyTargetMacros: MacroTargets = {
    calories: macroTargets.calories * 7,
    protein: macroTargets.protein * 7,
    carbs: macroTargets.carbs * 7,
    fat: macroTargets.fat * 7,
  };
  
  const weeklyVariance = {
    calories: weeklyTotalMacros.calories - weeklyTargetMacros.calories,
    protein: weeklyTotalMacros.protein - weeklyTargetMacros.protein,
    carbs: weeklyTotalMacros.carbs - weeklyTargetMacros.carbs,
    fat: weeklyTotalMacros.fat - weeklyTargetMacros.fat,
  };
  
  return {
    days,
    weeklyTotalMacros,
    weeklyTargetMacros,
    weeklyVariance,
  };
}
