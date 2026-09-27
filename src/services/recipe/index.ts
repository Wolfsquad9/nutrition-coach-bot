export type { MealType } from './constants';
export type {
  GeneratedRecipe,
  FullDayMealPlanResult,
  WeeklyMealPlanResult,
  ToleranceCheckResult,
  RecipeGenerationOptions,
} from './types';
export {
  resolveEligibleIngredients,
  normalizeAllergenTokens,
  isIngredientCompatibleWithDiet,
  findDislikedMatch,
} from './eligibility';
export type {
  EligibilityInput,
  EligibleIngredientPool,
  EligibilityRejection,
  EligibilityRejectionReason,
  DietType,
} from './eligibility';
export {
  createRegenerationSeed,
  nextRegenerationSeed,
  regenerationStorageKey,
  readRegenerationCount,
  incrementRegenerationCount,
  REGENERATION_STORAGE_PREFIX,
} from './regeneration';
export type { RegenerationScope, StorageLike } from './regeneration';
export {
  calculateTotalMacros,
  determineDietTypes,
  determineAllergens,
  determineEquipment,
  checkMacroTolerance,
} from './nutritionCalculations';
export {
  getSuitableIngredients,
  getMealSuitability,
  canGenerateFullDayPlan,
} from './ingredientUtils';
export { selectBalancedIngredients } from './selectors';
export {
  generateRecipeName,
  generateInstructions,
  generateRecipe,
} from './recipeGenerators';
export {
  generateDeterministicRecipeName,
  generateDeterministicInstructions,
  generateFinalRecipeText,
  generateMealRecipeText,
} from './deterministicRecipeText';
export { adjustMealIngredients } from './mealAdjuster';
export { generateFullDayMealPlan, shuffleForDay } from './mealPlanGenerator';
export { generateWeeklyMealPlan } from './weeklyPlanGenerator';