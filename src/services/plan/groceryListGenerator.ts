import { MealPlan, GroceryItem } from './types';

/**
 * Generate grocery list from weekly meal plan
 */
export function generateDynamicGroceryList(weeklyMealPlan: MealPlan[]): GroceryItem[] {
  const groceryMap = new Map<string, GroceryItem>();
  
  weeklyMealPlan.forEach(dayPlan => {
    dayPlan.meals.forEach(meal => {
      meal.recipes.forEach(recipeServing => {
        recipeServing.recipe.ingredients.forEach(ingredient => {
          const key = ingredient.name.toLowerCase();
          const amount = ingredient.amount * recipeServing.servings;
          
          if (groceryMap.has(key)) {
            const existing = groceryMap.get(key)!;
            existing.totalAmount += amount;
          } else {
            groceryMap.set(key, {
              ingredient: ingredient.name,
              totalAmount: amount,
              unit: ingredient.unit,
              category: ingredient.category,
              estimatedCost: amount * 0.03, // Rough estimate
            });
          }
        });
      });
    });
  });
  
  return Array.from(groceryMap.values()).sort((a, b) => 
    a.category.localeCompare(b.category)
  );
}
