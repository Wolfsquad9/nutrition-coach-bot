import { type IngredientData } from '@/data/ingredientDatabase';
import { type Rng } from '@/utils/random';
import { type MealType } from './constants';

export function selectBalancedIngredients(
  suitableIngredients: IngredientData[],
  mealType: MealType,
  rng: Rng
): IngredientData[] {
  const selected: IngredientData[] = [];

  // Must have protein
  const proteins = suitableIngredients.filter(ing => ing.category === 'protein');
  if (proteins.length > 0) {
    selected.push(proteins[rng.int(proteins.length)]);
  }

  // Add carb for main meals
  if (mealType !== 'snack') {
    const carbs = suitableIngredients.filter(ing => ing.category === 'carbohydrate');
    if (carbs.length > 0) {
      selected.push(carbs[rng.int(carbs.length)]);
    }
  }

  // Add vegetable for lunch/dinner
  if (mealType === 'lunch' || mealType === 'dinner') {
    const vegetables = suitableIngredients.filter(ing => ing.category === 'vegetable');
    if (vegetables.length > 0) {
      const numVeggies = Math.min(2, vegetables.length);
      const shuffled = rng.shuffle(vegetables);
      selected.push(...shuffled.slice(0, numVeggies));
    }
  }

  // Add fruit for breakfast/snack
  if (mealType === 'breakfast' || mealType === 'snack') {
    const fruits = suitableIngredients.filter(ing => ing.category === 'fruit');
    if (fruits.length > 0) {
      selected.push(fruits[rng.int(fruits.length)]);
    }
  }

  // Add fat
  const fats = suitableIngredients.filter(ing => ing.category === 'fat');
  if (fats.length > 0) {
    selected.push(fats[rng.int(fats.length)]);
  }

  // Add misc/seasoning
  const misc = suitableIngredients.filter(ing => ing.category === 'misc');
  if (misc.length > 0 && (mealType === 'lunch' || mealType === 'dinner')) {
    selected.push(misc[rng.int(misc.length)]);
  }

  return selected;
}
