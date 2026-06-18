import { coreIngredients, type IngredientData } from '@/data/ingredientDatabase';
import { MealType } from './constants';
import { determineDietTypes, determineAllergens, determineEquipment } from './nutritionCalculations';

export function getSuitableIngredients(
  selectedFoods: string[],
  mealType: MealType
): IngredientData[] {
  return coreIngredients.filter(ing => {
    const isSelected = selectedFoods.includes(ing.id);
    const isSuitable = ing.allowedMeals.includes(mealType);
    return isSelected && isSuitable;
  });
}

export function getMealSuitability(ingredientId: string): MealType[] {
  const ingredient = coreIngredients.find(ing => ing.id === ingredientId);
  return ingredient?.allowedMeals || ['lunch', 'dinner'];
}

export { determineDietTypes, determineAllergens, determineEquipment };

/**
 * Helper to check if there are enough ingredients for a full day
 */
export function canGenerateFullDayPlan(selectedFoods: string[]): {
  canGenerate: boolean;
  missingMeals: MealType[];
} {
  const mealTypes: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
  const missingMeals: MealType[] = [];
  
  for (const mealType of mealTypes) {
    const suitableIngredients = coreIngredients.filter(ing => 
      selectedFoods.includes(ing.id) && ing.allowedMeals.includes(mealType)
    );
    
    // Need at least one protein source for each meal
    const hasProtein = suitableIngredients.some(ing => ing.category === 'protein');
    if (!hasProtein || suitableIngredients.length < 2) {
      missingMeals.push(mealType);
    }
  }
  
  return {
    canGenerate: missingMeals.length === 0,
    missingMeals,
  };
}
