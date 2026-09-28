export type MealTimeType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

/**
 * Structured allergen vocabulary.
 *
 * Single source of truth for allergen classification. It replaces the
 * hardcoded ingredient-ID lists that previously lived in
 * `determineAllergens`, so adding an ingredient cannot silently leave an
 * allergen unreported.
 */
export type AllergenTag = 'gluten' | 'dairy' | 'eggs' | 'fish' | 'nuts' | 'soy' | 'sesame' | 'shellfish';

/**
 * The most restrictive diet an ingredient satisfies. The nesting is defined
 * once in `isIngredientCompatibleWithDiet`:
 *   omnivore ⊃ pescatarian ⊃ vegetarian ⊃ vegan
 */
export type DietTag = 'vegan' | 'vegetarian' | 'pescatarian' | 'omnivore';

import { caloriesFromMacros } from '@/domain/nutrition/engine';

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
  /**
   * Allergen classes present in this ingredient.
   *
   * Optional so pre-existing `IngredientData` literals stay valid; shipped-library
   * completeness is enforced by a guard test in `eligibility.test.ts`.
   */
  allergens?: AllergenTag[];
  /** Diet levels this ingredient satisfies (see `DietTag`). */
  dietTags?: DietTag[];
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
    tags: ['lean', 'high-protein', 'versatile', 'budget'],
    allergens: [],
    dietTags: ['omnivore']
  },
  {
    id: 'eggs',
    name: 'Eggs (whole)',
    category: 'protein',
    macros: { protein: 13, carbs: 1.1, fat: 11, calories: 155, fiber: 0 },
    allowedMeals: ['breakfast', 'lunch', 'snack'],
    key_micros: ['Vitamin D', 'B12', 'Choline', 'Selenium'],
    typical_serving_size_g: 100,
    tags: ['complete-protein', 'vegetarian', 'budget', 'versatile'],
    allergens: ['eggs'],
    dietTags: ['vegetarian']
  },
  {
    id: 'salmon',
    name: 'Salmon',
    category: 'protein',
    macros: { protein: 25, carbs: 0, fat: 13, calories: 208, fiber: 0 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Omega-3', 'Vitamin D', 'B12', 'Selenium'],
    typical_serving_size_g: 120,
    tags: ['omega-3', 'heart-healthy', 'premium'],
    allergens: ['fish'],
    dietTags: ['pescatarian']
  },
  {
    id: 'tofu',
    name: 'Tofu (firm)',
    category: 'protein',
    macros: { protein: 8, carbs: 2, fat: 4.8, calories: 76, fiber: 0.3 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Iron', 'Calcium', 'Magnesium'],
    typical_serving_size_g: 150,
    tags: ['vegetarian', 'vegan', 'plant-based', 'budget'],
    allergens: ['soy'],
    dietTags: ['vegan']
  },
  {
    id: 'greek-yogurt',
    name: 'Greek Yogurt (0% fat)',
    category: 'protein',
    macros: { protein: 10, carbs: 3.6, fat: 0.4, calories: 59, fiber: 0 },
    allowedMeals: ['breakfast', 'snack'],
    key_micros: ['Calcium', 'B12', 'Probiotics'],
    typical_serving_size_g: 170,
    tags: ['high-protein', 'probiotic', 'vegetarian', 'low-fat'],
    allergens: ['dairy'],
    dietTags: ['vegetarian']
  },
  {
    id: 'lentils',
    name: 'Lentils (cooked)',
    category: 'protein',
    macros: { protein: 9, carbs: 20, fat: 0.4, calories: 116, fiber: 7.9 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Folate', 'Iron', 'Manganese'],
    typical_serving_size_g: 200,
    tags: ['vegetarian', 'vegan', 'high-fiber', 'budget', 'plant-based'],
    allergens: [],
    dietTags: ['vegan']
  },
  {
    id: 'turkey-breast',
    name: 'Turkey Breast',
    category: 'protein',
    macros: { protein: 29, carbs: 0, fat: 1, calories: 135, fiber: 0 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['B6', 'Niacin', 'Selenium', 'Phosphorus'],
    typical_serving_size_g: 120,
    tags: ['lean', 'high-protein', 'low-fat'],
    allergens: [],
    dietTags: ['omnivore']
  },
  {
    id: 'cottage-cheese',
    name: 'Cottage Cheese (2% fat)',
    category: 'protein',
    macros: { protein: 11, carbs: 3.4, fat: 2.3, calories: 81, fiber: 0 },
    allowedMeals: ['breakfast', 'snack'],
    key_micros: ['Calcium', 'B12', 'Phosphorus'],
    typical_serving_size_g: 200,
    tags: ['high-protein', 'vegetarian', 'budget'],
    allergens: ['dairy'],
    dietTags: ['vegetarian']
  },
  {
    id: 'tuna',
    name: 'Tuna (canned in water)',
    category: 'protein',
    macros: { protein: 25, carbs: 0, fat: 0.8, calories: 116, fiber: 0 },
    allowedMeals: ['lunch', 'dinner', 'snack'],
    key_micros: ['Selenium', 'B12', 'Niacin', 'Omega-3'],
    typical_serving_size_g: 100,
    tags: ['lean', 'high-protein', 'budget', 'convenient'],
    allergens: ['fish'],
    dietTags: ['pescatarian']
  },
  {
    id: 'black-beans',
    name: 'Black Beans (cooked)',
    category: 'protein',
    macros: { protein: 8.9, carbs: 23, fat: 0.5, calories: 132, fiber: 8.7 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Folate', 'Iron', 'Magnesium'],
    typical_serving_size_g: 170,
    tags: ['vegetarian', 'vegan', 'high-fiber', 'budget', 'plant-based'],
    allergens: [],
    dietTags: ['vegan']
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
    tags: ['whole-grain', 'gluten-free', 'budget', 'staple'],
    allergens: [],
    dietTags: ['vegan']
  },
  {
    id: 'oats',
    name: 'Oats (rolled)',
    category: 'carbohydrate',
    macros: { protein: 13.2, carbs: 67, fat: 6.5, calories: 379, fiber: 10.1 },
    allowedMeals: ['breakfast', 'snack'],
    key_micros: ['Manganese', 'Phosphorus', 'Magnesium', 'Iron'],
    typical_serving_size_g: 40,
    tags: ['whole-grain', 'high-fiber', 'budget', 'breakfast'],
    allergens: ['gluten'],
    dietTags: ['vegan']
  },
  {
    id: 'sweet-potato',
    name: 'Sweet Potato',
    category: 'carbohydrate',
    macros: { protein: 1.6, carbs: 20, fat: 0.1, calories: 86, fiber: 3 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Vitamin A', 'Manganese', 'Potassium'],
    typical_serving_size_g: 200,
    tags: ['whole-food', 'high-fiber', 'budget', 'nutrient-dense'],
    allergens: [],
    dietTags: ['vegan']
  },
  {
    id: 'quinoa',
    name: 'Quinoa (cooked)',
    category: 'carbohydrate',
    macros: { protein: 4.4, carbs: 21, fat: 1.9, calories: 120, fiber: 2.8 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Manganese', 'Phosphorus', 'Magnesium'],
    typical_serving_size_g: 150,
    tags: ['complete-protein', 'gluten-free', 'whole-grain'],
    allergens: [],
    dietTags: ['vegan']
  },
  {
    id: 'whole-wheat-pasta',
    name: 'Whole Wheat Pasta (cooked)',
    category: 'carbohydrate',
    macros: { protein: 5.3, carbs: 26, fat: 0.9, calories: 124, fiber: 4.5 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Manganese', 'Selenium', 'Phosphorus'],
    typical_serving_size_g: 150,
    tags: ['whole-grain', 'high-fiber', 'budget'],
    allergens: ['gluten'],
    dietTags: ['vegan']
  },
  {
    id: 'white-potato',
    name: 'White Potato',
    category: 'carbohydrate',
    macros: { protein: 2, carbs: 17, fat: 0.1, calories: 77, fiber: 2.2 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Potassium', 'Vitamin C', 'B6'],
    typical_serving_size_g: 200,
    tags: ['budget', 'versatile', 'staple', 'gluten-free'],
    allergens: [],
    dietTags: ['vegan']
  },
  {
    id: 'whole-wheat-bread',
    name: 'Whole Wheat Bread',
    category: 'carbohydrate',
    macros: { protein: 9, carbs: 43, fat: 3.4, calories: 247, fiber: 6.5 },
    allowedMeals: ['breakfast', 'lunch', 'snack'],
    key_micros: ['Selenium', 'Manganese', 'B vitamins'],
    typical_serving_size_g: 60,
    tags: ['whole-grain', 'convenient', 'breakfast'],
    allergens: ['gluten'],
    dietTags: ['vegan']
  },
  {
    id: 'barley',
    name: 'Barley (cooked)',
    category: 'carbohydrate',
    macros: { protein: 2.3, carbs: 28, fat: 0.4, calories: 123, fiber: 3.8 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Selenium', 'Manganese', 'Copper'],
    typical_serving_size_g: 150,
    tags: ['whole-grain', 'high-fiber', 'budget'],
    allergens: ['gluten'],
    dietTags: ['vegan']
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
    tags: ['heart-healthy', 'monounsaturated', 'mediterranean'],
    allergens: [],
    dietTags: ['vegan']
  },
  {
    id: 'avocado',
    name: 'Avocado',
    category: 'fat',
    macros: { protein: 2, carbs: 8.5, fat: 14.7, calories: 160, fiber: 6.7 },
    allowedMeals: ['breakfast', 'lunch', 'dinner', 'snack'],
    key_micros: ['Potassium', 'Vitamin K', 'Folate', 'Vitamin E'],
    typical_serving_size_g: 100,
    tags: ['heart-healthy', 'high-fiber', 'nutrient-dense'],
    allergens: [],
    dietTags: ['vegan']
  },
  {
    id: 'almonds',
    name: 'Almonds',
    category: 'fat',
    macros: { protein: 21, carbs: 22, fat: 49, calories: 579, fiber: 12.5 },
    allowedMeals: ['breakfast', 'snack'],
    key_micros: ['Vitamin E', 'Magnesium', 'Manganese'],
    typical_serving_size_g: 30,
    tags: ['high-protein', 'heart-healthy', 'snack'],
    allergens: ['nuts'],
    dietTags: ['vegan']
  },
  {
    id: 'walnuts',
    name: 'Walnuts',
    category: 'fat',
    macros: { protein: 15, carbs: 14, fat: 65, calories: 654, fiber: 6.7 },
    allowedMeals: ['breakfast', 'snack'],
    key_micros: ['Omega-3', 'Manganese', 'Copper'],
    typical_serving_size_g: 30,
    tags: ['omega-3', 'heart-healthy', 'brain-health'],
    allergens: ['nuts'],
    dietTags: ['vegan']
  },
  {
    id: 'peanut-butter',
    name: 'Natural Peanut Butter',
    category: 'fat',
    macros: { protein: 25, carbs: 20, fat: 50, calories: 588, fiber: 6 },
    allowedMeals: ['breakfast', 'snack'],
    key_micros: ['Niacin', 'Magnesium', 'Vitamin E'],
    typical_serving_size_g: 30,
    tags: ['high-protein', 'convenient', 'budget'],
    allergens: ['nuts'],
    dietTags: ['vegan']
  },
  {
    id: 'chia-seeds',
    name: 'Chia Seeds',
    category: 'fat',
    macros: { protein: 17, carbs: 42, fat: 31, calories: 486, fiber: 34 },
    allowedMeals: ['breakfast', 'snack'],
    key_micros: ['Omega-3', 'Calcium', 'Phosphorus'],
    typical_serving_size_g: 15,
    tags: ['omega-3', 'high-fiber', 'superfood'],
    allergens: [],
    dietTags: ['vegan']
  },
  {
    id: 'flax-seeds',
    name: 'Flax Seeds (ground)',
    category: 'fat',
    macros: { protein: 18, carbs: 29, fat: 42, calories: 534, fiber: 27 },
    allowedMeals: ['breakfast', 'snack'],
    key_micros: ['Omega-3', 'Lignans', 'Manganese'],
    typical_serving_size_g: 15,
    tags: ['omega-3', 'high-fiber', 'plant-based'],
    allergens: [],
    dietTags: ['vegan']
  },
  {
    id: 'coconut-oil',
    name: 'Coconut Oil',
    category: 'fat',
    macros: { protein: 0, carbs: 0, fat: 100, calories: 862, fiber: 0 },
    allowedMeals: ['breakfast', 'lunch', 'dinner'],
    key_micros: ['MCTs'],
    typical_serving_size_g: 15,
    tags: ['saturated', 'cooking', 'energy'],
    allergens: [],
    dietTags: ['vegan']
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
    tags: ['quick-energy', 'budget', 'convenient'],
    allergens: [],
    dietTags: ['vegan']
  },
  {
    id: 'apple',
    name: 'Apple',
    category: 'fruit',
    macros: { protein: 0.3, carbs: 14, fat: 0.2, calories: 52, fiber: 2.4 },
    allowedMeals: ['breakfast', 'snack'],
    key_micros: ['Vitamin C', 'Polyphenols', 'Potassium'],
    typical_serving_size_g: 180,
    tags: ['high-fiber', 'budget', 'snack'],
    allergens: [],
    dietTags: ['vegan']
  },
  {
    id: 'berries-mixed',
    name: 'Mixed Berries',
    category: 'fruit',
    macros: { protein: 0.7, carbs: 12, fat: 0.3, calories: 57, fiber: 3.6 },
    allowedMeals: ['breakfast', 'snack'],
    key_micros: ['Vitamin C', 'Anthocyanins', 'Manganese'],
    typical_serving_size_g: 150,
    tags: ['antioxidant', 'low-calorie', 'nutrient-dense'],
    allergens: [],
    dietTags: ['vegan']
  },
  {
    id: 'orange',
    name: 'Orange',
    category: 'fruit',
    macros: { protein: 0.9, carbs: 12, fat: 0.1, calories: 47, fiber: 2.4 },
    allowedMeals: ['breakfast', 'snack'],
    key_micros: ['Vitamin C', 'Folate', 'Potassium'],
    typical_serving_size_g: 150,
    tags: ['vitamin-c', 'immune-support', 'budget'],
    allergens: [],
    dietTags: ['vegan']
  },
  {
    id: 'mango',
    name: 'Mango',
    category: 'fruit',
    macros: { protein: 0.8, carbs: 15, fat: 0.4, calories: 60, fiber: 1.6 },
    allowedMeals: ['breakfast', 'snack'],
    key_micros: ['Vitamin A', 'Vitamin C', 'Folate'],
    typical_serving_size_g: 150,
    tags: ['vitamin-a', 'tropical', 'sweet'],
    allergens: [],
    dietTags: ['vegan']
  },
  {
    id: 'grapes',
    name: 'Grapes',
    category: 'fruit',
    macros: { protein: 0.7, carbs: 17, fat: 0.2, calories: 69, fiber: 0.9 },
    allowedMeals: ['snack'],
    key_micros: ['Vitamin K', 'Resveratrol', 'Potassium'],
    typical_serving_size_g: 150,
    tags: ['antioxidant', 'convenient', 'snack'],
    allergens: [],
    dietTags: ['vegan']
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
    tags: ['nutrient-dense', 'low-calorie', 'cruciferous'],
    allergens: [],
    dietTags: ['vegan']
  },
  {
    id: 'spinach',
    name: 'Spinach',
    category: 'vegetable',
    macros: { protein: 2.9, carbs: 3.6, fat: 0.4, calories: 23, fiber: 2.2 },
    allowedMeals: ['breakfast', 'lunch', 'dinner'],
    key_micros: ['Vitamin K', 'Vitamin A', 'Folate', 'Iron'],
    typical_serving_size_g: 100,
    tags: ['nutrient-dense', 'low-calorie', 'versatile'],
    allergens: [],
    dietTags: ['vegan']
  },
  {
    id: 'tomato',
    name: 'Tomato',
    category: 'vegetable',
    macros: { protein: 0.9, carbs: 3.9, fat: 0.2, calories: 18, fiber: 1.2 },
    allowedMeals: ['breakfast', 'lunch', 'dinner'],
    key_micros: ['Lycopene', 'Vitamin C', 'Potassium'],
    typical_serving_size_g: 150,
    tags: ['antioxidant', 'low-calorie', 'versatile'],
    allergens: [],
    dietTags: ['vegan']
  },
  {
    id: 'carrot',
    name: 'Carrot',
    category: 'vegetable',
    macros: { protein: 0.9, carbs: 10, fat: 0.2, calories: 41, fiber: 2.8 },
    allowedMeals: ['lunch', 'dinner', 'snack'],
    key_micros: ['Vitamin A', 'Beta-carotene', 'Potassium'],
    typical_serving_size_g: 100,
    tags: ['vitamin-a', 'budget', 'snack'],
    allergens: [],
    dietTags: ['vegan']
  },
  {
    id: 'bell-pepper',
    name: 'Bell Pepper',
    category: 'vegetable',
    macros: { protein: 1, carbs: 6, fat: 0.3, calories: 31, fiber: 2.1 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Vitamin C', 'Vitamin A', 'B6'],
    typical_serving_size_g: 150,
    tags: ['vitamin-c', 'low-calorie', 'colorful'],
    allergens: [],
    dietTags: ['vegan']
  },
  {
    id: 'cucumber',
    name: 'Cucumber',
    category: 'vegetable',
    macros: { protein: 0.7, carbs: 3.6, fat: 0.1, calories: 16, fiber: 0.5 },
    allowedMeals: ['lunch', 'dinner', 'snack'],
    key_micros: ['Vitamin K', 'Potassium'],
    typical_serving_size_g: 100,
    tags: ['hydrating', 'low-calorie', 'refreshing'],
    allergens: [],
    dietTags: ['vegan']
  },
  {
    id: 'cauliflower',
    name: 'Cauliflower',
    category: 'vegetable',
    macros: { protein: 1.9, carbs: 5, fat: 0.3, calories: 25, fiber: 2 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Vitamin C', 'Vitamin K', 'Folate'],
    typical_serving_size_g: 150,
    tags: ['low-carb', 'versatile', 'cruciferous'],
    allergens: [],
    dietTags: ['vegan']
  },
  {
    id: 'zucchini',
    name: 'Zucchini',
    category: 'vegetable',
    macros: { protein: 1.2, carbs: 3.1, fat: 0.3, calories: 17, fiber: 1 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Vitamin C', 'Potassium', 'Manganese'],
    typical_serving_size_g: 150,
    tags: ['low-calorie', 'versatile', 'hydrating'],
    allergens: [],
    dietTags: ['vegan']
  },
  {
    id: 'kale',
    name: 'Kale',
    category: 'vegetable',
    macros: { protein: 4.3, carbs: 9, fat: 0.9, calories: 49, fiber: 3.6 },
    allowedMeals: ['breakfast', 'lunch', 'dinner'],
    key_micros: ['Vitamin K', 'Vitamin A', 'Vitamin C', 'Calcium'],
    typical_serving_size_g: 100,
    tags: ['superfood', 'nutrient-dense', 'cruciferous'],
    allergens: [],
    dietTags: ['vegan']
  },
  {
    id: 'asparagus',
    name: 'Asparagus',
    category: 'vegetable',
    macros: { protein: 2.2, carbs: 3.9, fat: 0.1, calories: 20, fiber: 2.1 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Vitamin K', 'Folate', 'Vitamin A'],
    typical_serving_size_g: 150,
    tags: ['nutrient-dense', 'low-calorie', 'spring-vegetable'],
    allergens: [],
    dietTags: ['vegan']
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
    tags: ['flavor', 'immune-support', 'antimicrobial'],
    allergens: [],
    dietTags: ['vegan']
  },
  {
    id: 'ginger',
    name: 'Fresh Ginger',
    category: 'misc',
    macros: { protein: 1.8, carbs: 18, fat: 0.8, calories: 80, fiber: 2 },
    allowedMeals: ['breakfast', 'lunch', 'dinner'],
    key_micros: ['Gingerol', 'Potassium', 'Magnesium'],
    typical_serving_size_g: 5,
    tags: ['anti-inflammatory', 'digestive', 'flavor'],
    allergens: [],
    dietTags: ['vegan']
  },
  {
    id: 'lemon',
    name: 'Lemon (juice)',
    category: 'misc',
    macros: { protein: 0.4, carbs: 9, fat: 0.2, calories: 22, fiber: 0.3 },
    allowedMeals: ['breakfast', 'lunch', 'dinner'],
    key_micros: ['Vitamin C', 'Citric acid'],
    typical_serving_size_g: 30,
    tags: ['vitamin-c', 'flavor', 'alkalizing'],
    allergens: [],
    dietTags: ['vegan']
  },
  {
    id: 'herbs-mixed',
    name: 'Mixed Fresh Herbs',
    category: 'misc',
    macros: { protein: 3.7, carbs: 8, fat: 0.8, calories: 50, fiber: 3.5 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Vitamin K', 'Antioxidants', 'Essential oils'],
    typical_serving_size_g: 10,
    tags: ['flavor', 'antioxidant', 'zero-calorie'],
    allergens: [],
    dietTags: ['vegan']
  },
  {
    id: 'cinnamon',
    name: 'Cinnamon',
    category: 'misc',
    macros: { protein: 4, carbs: 81, fat: 1.2, calories: 247, fiber: 53 },
    allowedMeals: ['breakfast', 'snack'],
    key_micros: ['Manganese', 'Calcium', 'Iron'],
    typical_serving_size_g: 2,
    tags: ['blood-sugar', 'antioxidant', 'flavor'],
    allergens: [],
    dietTags: ['vegan']
  },
  // PHASE-2 EXPANSION
  //
  // Phase 2 (docs/recipe-phase2-plan.md §4): slot-scarcity-first expansion.
  // Targets: lunch/dinner fats, breakfast carbs, lunch/dinner fruits, then the
  // protein/vegetable/carb/flavour gaps.
  //
  // OPEN DECISION O-1 (deferred, deliberately NOT resolved here): these new
  // rows declare calories as 4P+4C+9F. The 47 pre-existing rows use USDA table
  // values that deviate from 4/4/9 (lemon -44%, cinnamon -30%) because the
  // engine rule ignores fibre and alcohol energy. No library-wide energy
  // tolerance is asserted, no existing value was changed, and the nutrition
  // engine was not touched. A per-ingredient energy test is a follow-up task.

  // PROTEINS
  {
    id: 'lean-beef',
    name: 'Lean Beef',
    category: 'protein',
    // calories derived via the canonical 4P+4C+9F rule (see engine.caloriesFromMacros)
    macros: { protein: 26.1, carbs: 0, fat: 11.8, calories: 210.6, fiber: 0 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Iron', 'Zinc', 'B12'],
    typical_serving_size_g: 100,
    tags: ['meat', 'staple'],
    allergens: [],
    dietTags: ['omnivore']
  },
  {
    id: 'pork-tenderloin',
    name: 'Pork Tenderloin',
    category: 'protein',
    // calories derived via the canonical 4P+4C+9F rule (see engine.caloriesFromMacros)
    macros: { protein: 26.2, carbs: 0, fat: 3.5, calories: 136.3, fiber: 0 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Thiamin', 'Selenium', 'Protein'],
    typical_serving_size_g: 100,
    tags: ['meat', 'lean'],
    allergens: [],
    dietTags: ['omnivore']
  },
  {
    id: 'cod',
    name: 'Cod',
    category: 'protein',
    // calories derived via the canonical 4P+4C+9F rule (see engine.caloriesFromMacros)
    macros: { protein: 17.8, carbs: 0, fat: 0.7, calories: 77.5, fiber: 0 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Iodine', 'Selenium', 'Omega-3'],
    typical_serving_size_g: 120,
    tags: ['fish', 'white-fish'],
    allergens: ['fish'],
    dietTags: ['pescatarian']
  },
  {
    id: 'mackerel',
    name: 'Mackerel',
    category: 'protein',
    // calories derived via the canonical 4P+4C+9F rule (see engine.caloriesFromMacros)
    macros: { protein: 19, carbs: 0, fat: 13.9, calories: 201.1, fiber: 0 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Omega-3', 'Vitamin D', 'Selenium'],
    typical_serving_size_g: 100,
    tags: ['fish', 'oily-fish'],
    allergens: ['fish'],
    dietTags: ['pescatarian']
  },
  {
    id: 'shrimp',
    name: 'Shrimp',
    category: 'protein',
    // calories derived via the canonical 4P+4C+9F rule (see engine.caloriesFromMacros)
    macros: { protein: 20.1, carbs: 0.2, fat: 0.3, calories: 83.9, fiber: 0 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Selenium', 'Iodine', 'Protein'],
    typical_serving_size_g: 120,
    tags: ['shellfish', 'quick'],
    allergens: ['shellfish'],
    dietTags: ['pescatarian']
  },
  {
    id: 'tempeh',
    name: 'Tempeh',
    category: 'protein',
    // calories derived via the canonical 4P+4C+9F rule (see engine.caloriesFromMacros)
    macros: { protein: 19.9, carbs: 7.6, fat: 10.8, calories: 207.2, fiber: 0 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Manganese', 'Riboflavin', 'Protein'],
    typical_serving_size_g: 80,
    tags: ['plant-protein', 'fermented'],
    allergens: ['soy'],
    dietTags: ['vegan']
  },
  {
    id: 'edamame',
    name: 'Edamame',
    category: 'protein',
    // calories derived via the canonical 4P+4C+9F rule (see engine.caloriesFromMacros)
    macros: { protein: 11.9, carbs: 8.9, fat: 5.2, calories: 130, fiber: 5.2 },
    allowedMeals: ['lunch', 'dinner', 'snack'],
    key_micros: ['Folate', 'Vitamin K', 'Protein'],
    typical_serving_size_g: 80,
    tags: ['plant-protein', 'snack'],
    allergens: ['soy'],
    dietTags: ['vegan']
  },
  {
    id: 'chickpeas',
    name: 'Chickpeas',
    category: 'protein',
    // calories derived via the canonical 4P+4C+9F rule (see engine.caloriesFromMacros)
    macros: { protein: 8.9, carbs: 27.4, fat: 2.6, calories: 168.6, fiber: 7.6 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Folate', 'Manganese', 'Fiber'],
    typical_serving_size_g: 80,
    tags: ['legume', 'vegan'],
    allergens: [],
    dietTags: ['vegan']
  },
  {
    id: 'whey-protein-powder',
    name: 'Whey Protein Powder',
    category: 'protein',
    // calories derived via the canonical 4P+4C+9F rule (see engine.caloriesFromMacros)
    macros: { protein: 80, carbs: 8, fat: 6, calories: 406, fiber: 1 },
    allowedMeals: ['breakfast', 'snack'],
    key_micros: ['Calcium', 'Leucine', 'Protein'],
    typical_serving_size_g: 30,
    tags: ['protein-powder', 'quick'],
    allergens: ['dairy'],
    dietTags: ['vegetarian']
  },
  {
    id: 'skyr',
    name: 'Skyr',
    category: 'protein',
    // calories derived via the canonical 4P+4C+9F rule (see engine.caloriesFromMacros)
    macros: { protein: 11, carbs: 4, fat: 0.2, calories: 61.8, fiber: 0 },
    allowedMeals: ['breakfast', 'snack'],
    key_micros: ['Calcium', 'Protein', 'Phosphorus'],
    typical_serving_size_g: 150,
    tags: ['dairy', 'high-protein'],
    allergens: ['dairy'],
    dietTags: ['vegetarian']
  },

  // CARBOHYDRATES
  {
    id: 'buckwheat',
    name: 'Buckwheat',
    category: 'carbohydrate',
    // calories derived via the canonical 4P+4C+9F rule (see engine.caloriesFromMacros)
    macros: { protein: 13.3, carbs: 71.5, fat: 3.4, calories: 369.8, fiber: 10 },
    allowedMeals: ['breakfast', 'lunch', 'dinner'],
    key_micros: ['Magnesium', 'Rutin', 'Fiber'],
    typical_serving_size_g: 40,
    tags: ['grain', 'gluten-free'],
    allergens: [],
    dietTags: ['vegan']
  },
  {
    id: 'rice-cakes',
    name: 'Rice Cakes',
    category: 'carbohydrate',
    // calories derived via the canonical 4P+4C+9F rule (see engine.caloriesFromMacros)
    macros: { protein: 8.2, carbs: 81.5, fat: 0.5, calories: 363.3, fiber: 4.2 },
    allowedMeals: ['breakfast', 'snack'],
    key_micros: ['Manganese', 'Selenium'],
    typical_serving_size_g: 18,
    tags: ['grain', 'gluten-free'],
    allergens: [],
    dietTags: ['vegan']
  },
  {
    id: 'granola',
    name: 'Granola',
    category: 'carbohydrate',
    // calories derived via the canonical 4P+4C+9F rule (see engine.caloriesFromMacros)
    macros: { protein: 10, carbs: 64, fat: 14, calories: 422, fiber: 7 },
    allowedMeals: ['breakfast', 'snack'],
    key_micros: ['Iron', 'Calcium', 'Fiber'],
    typical_serving_size_g: 45,
    tags: ['grain', 'breakfast'],
    allergens: ['gluten', 'nuts'],
    dietTags: ['vegan']
  },
  {
    id: 'english-muffin',
    name: 'English Muffin',
    category: 'carbohydrate',
    // calories derived via the canonical 4P+4C+9F rule (see engine.caloriesFromMacros)
    macros: { protein: 8.3, carbs: 49, fat: 1.8, calories: 245.4, fiber: 2 },
    allowedMeals: ['breakfast'],
    key_micros: ['Selenium', 'Iron', 'B vitamins'],
    typical_serving_size_g: 55,
    tags: ['bread', 'breakfast'],
    allergens: ['gluten'],
    dietTags: ['vegetarian']
  },
  {
    id: 'corn-tortilla',
    name: 'Corn Tortilla',
    category: 'carbohydrate',
    // calories derived via the canonical 4P+4C+9F rule (see engine.caloriesFromMacros)
    macros: { protein: 5.7, carbs: 44.6, fat: 6.3, calories: 257.9, fiber: 6.3 },
    allowedMeals: ['lunch', 'dinner', 'snack'],
    key_micros: ['Lutein', 'Fiber', 'Manganese'],
    typical_serving_size_g: 45,
    tags: ['wrap', 'gluten-free'],
    allergens: [],
    dietTags: ['vegan']
  },
  {
    id: 'couscous',
    name: 'Couscous',
    category: 'carbohydrate',
    // calories derived via the canonical 4P+4C+9F rule (see engine.caloriesFromMacros)
    macros: { protein: 12.8, carbs: 77.4, fat: 0.6, calories: 366.2, fiber: 1.4 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Selenium', 'Niacin', 'Fiber'],
    typical_serving_size_g: 60,
    tags: ['grain'],
    allergens: [],
    dietTags: ['vegan']
  },
  {
    id: 'bulgur-wheat',
    name: 'Bulgur Wheat',
    category: 'carbohydrate',
    // calories derived via the canonical 4P+4C+9F rule (see engine.caloriesFromMacros)
    macros: { protein: 12.3, carbs: 75.9, fat: 0.4, calories: 356.4, fiber: 4.5 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Fiber', 'Iron', 'Protein'],
    typical_serving_size_g: 60,
    tags: ['grain'],
    allergens: ['gluten'],
    dietTags: ['vegan']
  },
  {
    id: 'rice-noodles',
    name: 'Rice Noodles',
    category: 'carbohydrate',
    // calories derived via the canonical 4P+4C+9F rule (see engine.caloriesFromMacros)
    macros: { protein: 1.8, carbs: 80.2, fat: 0.2, calories: 329.8, fiber: 1 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Manganese', 'Iron'],
    typical_serving_size_g: 70,
    tags: ['grain', 'gluten-free'],
    allergens: [],
    dietTags: ['vegan']
  },

  // FATS
  {
    id: 'tahini',
    name: 'Tahini',
    category: 'fat',
    // calories derived via the canonical 4P+4C+9F rule (see engine.caloriesFromMacros)
    macros: { protein: 17, carbs: 21.2, fat: 53.8, calories: 637, fiber: 9.3 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Calcium', 'Iron', 'Copper'],
    typical_serving_size_g: 15,
    tags: ['sesame', 'spread', 'sauce'],
    allergens: ['sesame'],
    dietTags: ['vegan']
  },
  {
    id: 'sesame-seeds',
    name: 'Sesame Seeds',
    category: 'fat',
    // calories derived via the canonical 4P+4C+9F rule (see engine.caloriesFromMacros)
    macros: { protein: 18, carbs: 23.4, fat: 49.7, calories: 612.9, fiber: 11.8 },
    allowedMeals: ['lunch', 'dinner', 'breakfast', 'snack'],
    key_micros: ['Calcium', 'Iron', 'Magnesium'],
    typical_serving_size_g: 10,
    tags: ['seeds', 'topping'],
    allergens: ['sesame'],
    dietTags: ['vegan']
  },
  {
    id: 'pumpkin-seeds',
    name: 'Pumpkin Seeds',
    category: 'fat',
    // calories derived via the canonical 4P+4C+9F rule (see engine.caloriesFromMacros)
    macros: { protein: 30.2, carbs: 10.7, fat: 49, calories: 604.6, fiber: 6 },
    allowedMeals: ['lunch', 'dinner', 'snack'],
    key_micros: ['Magnesium', 'Zinc', 'Iron'],
    typical_serving_size_g: 15,
    tags: ['seeds', 'topping'],
    allergens: [],
    dietTags: ['vegan']
  },
  {
    id: 'kalamata-olives',
    name: 'Kalamata Olives',
    category: 'fat',
    // calories derived via the canonical 4P+4C+9F rule (see engine.caloriesFromMacros)
    macros: { protein: 0.8, carbs: 3.8, fat: 10.6, calories: 113.8, fiber: 2.8 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Monounsaturated fats', 'Vitamin E'],
    typical_serving_size_g: 20,
    tags: ['savory', 'salty'],
    allergens: [],
    dietTags: ['vegan']
  },
  {
    id: 'feta-cheese',
    name: 'Feta Cheese',
    category: 'fat',
    // calories derived via the canonical 4P+4C+9F rule (see engine.caloriesFromMacros)
    macros: { protein: 14.2, carbs: 4.1, fat: 21.3, calories: 264.9, fiber: 0 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Calcium', 'Sodium', 'Protein'],
    typical_serving_size_g: 30,
    tags: ['cheese', 'salty'],
    allergens: ['dairy'],
    dietTags: ['vegetarian']
  },
  {
    id: 'parmesan-cheese',
    name: 'Parmesan Cheese',
    category: 'fat',
    // calories derived via the canonical 4P+4C+9F rule (see engine.caloriesFromMacros)
    macros: { protein: 35.8, carbs: 3.2, fat: 25.8, calories: 388.2, fiber: 0 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Calcium', 'Protein', 'Phosphorus'],
    typical_serving_size_g: 10,
    tags: ['cheese', 'flavor'],
    allergens: ['dairy'],
    dietTags: ['vegetarian']
  },
  {
    id: 'cashews',
    name: 'Cashews',
    category: 'fat',
    // calories derived via the canonical 4P+4C+9F rule (see engine.caloriesFromMacros)
    macros: { protein: 18.2, carbs: 30.2, fat: 44.3, calories: 592.3, fiber: 3.3 },
    allowedMeals: ['lunch', 'dinner', 'snack'],
    key_micros: ['Magnesium', 'Copper', 'Zinc'],
    typical_serving_size_g: 20,
    tags: ['nuts', 'snack'],
    allergens: ['nuts'],
    dietTags: ['vegan']
  },

  // FRUITS
  {
    id: 'pomegranate-arils',
    name: 'Pomegranate Arils',
    category: 'fruit',
    // calories derived via the canonical 4P+4C+9F rule (see engine.caloriesFromMacros)
    macros: { protein: 1.7, carbs: 18.7, fat: 2.2, calories: 101.4, fiber: 4 },
    allowedMeals: ['lunch', 'dinner', 'snack'],
    key_micros: ['Polyphenols', 'Vitamin C', 'Fiber'],
    typical_serving_size_g: 60,
    tags: ['fruit', 'salty-sweet'],
    allergens: [],
    dietTags: ['vegan']
  },
  {
    id: 'pineapple',
    name: 'Pineapple',
    category: 'fruit',
    // calories derived via the canonical 4P+4C+9F rule (see engine.caloriesFromMacros)
    macros: { protein: 0.5, carbs: 13.1, fat: 0.1, calories: 55.3, fiber: 1.4 },
    allowedMeals: ['lunch', 'dinner', 'snack'],
    key_micros: ['Vitamin C', 'Manganese', 'Bromelain'],
    typical_serving_size_g: 100,
    tags: ['fruit', 'grilled'],
    allergens: [],
    dietTags: ['vegan']
  },
  {
    id: 'pear',
    name: 'Pear',
    category: 'fruit',
    // calories derived via the canonical 4P+4C+9F rule (see engine.caloriesFromMacros)
    macros: { protein: 0.4, carbs: 15.2, fat: 0.1, calories: 63.3, fiber: 3.1 },
    allowedMeals: ['breakfast', 'lunch', 'dinner', 'snack'],
    key_micros: ['Fiber', 'Vitamin C', 'Copper'],
    typical_serving_size_g: 140,
    tags: ['fruit'],
    allergens: [],
    dietTags: ['vegan']
  },
  {
    id: 'melon',
    name: 'Melon',
    category: 'fruit',
    // calories derived via the canonical 4P+4C+9F rule (see engine.caloriesFromMacros)
    macros: { protein: 0.6, carbs: 8.1, fat: 0.2, calories: 36.6, fiber: 0.8 },
    allowedMeals: ['lunch', 'dinner', 'snack'],
    key_micros: ['Hydration', 'Vitamin C', 'Potassium'],
    typical_serving_size_g: 120,
    tags: ['fruit', 'refreshing'],
    allergens: [],
    dietTags: ['vegan']
  },
  {
    id: 'dates',
    name: 'Medjool Dates',
    category: 'fruit',
    // calories derived via the canonical 4P+4C+9F rule (see engine.caloriesFromMacros)
    macros: { protein: 1.8, carbs: 75, fat: 0.2, calories: 309, fiber: 6.7 },
    allowedMeals: ['breakfast', 'snack'],
    key_micros: ['Potassium', 'Magnesium', 'Fiber'],
    typical_serving_size_g: 30,
    tags: ['fruit', 'energy'],
    allergens: [],
    dietTags: ['vegan']
  },
  {
    id: 'kiwi',
    name: 'Kiwi Fruit',
    category: 'fruit',
    // calories derived via the canonical 4P+4C+9F rule (see engine.caloriesFromMacros)
    macros: { protein: 1.1, carbs: 14.7, fat: 0.5, calories: 67.7, fiber: 3 },
    allowedMeals: ['breakfast', 'snack'],
    key_micros: ['Vitamin C', 'Vitamin K', 'Fiber'],
    typical_serving_size_g: 70,
    tags: ['fruit'],
    allergens: [],
    dietTags: ['vegan']
  },

  // VEGETABLES
  {
    id: 'yellow-onion',
    name: 'Yellow Onion',
    category: 'vegetable',
    // calories derived via the canonical 4P+4C+9F rule (see engine.caloriesFromMacros)
    macros: { protein: 1.1, carbs: 9.3, fat: 0.1, calories: 42.5, fiber: 1.7 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Quercetin', 'Vitamin C', 'Fiber'],
    typical_serving_size_g: 80,
    tags: ['aromatic', 'base'],
    allergens: [],
    dietTags: ['vegan']
  },
  {
    id: 'mushrooms',
    name: 'Button Mushrooms',
    category: 'vegetable',
    // calories derived via the canonical 4P+4C+9F rule (see engine.caloriesFromMacros)
    macros: { protein: 3.1, carbs: 3.3, fat: 0.3, calories: 28.3, fiber: 1 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Riboflavin', 'Selenium', 'Vitamin D'],
    typical_serving_size_g: 80,
    tags: ['umami', 'base'],
    allergens: [],
    dietTags: ['vegan']
  },
  {
    id: 'eggplant',
    name: 'Eggplant',
    category: 'vegetable',
    // calories derived via the canonical 4P+4C+9F rule (see engine.caloriesFromMacros)
    macros: { protein: 1, carbs: 5.9, fat: 0.2, calories: 29.4, fiber: 3 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Manganese', 'Folate', 'Fiber'],
    typical_serving_size_g: 100,
    tags: ['vegetable', 'staple'],
    allergens: [],
    dietTags: ['vegan']
  },
  {
    id: 'green-beans',
    name: 'Green Beans',
    category: 'vegetable',
    // calories derived via the canonical 4P+4C+9F rule (see engine.caloriesFromMacros)
    macros: { protein: 1.8, carbs: 7, fat: 0.2, calories: 37, fiber: 2.7 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Vitamin K', 'Folate', 'Fiber'],
    typical_serving_size_g: 100,
    tags: ['vegetable'],
    allergens: [],
    dietTags: ['vegan']
  },
  {
    id: 'red-cabbage',
    name: 'Red Cabbage',
    category: 'vegetable',
    // calories derived via the canonical 4P+4C+9F rule (see engine.caloriesFromMacros)
    macros: { protein: 1.4, carbs: 7.4, fat: 0.2, calories: 37, fiber: 2.1 },
    allowedMeals: ['lunch', 'dinner', 'snack'],
    key_micros: ['Vitamin C', 'Vitamin K', 'Fiber'],
    typical_serving_size_g: 80,
    tags: ['slaw', 'colorful'],
    allergens: [],
    dietTags: ['vegan']
  },
  {
    id: 'peas',
    name: 'Green Peas',
    category: 'vegetable',
    // calories derived via the canonical 4P+4C+9F rule (see engine.caloriesFromMacros)
    macros: { protein: 5.4, carbs: 15.6, fat: 0.4, calories: 87.6, fiber: 5.7 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Vitamin K', 'Protein', 'Fiber'],
    typical_serving_size_g: 80,
    tags: ['legume', 'vegetable'],
    allergens: [],
    dietTags: ['vegan']
  },
  {
    id: 'mixed-leaf-salad',
    name: 'Mixed Leaf Salad',
    category: 'vegetable',
    // calories derived via the canonical 4P+4C+9F rule (see engine.caloriesFromMacros)
    macros: { protein: 1.4, carbs: 2.9, fat: 0.2, calories: 19, fiber: 1.8 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Vitamin K', 'Folate', 'Vitamin A'],
    typical_serving_size_g: 50,
    tags: ['salad', 'base'],
    allergens: [],
    dietTags: ['vegan']
  },
  {
    id: 'sweetcorn',
    name: 'Sweetcorn',
    category: 'vegetable',
    // calories derived via the canonical 4P+4C+9F rule (see engine.caloriesFromMacros)
    macros: { protein: 3.3, carbs: 22.8, fat: 1.4, calories: 117, fiber: 2 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Vitamin C', 'Lutein', 'Fiber'],
    typical_serving_size_g: 100,
    tags: ['vegetable'],
    allergens: [],
    dietTags: ['vegan']
  },
  {
    id: 'brussels-sprouts',
    name: 'Brussels Sprouts',
    category: 'vegetable',
    // calories derived via the canonical 4P+4C+9F rule (see engine.caloriesFromMacros)
    macros: { protein: 3.4, carbs: 9, fat: 0.3, calories: 52.3, fiber: 3.8 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Vitamin C', 'Vitamin K', 'Fiber'],
    typical_serving_size_g: 100,
    tags: ['cruciferous'],
    allergens: [],
    dietTags: ['vegan']
  },
  {
    id: 'beetroot',
    name: 'Beetroot',
    category: 'vegetable',
    // calories derived via the canonical 4P+4C+9F rule (see engine.caloriesFromMacros)
    macros: { protein: 1.6, carbs: 10, fat: 0.2, calories: 48.2, fiber: 2.8 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Nitrates', 'Folate', 'Potassium'],
    typical_serving_size_g: 100,
    tags: ['vegetable', 'colorful'],
    allergens: [],
    dietTags: ['vegan']
  },

  // MISC ESSENTIALS
  {
    id: 'cumin',
    name: 'Cumin',
    category: 'misc',
    // calories derived via the canonical 4P+4C+9F rule (see engine.caloriesFromMacros)
    macros: { protein: 12, carbs: 44, fat: 22, calories: 422, fiber: 11 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Iron', 'Magnesium'],
    typical_serving_size_g: 2,
    tags: ['spice', 'aromatic'],
    allergens: [],
    dietTags: ['vegan']
  },
  {
    id: 'smoked-paprika',
    name: 'Smoked Paprika',
    category: 'misc',
    // calories derived via the canonical 4P+4C+9F rule (see engine.caloriesFromMacros)
    macros: { protein: 14, carbs: 54, fat: 13, calories: 389, fiber: 35 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Vitamin A', 'Antioxidants'],
    typical_serving_size_g: 2,
    tags: ['spice', 'color'],
    allergens: [],
    dietTags: ['vegan']
  },
  {
    id: 'chilli-flakes',
    name: 'Chilli Flakes',
    category: 'misc',
    // calories derived via the canonical 4P+4C+9F rule (see engine.caloriesFromMacros)
    macros: { protein: 17, carbs: 50, fat: 14, calories: 394, fiber: 30 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Vitamin C', 'Capsaicin'],
    typical_serving_size_g: 1,
    tags: ['spice', 'heat'],
    allergens: [],
    dietTags: ['vegan']
  },
  {
    id: 'fresh-coriander',
    name: 'Fresh Coriander',
    category: 'misc',
    // calories derived via the canonical 4P+4C+9F rule (see engine.caloriesFromMacros)
    macros: { protein: 2.1, carbs: 3.7, fat: 0.5, calories: 27.7, fiber: 2.8 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Vitamin K', 'Antioxidants'],
    typical_serving_size_g: 5,
    tags: ['herb', 'fresh'],
    allergens: [],
    dietTags: ['vegan']
  },
  {
    id: 'fresh-basil',
    name: 'Fresh Basil',
    category: 'misc',
    // calories derived via the canonical 4P+4C+9F rule (see engine.caloriesFromMacros)
    macros: { protein: 3.2, carbs: 2.7, fat: 0.6, calories: 29, fiber: 1.6 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Vitamin K', 'Vitamin C'],
    typical_serving_size_g: 5,
    tags: ['herb', 'fresh'],
    allergens: [],
    dietTags: ['vegan']
  },
  {
    id: 'dried-oregano',
    name: 'Dried Oregano',
    category: 'misc',
    // calories derived via the canonical 4P+4C+9F rule (see engine.caloriesFromMacros)
    macros: { protein: 9, carbs: 68.9, fat: 4.3, calories: 350.3, fiber: 42 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Iron', 'Manganese'],
    typical_serving_size_g: 2,
    tags: ['herb', 'dried'],
    allergens: [],
    dietTags: ['vegan']
  },
  {
    id: 'soy-sauce',
    name: 'Soy Sauce',
    category: 'misc',
    // calories derived via the canonical 4P+4C+9F rule (see engine.caloriesFromMacros)
    macros: { protein: 8.1, carbs: 4.9, fat: 0.6, calories: 57.4, fiber: 0.8 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Sodium', 'Manganese'],
    typical_serving_size_g: 15,
    tags: ['umami', 'sauce'],
    allergens: ['soy', 'gluten'],
    dietTags: ['vegan']
  },
  {
    id: 'balsamic-vinegar',
    name: 'Balsamic Vinegar',
    category: 'misc',
    // calories derived via the canonical 4P+4C+9F rule (see engine.caloriesFromMacros)
    macros: { protein: 0.5, carbs: 33, fat: 0, calories: 134, fiber: 0 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Antioxidants', 'Potassium'],
    typical_serving_size_g: 15,
    tags: ['acid', 'dressing'],
    allergens: [],
    dietTags: ['vegan']
  },
  {
    id: 'dijon-mustard',
    name: 'Dijon Mustard',
    category: 'misc',
    // calories derived via the canonical 4P+4C+9F rule (see engine.caloriesFromMacros)
    macros: { protein: 4.4, carbs: 14, fat: 3.3, calories: 103.3, fiber: 3.3 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Sodium', 'Vitamin C'],
    typical_serving_size_g: 10,
    tags: ['condiment', 'sharp'],
    allergens: [],
    dietTags: ['vegan']
  },
  {
    id: 'curry-powder',
    name: 'Curry Powder',
    category: 'misc',
    // calories derived via the canonical 4P+4C+9F rule (see engine.caloriesFromMacros)
    macros: { protein: 14, carbs: 33, fat: 14, calories: 314, fiber: 33 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Iron', 'Manganese'],
    typical_serving_size_g: 2,
    tags: ['spice', 'blend'],
    allergens: [],
    dietTags: ['vegan']
  },
  {
    id: 'vegetable-stock',
    name: 'Vegetable Stock',
    category: 'misc',
    // calories derived via the canonical 4P+4C+9F rule (see engine.caloriesFromMacros)
    macros: { protein: 1, carbs: 8, fat: 0.5, calories: 40.5, fiber: 1 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Sodium', 'Potassium'],
    typical_serving_size_g: 250,
    tags: ['liquid', 'base'],
    allergens: [],
    dietTags: ['vegan']
  },
  {
    id: 'tomato-paste',
    name: 'Tomato Paste',
    category: 'misc',
    // calories derived via the canonical 4P+4C+9F rule (see engine.caloriesFromMacros)
    macros: { protein: 4.3, carbs: 18.9, fat: 0.5, calories: 97.3, fiber: 4.3 },
    allowedMeals: ['lunch', 'dinner'],
    key_micros: ['Lycopene', 'Vitamin C'],
    typical_serving_size_g: 20,
    tags: ['umami', 'sauce'],
    allergens: [],
    dietTags: ['vegan']
  },

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

// Helper function to calculate macros for a given serving size.
// IMPORTANT (data-source divergence fix): ingredient `macros.calories` is
// treated as legacy source metadata. The returned `calories` is ALWAYS derived
// from the scaled macro grams through the canonical engine rule
// (protein*4 + carbs*4 + fat*9) — never from the stored `macros.calories` field.
export function calculateMacros(ingredient: IngredientData, servingSize: number) {
  const ratio = servingSize / 100;
  const scaled = {
    protein: ingredient.macros.protein * ratio,
    carbs: ingredient.macros.carbs * ratio,
    fat: ingredient.macros.fat * ratio,
    fiber: ingredient.macros.fiber !== undefined ? ingredient.macros.fiber * ratio : undefined,
  };
  return {
    protein: Math.round(scaled.protein * 10) / 10,
    carbs: Math.round(scaled.carbs * 10) / 10,
    fat: Math.round(scaled.fat * 10) / 10,
    calories: Math.round(
      caloriesFromMacros({ protein: scaled.protein, carbs: scaled.carbs, fat: scaled.fat })
    ),
    fiber: scaled.fiber !== undefined ? Math.round(scaled.fiber * 10) / 10 : undefined,
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