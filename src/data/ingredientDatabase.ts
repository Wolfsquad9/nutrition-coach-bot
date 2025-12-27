export type MealTimeType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface IngredientData {
  id: string;
  name: string;
  category: 'protein' | 'carbohydrate' | 'fat' | 'fruit' | 'vegetable' | 'misc';
  macros: {
    protein: number;
    carbs: number;
    fat: number;
    calories: number;
    fiber?: number;
  };
  allowedMeals: MealTimeType[];
  key_micros?: string[];
  typical_serving_size_g: number;
  tags: string[];
}

// New data structure for daily meal planning
export interface MealData {
  ingredients: IngredientData[];
  recipeText: string;
  macros: {
    protein: number;
    carbs: number;
    fat: number;
    calories: number;
    fiber?: number;
  };
}

export interface DailyMealPlan {
  breakfast: MealData;
  lunch: MealData;
  dinner: MealData;
  snack: MealData;
}

export const coreIngredients: IngredientData[] = [
  // PROTEINS
  {
    id: 'chicken-breast',
    name: 'Chicken Breast',
    category: 'protein',
    macros: { protein: 31, carbs: 0, fat: 3.6, calories: 165, fiber: 0 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['B6', 'B12', 'Niacin', 'Selenium'],
    typical_serving_size_g: 150,
    tags: ['lean', 'high-protein', 'versatile', 'budget']
  },
  {
    id: 'eggs',
    name: 'Eggs (whole)',
    category: 'protein',
    macros: { protein: 13, carbs: 1.1, fat: 11, calories: 155, fiber: 0 },
    allowedMeals: ['breakfast', 'lunch', 'snack'],
    key_micros: ['Vitamin D', 'B12', 'Choline', 'Selenium'],
    typical_serving_size_g: 100,
    tags: ['complete-protein', 'vegetarian', 'budget', 'versatile']
  },
  {
    id: 'salmon',
    name: 'Salmon',
    category: 'protein',
    macros: { protein: 25, carbs: 0, fat: 13, calories: 208, fiber: 0 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Omega-3', 'Vitamin D', 'B12', 'Selenium'],
    typical_serving_size_g: 120,
    tags: ['omega-3', 'heart-healthy', 'premium']
  },
  {
    id: 'tofu',
    name: 'Tofu (firm)',
    category: 'protein',
    macros: { protein: 8, carbs: 2, fat: 4.8, calories: 76, fiber: 0.3 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Iron', 'Calcium', 'Magnesium'],
    typical_serving_size_g: 150,
    tags: ['vegetarian', 'vegan', 'plant-based', 'budget']
  },
  {
    id: 'greek-yogurt',
    name: 'Greek Yogurt (0% fat)',
    category: 'protein',
    macros: { protein: 10, carbs: 3.6, fat: 0.4, calories: 59, fiber: 0 },
    allowedMeals: ['breakfast', 'snack'],
    key_micros: ['Calcium', 'B12', 'Probiotics'],
    typical_serving_size_g: 170,
    tags: ['high-protein', 'probiotic', 'vegetarian', 'low-fat']
  },
  {
    id: 'lentils',
    name: 'Lentils (cooked)',
    category: 'protein',
    macros: { protein: 9, carbs: 20, fat: 0.4, calories: 116, fiber: 7.9 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Folate', 'Iron', 'Manganese'],
    typical_serving_size_g: 200,
    tags: ['vegetarian', 'vegan', 'high-fiber', 'budget', 'plant-based']
  },
  {
    id: 'turkey-breast',
    name: 'Turkey Breast',
    category: 'protein',
    macros: { protein: 29, carbs: 0, fat: 1, calories: 135, fiber: 0 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['B6', 'Niacin', 'Selenium', 'Phosphorus'],
    typical_serving_size_g: 120,
    tags: ['lean', 'high-protein', 'low-fat']
  },
  {
    id: 'cottage-cheese',
    name: 'Cottage Cheese (2% fat)',
    category: 'protein',
    macros: { protein: 11, carbs: 3.4, fat: 2.3, calories: 81, fiber: 0 },
    allowedMeals: ['breakfast', 'snack'],
    key_micros: ['Calcium', 'B12', 'Phosphorus'],
    typical_serving_size_g: 200,
    tags: ['high-protein', 'vegetarian', 'budget']
  },
  {
    id: 'tuna',
    name: 'Tuna (canned in water)',
    category: 'protein',
    macros: { protein: 25, carbs: 0, fat: 0.8, calories: 116, fiber: 0 },
    allowedMeals: ['lunch', 'dinner', 'snack'],
    key_micros: ['Selenium', 'B12', 'Niacin', 'Omega-3'],
    typical_serving_size_g: 100,
    tags: ['lean', 'high-protein', 'budget', 'convenient']
  },
  {
    id: 'black-beans',
    name: 'Black Beans (cooked)',
    category: 'protein',
    macros: { protein: 8.9, carbs: 23, fat: 0.5, calories: 132, fiber: 8.7 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Folate', 'Iron', 'Magnesium'],
    typical_serving_size_g: 170,
    tags: ['vegetarian', 'vegan', 'high-fiber', 'budget', 'plant-based']
  },

  // CARBOHYDRATES
  {
    id: 'brown-rice',
    name: 'Brown Rice (cooked)',
    category: 'carbohydrate',
    macros: { protein: 2.6, carbs: 23, fat: 0.9, calories: 111, fiber: 1.8 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Manganese', 'Magnesium', 'B1'],
    typical_serving_size_g: 150,
    tags: ['whole-grain', 'gluten-free', 'budget', 'staple']
  },
  {
    id: 'oats',
    name: 'Oats (rolled)',
    category: 'carbohydrate',
    macros: { protein: 13.2, carbs: 67, fat: 6.5, calories: 379, fiber: 10.1 },
    allowedMeals: ['breakfast', 'snack'],
    key_micros: ['Manganese', 'Phosphorus', 'Magnesium', 'Iron'],
    typical_serving_size_g: 40,
    tags: ['whole-grain', 'high-fiber', 'budget', 'breakfast']
  },
  {
    id: 'sweet-potato',
    name: 'Sweet Potato',
    category: 'carbohydrate',
    macros: { protein: 1.6, carbs: 20, fat: 0.1, calories: 86, fiber: 3 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Vitamin A', 'Manganese', 'Potassium'],
    typical_serving_size_g: 200,
    tags: ['whole-food', 'high-fiber', 'budget', 'nutrient-dense']
  },
  {
    id: 'quinoa',
    name: 'Quinoa (cooked)',
    category: 'carbohydrate',
    macros: { protein: 4.4, carbs: 21, fat: 1.9, calories: 120, fiber: 2.8 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Manganese', 'Phosphorus', 'Magnesium'],
    typical_serving_size_g: 150,
    tags: ['complete-protein', 'gluten-free', 'whole-grain']
  },
  {
    id: 'whole-wheat-pasta',
    name: 'Whole Wheat Pasta (cooked)',
    category: 'carbohydrate',
    macros: { protein: 5.3, carbs: 26, fat: 0.9, calories: 124, fiber: 4.5 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Manganese', 'Selenium', 'Phosphorus'],
    typical_serving_size_g: 150,
    tags: ['whole-grain', 'high-fiber', 'budget']
  },
  {
    id: 'white-potato',
    name: 'White Potato',
    category: 'carbohydrate',
    macros: { protein: 2, carbs: 17, fat: 0.1, calories: 77, fiber: 2.2 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Potassium', 'Vitamin C', 'B6'],
    typical_serving_size_g: 200,
    tags: ['budget', 'versatile', 'staple', 'gluten-free']
  },
  {
    id: 'whole-wheat-bread',
    name: 'Whole Wheat Bread',
    category: 'carbohydrate',
    macros: { protein: 9, carbs: 43, fat: 3.4, calories: 247, fiber: 6.5 },
    allowedMeals: ['breakfast', 'lunch', 'snack'],
    key_micros: ['Selenium', 'Manganese', 'B vitamins'],
    typical_serving_size_g: 60,
    tags: ['whole-grain', 'convenient', 'breakfast']
  },
  {
    id: 'barley',
    name: 'Barley (cooked)',
    category: 'carbohydrate',
    macros: { protein: 2.3, carbs: 28, fat: 0.4, calories: 123, fiber: 3.8 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Selenium', 'Manganese', 'Copper'],
    typical_serving_size_g: 150,
    tags: ['whole-grain', 'high-fiber', 'budget']
  },

  // FATS
  {
    id: 'olive-oil',
    name: 'Extra Virgin Olive Oil',
    category: 'fat',
    macros: { protein: 0, carbs: 0, fat: 100, calories: 884, fiber: 0 },
    allowedMeals: ['breakfast', 'lunch', 'dinner'],
    key_micros: ['Vitamin E', 'Vitamin K', 'Polyphenols'],
    typical_serving_size_g: 15,
    tags: ['heart-healthy', 'monounsaturated', 'mediterranean']
  },
  {
    id: 'avocado',
    name: 'Avocado',
    category: 'fat',
    macros: { protein: 2, carbs: 8.5, fat: 14.7, calories: 160, fiber: 6.7 },
    allowedMeals: ['breakfast', 'lunch', 'dinner', 'snack'],
    key_micros: ['Potassium', 'Vitamin K', 'Folate', 'Vitamin E'],
    typical_serving_size_g: 100,
    tags: ['heart-healthy', 'high-fiber', 'nutrient-dense']
  },
  {
    id: 'almonds',
    name: 'Almonds',
    category: 'fat',
    macros: { protein: 21, carbs: 22, fat: 49, calories: 579, fiber: 12.5 },
    allowedMeals: ['breakfast', 'snack'],
    key_micros: ['Vitamin E', 'Magnesium', 'Manganese'],
    typical_serving_size_g: 30,
    tags: ['high-protein', 'heart-healthy', 'snack']
  },
  {
    id: 'walnuts',
    name: 'Walnuts',
    category: 'fat',
    macros: { protein: 15, carbs: 14, fat: 65, calories: 654, fiber: 6.7 },
    allowedMeals: ['breakfast', 'snack'],
    key_micros: ['Omega-3', 'Manganese', 'Copper'],
    typical_serving_size_g: 30,
    tags: ['omega-3', 'heart-healthy', 'brain-health']
  },
  {
    id: 'peanut-butter',
    name: 'Natural Peanut Butter',
    category: 'fat',
    macros: { protein: 25, carbs: 20, fat: 50, calories: 588, fiber: 6 },
    allowedMeals: ['breakfast', 'snack'],
    key_micros: ['Niacin', 'Magnesium', 'Vitamin E'],
    typical_serving_size_g: 30,
    tags: ['high-protein', 'convenient', 'budget']
  },
  {
    id: 'chia-seeds',
    name: 'Chia Seeds',
    category: 'fat',
    macros: { protein: 17, carbs: 42, fat: 31, calories: 486, fiber: 34 },
    allowedMeals: ['breakfast', 'snack'],
    key_micros: ['Omega-3', 'Calcium', 'Phosphorus'],
    typical_serving_size_g: 15,
    tags: ['omega-3', 'high-fiber', 'superfood']
  },
  {
    id: 'flax-seeds',
    name: 'Flax Seeds (ground)',
    category: 'fat',
    macros: { protein: 18, carbs: 29, fat: 42, calories: 534, fiber: 27 },
    allowedMeals: ['breakfast', 'snack'],
    key_micros: ['Omega-3', 'Lignans', 'Manganese'],
    typical_serving_size_g: 15,
    tags: ['omega-3', 'high-fiber', 'plant-based']
  },
  {
    id: 'coconut-oil',
    name: 'Coconut Oil',
    category: 'fat',
    macros: { protein: 0, carbs: 0, fat: 100, calories: 862, fiber: 0 },
    allowedMeals: ['breakfast', 'lunch', 'dinner'],
    key_micros: ['MCTs'],
    typical_serving_size_g: 15,
    tags: ['saturated', 'cooking', 'energy']
  },

  // FRUITS
  {
    id: 'banana',
    name: 'Banana',
    category: 'fruit',
    macros: { protein: 1.1, carbs: 23, fat: 0.3, calories: 89, fiber: 2.6 },
    allowedMeals: ['breakfast', 'snack'],
    key_micros: ['Potassium', 'B6', 'Vitamin C'],
    typical_serving_size_g: 120,
    tags: ['quick-energy', 'budget', 'convenient']
  },
  {
    id: 'apple',
    name: 'Apple',
    category: 'fruit',
    macros: { protein: 0.3, carbs: 14, fat: 0.2, calories: 52, fiber: 2.4 },
    allowedMeals: ['breakfast', 'snack'],
    key_micros: ['Vitamin C', 'Polyphenols', 'Potassium'],
    typical_serving_size_g: 180,
    tags: ['high-fiber', 'budget', 'snack']
  },
  {
    id: 'berries-mixed',
    name: 'Mixed Berries',
    category: 'fruit',
    macros: { protein: 0.7, carbs: 12, fat: 0.3, calories: 57, fiber: 3.6 },
    allowedMeals: ['breakfast', 'snack'],
    key_micros: ['Vitamin C', 'Anthocyanins', 'Manganese'],
    typical_serving_size_g: 150,
    tags: ['antioxidant', 'low-calorie', 'nutrient-dense']
  },
  {
    id: 'orange',
    name: 'Orange',
    category: 'fruit',
    macros: { protein: 0.9, carbs: 12, fat: 0.1, calories: 47, fiber: 2.4 },
    allowedMeals: ['breakfast', 'snack'],
    key_micros: ['Vitamin C', 'Folate', 'Potassium'],
    typical_serving_size_g: 150,
    tags: ['vitamin-c', 'immune-support', 'budget']
  },
  {
    id: 'mango',
    name: 'Mango',
    category: 'fruit',
    macros: { protein: 0.8, carbs: 15, fat: 0.4, calories: 60, fiber: 1.6 },
    allowedMeals: ['breakfast', 'snack'],
    key_micros: ['Vitamin A', 'Vitamin C', 'Folate'],
    typical_serving_size_g: 150,
    tags: ['vitamin-a', 'tropical', 'sweet']
  },
  {
    id: 'grapes',
    name: 'Grapes',
    category: 'fruit',
    macros: { protein: 0.7, carbs: 17, fat: 0.2, calories: 69, fiber: 0.9 },
    allowedMeals: ['snack'],
    key_micros: ['Vitamin K', 'Resveratrol', 'Potassium'],
    typical_serving_size_g: 150,
    tags: ['antioxidant', 'convenient', 'snack']
  },

  // VEGETABLES
  {
    id: 'broccoli',
    name: 'Broccoli',
    category: 'vegetable',
    macros: { protein: 2.8, carbs: 7, fat: 0.4, calories: 34, fiber: 2.6 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Vitamin C', 'Vitamin K', 'Folate'],
    typical_serving_size_g: 150,
    tags: ['nutrient-dense', 'low-calorie', 'cruciferous']
  },
  {
    id: 'spinach',
    name: 'Spinach',
    category: 'vegetable',
    macros: { protein: 2.9, carbs: 3.6, fat: 0.4, calories: 23, fiber: 2.2 },
    allowedMeals: ['breakfast', 'lunch', 'dinner'],
    key_micros: ['Vitamin K', 'Vitamin A', 'Folate', 'Iron'],
    typical_serving_size_g: 100,
    tags: ['nutrient-dense', 'low-calorie', 'versatile']
  },
  {
    id: 'tomato',
    name: 'Tomato',
    category: 'vegetable',
    macros: { protein: 0.9, carbs: 3.9, fat: 0.2, calories: 18, fiber: 1.2 },
    allowedMeals: ['breakfast', 'lunch', 'dinner'],
    key_micros: ['Lycopene', 'Vitamin C', 'Potassium'],
    typical_serving_size_g: 150,
    tags: ['antioxidant', 'low-calorie', 'versatile']
  },
  {
    id: 'carrot',
    name: 'Carrot',
    category: 'vegetable',
    macros: { protein: 0.9, carbs: 10, fat: 0.2, calories: 41, fiber: 2.8 },
    allowedMeals: ['lunch', 'dinner', 'snack'],
    key_micros: ['Vitamin A', 'Beta-carotene', 'Potassium'],
    typical_serving_size_g: 100,
    tags: ['vitamin-a', 'budget', 'snack']
  },
  {
    id: 'bell-pepper',
    name: 'Bell Pepper',
    category: 'vegetable',
    macros: { protein: 1, carbs: 6, fat: 0.3, calories: 31, fiber: 2.1 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Vitamin C', 'Vitamin A', 'B6'],
    typical_serving_size_g: 150,
    tags: ['vitamin-c', 'low-calorie', 'colorful']
  },
  {
    id: 'cucumber',
    name: 'Cucumber',
    category: 'vegetable',
    macros: { protein: 0.7, carbs: 3.6, fat: 0.1, calories: 16, fiber: 0.5 },
    allowedMeals: ['lunch', 'dinner', 'snack'],
    key_micros: ['Vitamin K', 'Potassium'],
    typical_serving_size_g: 100,
    tags: ['hydrating', 'low-calorie', 'refreshing']
  },
  {
    id: 'cauliflower',
    name: 'Cauliflower',
    category: 'vegetable',
    macros: { protein: 1.9, carbs: 5, fat: 0.3, calories: 25, fiber: 2 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Vitamin C', 'Vitamin K', 'Folate'],
    typical_serving_size_g: 150,
    tags: ['low-carb', 'versatile', 'cruciferous']
  },
  {
    id: 'zucchini',
    name: 'Zucchini',
    category: 'vegetable',
    macros: { protein: 1.2, carbs: 3.1, fat: 0.3, calories: 17, fiber: 1 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Vitamin C', 'Potassium', 'Manganese'],
    typical_serving_size_g: 150,
    tags: ['low-calorie', 'versatile', 'hydrating']
  },
  {
    id: 'kale',
    name: 'Kale',
    category: 'vegetable',
    macros: { protein: 4.3, carbs: 9, fat: 0.9, calories: 49, fiber: 3.6 },
    allowedMeals: ['breakfast', 'lunch', 'dinner'],
    key_micros: ['Vitamin K', 'Vitamin A', 'Vitamin C', 'Calcium'],
    typical_serving_size_g: 100,
    tags: ['superfood', 'nutrient-dense', 'cruciferous']
  },
  {
    id: 'asparagus',
    name: 'Asparagus',
    category: 'vegetable',
    macros: { protein: 2.2, carbs: 3.9, fat: 0.1, calories: 20, fiber: 2.1 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Vitamin K', 'Folate', 'Vitamin A'],
    typical_serving_size_g: 150,
    tags: ['nutrient-dense', 'low-calorie', 'spring-vegetable']
  },

  // MISC ESSENTIALS
  {
    id: 'garlic',
    name: 'Garlic',
    category: 'misc',
    macros: { protein: 6.4, carbs: 33, fat: 0.5, calories: 149, fiber: 2.1 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Manganese', 'B6', 'Vitamin C'],
    typical_serving_size_g: 5,
    tags: ['flavor', 'immune-support', 'antimicrobial']
  },
  {
    id: 'ginger',
    name: 'Fresh Ginger',
    category: 'misc',
    macros: { protein: 1.8, carbs: 18, fat: 0.8, calories: 80, fiber: 2 },
    allowedMeals: ['breakfast', 'lunch', 'dinner'],
    key_micros: ['Gingerol', 'Potassium', 'Magnesium'],
    typical_serving_size_g: 5,
    tags: ['anti-inflammatory', 'digestive', 'flavor']
  },
  {
    id: 'lemon',
    name: 'Lemon (juice)',
    category: 'misc',
    macros: { protein: 0.4, carbs: 9, fat: 0.2, calories: 22, fiber: 0.3 },
    allowedMeals: ['breakfast', 'lunch', 'dinner'],
    key_micros: ['Vitamin C', 'Citric acid'],
    typical_serving_size_g: 30,
    tags: ['vitamin-c', 'flavor', 'alkalizing']
  },
  {
    id: 'herbs-mixed',
    name: 'Mixed Fresh Herbs',
    category: 'misc',
    macros: { protein: 3.7, carbs: 8, fat: 0.8, calories: 50, fiber: 3.5 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Vitamin K', 'Antioxidants', 'Essential oils'],
    typical_serving_size_g: 10,
    tags: ['flavor', 'antioxidant', 'zero-calorie']
  },
  {
    id: 'cinnamon',
    name: 'Cinnamon',
    category: 'misc',
    macros: { protein: 4, carbs: 81, fat: 1.2, calories: 247, fiber: 53 },
    allowedMeals: ['breakfast', 'snack'],
    key_micros: ['Manganese', 'Calcium', 'Iron'],
    typical_serving_size_g: 2,
    tags: ['blood-sugar', 'antioxidant', 'flavor']
  }
];

// Helper function to get ingredients by category
export function getIngredientsByCategory(category: IngredientData['category']): IngredientData[] {
  return coreIngredients.filter(ing => ing.category === category);
}

// Helper function to get ingredients by tags
export function getIngredientsByTags(tags: string[]): IngredientData[] {
  return coreIngredients.filter(ing => 
    tags.some(tag => ing.tags.includes(tag))
  );
}

// Helper function to calculate macros for a given serving size
export function calculateMacros(ingredient: IngredientData, servingSize: number) {
  const ratio = servingSize / 100;
  return {
    protein: Math.round(ingredient.macros.protein * ratio * 10) / 10,
    carbs: Math.round(ingredient.macros.carbs * ratio * 10) / 10,
    fat: Math.round(ingredient.macros.fat * ratio * 10) / 10,
    calories: Math.round(ingredient.macros.calories * ratio),
    fiber: ingredient.macros.fiber ? Math.round(ingredient.macros.fiber * ratio * 10) / 10 : undefined
  };
}

// Helper function to find ingredients matching nutritional criteria
export function findIngredientsByNutrition(criteria: {
  minProtein?: number;
  maxCarbs?: number;
  maxFat?: number;
  maxCalories?: number;
}): IngredientData[] {
  return coreIngredients.filter(ing => {
    const macros = ing.macros;
    return (
      (!criteria.minProtein || macros.protein >= criteria.minProtein) &&
      (!criteria.maxCarbs || macros.carbs <= criteria.maxCarbs) &&
      (!criteria.maxFat || macros.fat <= criteria.maxFat) &&
      (!criteria.maxCalories || macros.calories <= criteria.maxCalories)
    );
  });
}

// Helper function to get ingredients allowed for a specific meal
export function getIngredientsByMealTime(mealTime: MealTimeType): IngredientData[] {
  return coreIngredients.filter(ing => ing.allowedMeals.includes(mealTime));
}

// Helper function to create an empty meal data structure
export function createEmptyMealData(): MealData {
  return {
    ingredients: [],
    recipeText: '',
    macros: { protein: 0, carbs: 0, fat: 0, calories: 0, fiber: 0 }
  };
}

// Helper function to create an empty daily meal plan
export function createEmptyDailyMealPlan(): DailyMealPlan {
  return {
    breakfast: createEmptyMealData(),
    lunch: createEmptyMealData(),
    dinner: createEmptyMealData(),
    snack: createEmptyMealData()
  };
}