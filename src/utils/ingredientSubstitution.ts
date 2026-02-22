/**
 * Ingredient Substitution Engine
 * Handles dynamic ingredient replacement based on macro matching and client restrictions
 */

import { IngredientData, coreIngredients } from '@/data/ingredientDatabase';
import { Recipe, Ingredient } from '@/types';

export interface SubstitutionRule {
  originalId: string;
  substituteId: string;
  conversionRatio: number; // Amount multiplier for substitution
  macroSimilarity: number; // 0-1 score of macro similarity
}

export interface ClientIngredientRestrictions {
  clientId: string;
  clientName: string;
  blockedIngredients: string[];
  preferredIngredients: string[];
  substitutionRules: {
    [ingredientId: string]: string[];
  };
}

/**
 * Calculate macro similarity score between two ingredients
 */
function calculateMacroSimilarity(ing1: IngredientData, ing2: IngredientData): number {
  const proteinDiff = Math.abs(ing1.macros.protein - ing2.macros.protein);
  const carbsDiff = Math.abs(ing1.macros.carbs - ing2.macros.carbs);
  const fatDiff = Math.abs(ing1.macros.fat - ing2.macros.fat);
  const caloriesDiff = Math.abs(ing1.macros.calories - ing2.macros.calories);
  
  // Weighted scoring (protein most important for substitution)
  const proteinScore = Math.max(0, 1 - proteinDiff / 30) * 0.4;
  const carbsScore = Math.max(0, 1 - carbsDiff / 50) * 0.2;
  const fatScore = Math.max(0, 1 - fatDiff / 30) * 0.2;
  const caloriesScore = Math.max(0, 1 - caloriesDiff / 200) * 0.2;
  
  return proteinScore + carbsScore + fatScore + caloriesScore;
}

/**
 * Find best substitute for a blocked ingredient
 */
export function findBestSubstitute(
  blockedIngredientId: string,
  restrictions: ClientIngredientRestrictions,
  preserveMacros: boolean = true
): SubstitutionRule | null {
  const blocked = coreIngredients.find(ing => ing.id === blockedIngredientId);
  if (!blocked) return null;
  
  // Check if there's a predefined substitution rule
  if (restrictions.substitutionRules[blockedIngredientId]) {
    const preferredSubId = restrictions.substitutionRules[blockedIngredientId][0];
    const substitute = coreIngredients.find(ing => ing.id === preferredSubId);
    if (substitute && !restrictions.blockedIngredients.includes(preferredSubId)) {
      const ratio = blocked.macros.calories / substitute.macros.calories;
      return {
        originalId: blockedIngredientId,
        substituteId: preferredSubId,
        conversionRatio: ratio,
        macroSimilarity: calculateMacroSimilarity(blocked, substitute)
      };
    }
  }
  
  // Find automatic substitute based on category and macros
  let candidates = coreIngredients.filter(ing => 
    ing.id !== blockedIngredientId &&
    !restrictions.blockedIngredients.includes(ing.id) &&
    ing.category === blocked.category
  );
  
  // If no same-category ingredients, expand search
  if (candidates.length === 0) {
    candidates = coreIngredients.filter(ing => 
      ing.id !== blockedIngredientId &&
      !restrictions.blockedIngredients.includes(ing.id)
    );
  }
  
  // Prioritize preferred ingredients
  const preferredCandidates = candidates.filter(ing => 
    restrictions.preferredIngredients.includes(ing.id)
  );
  
  if (preferredCandidates.length > 0) {
    candidates = preferredCandidates;
  }
  
  // Sort by macro similarity
  const scoredCandidates = candidates.map(candidate => ({
    ingredient: candidate,
    similarity: preserveMacros ? calculateMacroSimilarity(blocked, candidate) : 0.5,
    tagOverlap: blocked.tags.filter(tag => candidate.tags.includes(tag)).length / blocked.tags.length
  }));
  
  scoredCandidates.sort((a, b) => {
    // Prioritize macro similarity, then tag overlap
    const scoreA = a.similarity * 0.7 + a.tagOverlap * 0.3;
    const scoreB = b.similarity * 0.7 + b.tagOverlap * 0.3;
    return scoreB - scoreA;
  });
  
  if (scoredCandidates.length === 0) return null;
  
  const bestMatch = scoredCandidates[0];
  const ratio = preserveMacros ? 
    blocked.macros.calories / bestMatch.ingredient.macros.calories : 1;
  
  return {
    originalId: blockedIngredientId,
    substituteId: bestMatch.ingredient.id,
    conversionRatio: ratio,
    macroSimilarity: bestMatch.similarity
  };
}

/**
 * Adapt a recipe based on client restrictions
 */
export function adaptRecipe(
  recipe: Recipe,
  restrictions: ClientIngredientRestrictions,
  preserveMacros: boolean = true
): { 
  adaptedRecipe: Recipe; 
  substitutions: SubstitutionRule[];
  macroAdjustment: number;
} {
  const substitutions: SubstitutionRule[] = [];
  const adaptedIngredients: Ingredient[] = [];
  let totalMacroAdjustment = 0;
  
  for (const ingredient of recipe.ingredients) {
    // Check if ingredient is blocked
    const ingredientData = coreIngredients.find(ing => 
      ing.name.toLowerCase() === ingredient.name.toLowerCase()
    );
    
    if (ingredientData && restrictions.blockedIngredients.includes(ingredientData.id)) {
      // Find substitute
      const substitution = findBestSubstitute(ingredientData.id, restrictions, preserveMacros);
      
      if (substitution) {
        const substituteData = coreIngredients.find(ing => ing.id === substitution.substituteId);
        if (substituteData) {
          substitutions.push(substitution);
          adaptedIngredients.push({
            ...ingredient,
            name: substituteData.name,
            amount: Math.round(ingredient.amount * substitution.conversionRatio * 10) / 10
          });
          totalMacroAdjustment += Math.abs(1 - substitution.macroSimilarity);
          continue;
        }
      }
      
      // If no substitute found, skip ingredient (may affect recipe)
      console.warn(`No substitute found for blocked ingredient: ${ingredient.name}`);
      continue;
    }
    
    // Keep original ingredient
    adaptedIngredients.push(ingredient);
  }
  
  // Recalculate macros for adapted recipe
  const adaptedMacros = recalculateRecipeMacros(adaptedIngredients);
  
  const adaptedRecipe: Recipe = {
    ...recipe,
    ingredients: adaptedIngredients,
    macrosPerServing: adaptedMacros
  };
  
  return {
    adaptedRecipe,
    substitutions,
    macroAdjustment: totalMacroAdjustment / Math.max(1, substitutions.length)
  };
}

/**
 * Recalculate recipe macros based on ingredients
 */
function recalculateRecipeMacros(ingredients: Ingredient[]) {
  const totalMacros = {
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    fiber: 0
  };
  
  for (const ingredient of ingredients) {
    const ingredientData = coreIngredients.find(ing => 
      ing.name.toLowerCase() === ingredient.name.toLowerCase()
    );
    
    if (ingredientData) {
      const ratio = ingredient.amount / 100; // Assuming amount is in grams
      totalMacros.calories += ingredientData.macros.calories * ratio;
      totalMacros.protein += ingredientData.macros.protein * ratio;
      totalMacros.carbs += ingredientData.macros.carbs * ratio;
      totalMacros.fat += ingredientData.macros.fat * ratio;
      totalMacros.fiber += (ingredientData.macros.fiber || 0) * ratio;
    }
  }
  
  return {
    calories: Math.round(totalMacros.calories),
    protein: Math.round(totalMacros.protein),
    carbs: Math.round(totalMacros.carbs),
    fat: Math.round(totalMacros.fat),
    fiber: Math.round(totalMacros.fiber)
  };
}

/**
 * Generate substitution suggestions for a list of ingredients
 */
export function generateSubstitutionMatrix(
  ingredientIds: string[],
  restrictions: ClientIngredientRestrictions
): Map<string, SubstitutionRule[]> {
  const matrix = new Map<string, SubstitutionRule[]>();
  
  for (const ingredientId of ingredientIds) {
    const substitutes: SubstitutionRule[] = [];
    
    // Find top 3 substitutes
    for (let i = 0; i < 3; i++) {
      const tempRestrictions = {
        ...restrictions,
        blockedIngredients: [...restrictions.blockedIngredients, ...substitutes.map(s => s.substituteId)]
      };
      
      const substitute = findBestSubstitute(ingredientId, tempRestrictions, true);
      if (substitute && substitute.macroSimilarity > 0.3) {
        substitutes.push(substitute);
      }
    }
    
    if (substitutes.length > 0) {
      matrix.set(ingredientId, substitutes);
    }
  }
  
  return matrix;
}

/**
 * Scale recipe to meet macro targets while respecting restrictions
 */
export function scaleRecipeToMacros(
  recipe: Recipe,
  targetMacros: { calories: number; protein: number; carbs: number; fat: number },
  restrictions: ClientIngredientRestrictions
): {
  scaledRecipe: Recipe;
  scaleFactor: number;
  macroAccuracy: number;
} {
  // First adapt recipe for restrictions
  const { adaptedRecipe } = adaptRecipe(recipe, restrictions, true);
  
  // Calculate optimal scale factor
  const currentMacros = adaptedRecipe.macrosPerServing;
  const scaleFactors = [
    targetMacros.calories / currentMacros.calories,
    targetMacros.protein / currentMacros.protein,
    targetMacros.carbs / currentMacros.carbs,
    targetMacros.fat / currentMacros.fat
  ].filter(f => !isNaN(f) && isFinite(f));
  
  // Use weighted average favoring protein
  const scaleFactor = scaleFactors.reduce((sum, f, i) => {
    const weight = i === 1 ? 0.4 : 0.2; // Protein gets higher weight
    return sum + f * weight;
  }, 0);
  
  // Scale all ingredients
  const scaledIngredients = adaptedRecipe.ingredients.map(ing => ({
    ...ing,
    amount: Math.round(ing.amount * scaleFactor * 10) / 10
  }));
  
  const scaledMacros = {
    calories: Math.round(currentMacros.calories * scaleFactor),
    protein: Math.round(currentMacros.protein * scaleFactor),
    carbs: Math.round(currentMacros.carbs * scaleFactor),
    fat: Math.round(currentMacros.fat * scaleFactor),
    fiber: currentMacros.fiber ? Math.round(currentMacros.fiber * scaleFactor) : 0
  };
  
  // Calculate accuracy
  const accuracy = 1 - (
    Math.abs(scaledMacros.calories - targetMacros.calories) / targetMacros.calories * 0.25 +
    Math.abs(scaledMacros.protein - targetMacros.protein) / targetMacros.protein * 0.35 +
    Math.abs(scaledMacros.carbs - targetMacros.carbs) / targetMacros.carbs * 0.2 +
    Math.abs(scaledMacros.fat - targetMacros.fat) / targetMacros.fat * 0.2
  );
  
  return {
    scaledRecipe: {
      ...adaptedRecipe,
      ingredients: scaledIngredients,
      macrosPerServing: scaledMacros
    },
    scaleFactor,
    macroAccuracy: Math.max(0, accuracy)
  };
}
