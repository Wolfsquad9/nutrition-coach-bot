import { coreIngredients, type IngredientData, calculateMacros, type MealTimeType } from '@/data/ingredientDatabase';
import { Recipe, Ingredient, Macros } from '@/types';

export type MealType = MealTimeType;

// Target macros per meal type (approximate)
const MEAL_MACRO_TARGETS: Record<MealType, { calorieRatio: number; proteinRatio: number }> = {
  breakfast: { calorieRatio: 0.25, proteinRatio: 0.25 },
  lunch: { calorieRatio: 0.35, proteinRatio: 0.35 },
  dinner: { calorieRatio: 0.30, proteinRatio: 0.30 },
  snack: { calorieRatio: 0.10, proteinRatio: 0.10 },
};

// Recipe name templates by meal type
const RECIPE_TEMPLATES: Record<MealType, string[]> = {
  breakfast: [
    'Power {protein} Bowl',
    'Energizing {protein} with {carb}',
    '{protein} & {fruit} Morning Boost',
    'Healthy {carb} Delight',
  ],
  lunch: [
    '{protein} & {carb} Power Plate',
    'Grilled {protein} with {vegetable}',
    'Mediterranean {protein} Bowl',
    '{protein} Salad with {vegetable}',
  ],
  dinner: [
    'Savory {protein} with {carb}',
    'Roasted {protein} & {vegetable}',
    '{protein} Stir-fry with {vegetable}',
    'Herb-Crusted {protein} Dinner',
  ],
  snack: [
    '{protein} & {fruit} Bites',
    'Quick {protein} Snack',
    '{fat} Energy Mix',
    'Protein-Packed {protein}',
  ],
};

export interface GeneratedRecipe extends Recipe {
  suitableFor: MealType;
  selectedIngredients: IngredientData[];
}

function getSuitableIngredients(
  selectedFoods: string[],
  mealType: MealType
): IngredientData[] {
  return coreIngredients.filter(ing => {
    const isSelected = selectedFoods.includes(ing.id);
    const isSuitable = ing.allowedMeals.includes(mealType);
    return isSelected && isSuitable;
  });
}

function selectBalancedIngredients(
  suitableIngredients: IngredientData[],
  mealType: MealType
): IngredientData[] {
  const selected: IngredientData[] = [];
  
  // Must have protein
  const proteins = suitableIngredients.filter(ing => ing.category === 'protein');
  if (proteins.length > 0) {
    selected.push(proteins[Math.floor(Math.random() * proteins.length)]);
  }
  
  // Add carb for main meals
  if (mealType !== 'snack') {
    const carbs = suitableIngredients.filter(ing => ing.category === 'carbohydrate');
    if (carbs.length > 0) {
      selected.push(carbs[Math.floor(Math.random() * carbs.length)]);
    }
  }
  
  // Add vegetable for lunch/dinner
  if (mealType === 'lunch' || mealType === 'dinner') {
    const vegetables = suitableIngredients.filter(ing => ing.category === 'vegetable');
    if (vegetables.length > 0) {
      const numVeggies = Math.min(2, vegetables.length);
      const shuffled = vegetables.sort(() => Math.random() - 0.5);
      selected.push(...shuffled.slice(0, numVeggies));
    }
  }
  
  // Add fruit for breakfast/snack
  if (mealType === 'breakfast' || mealType === 'snack') {
    const fruits = suitableIngredients.filter(ing => ing.category === 'fruit');
    if (fruits.length > 0) {
      selected.push(fruits[Math.floor(Math.random() * fruits.length)]);
    }
  }
  
  // Add fat
  const fats = suitableIngredients.filter(ing => ing.category === 'fat');
  if (fats.length > 0) {
    selected.push(fats[Math.floor(Math.random() * fats.length)]);
  }
  
  // Add misc/seasoning
  const misc = suitableIngredients.filter(ing => ing.category === 'misc');
  if (misc.length > 0 && (mealType === 'lunch' || mealType === 'dinner')) {
    selected.push(misc[Math.floor(Math.random() * misc.length)]);
  }
  
  return selected;
}

function generateRecipeName(
  ingredients: IngredientData[],
  mealType: MealType
): string {
  const templates = RECIPE_TEMPLATES[mealType];
  const template = templates[Math.floor(Math.random() * templates.length)];
  
  const protein = ingredients.find(i => i.category === 'protein')?.name || 'Protein';
  const carb = ingredients.find(i => i.category === 'carbohydrate')?.name || 'Grains';
  const vegetable = ingredients.find(i => i.category === 'vegetable')?.name || 'Vegetables';
  const fruit = ingredients.find(i => i.category === 'fruit')?.name || 'Fruits';
  const fat = ingredients.find(i => i.category === 'fat')?.name || 'Nuts';
  
  return template
    .replace('{protein}', protein.split(' ')[0])
    .replace('{carb}', carb.split(' ')[0])
    .replace('{vegetable}', vegetable.split(' ')[0])
    .replace('{fruit}', fruit.split(' ')[0])
    .replace('{fat}', fat.split(' ')[0]);
}

function generateInstructions(
  ingredients: IngredientData[],
  mealType: MealType
): string[] {
  const instructions: string[] = [];
  const protein = ingredients.find(i => i.category === 'protein');
  const carb = ingredients.find(i => i.category === 'carbohydrate');
  const vegetables = ingredients.filter(i => i.category === 'vegetable');
  
  if (mealType === 'breakfast') {
    instructions.push('Prepare all ingredients and measure portions.');
    if (carb) instructions.push(`Cook ${carb.name.toLowerCase()} according to package directions.`);
    if (protein) instructions.push(`Prepare ${protein.name.toLowerCase()} (scramble, poach, or as desired).`);
    instructions.push('Combine all ingredients in a bowl.');
    instructions.push('Season to taste and serve warm.');
  } else if (mealType === 'snack') {
    instructions.push('Gather all ingredients.');
    instructions.push('Combine in a small bowl or container.');
    instructions.push('Mix well and enjoy immediately or refrigerate.');
  } else {
    instructions.push('Prep all vegetables by washing and cutting into bite-sized pieces.');
    if (protein) instructions.push(`Season ${protein.name.toLowerCase()} with salt, pepper, and preferred spices.`);
    if (protein) instructions.push(`Cook ${protein.name.toLowerCase()} in a pan over medium-high heat until done.`);
    if (carb) instructions.push(`Meanwhile, prepare ${carb.name.toLowerCase()} according to directions.`);
    if (vegetables.length > 0) {
      instructions.push(`Sauté vegetables until tender-crisp, about 5-7 minutes.`);
    }
    instructions.push('Plate the protein with carbs and vegetables.');
    instructions.push('Drizzle with olive oil if desired and serve hot.');
  }
  
  return instructions;
}

function calculateTotalMacros(ingredients: IngredientData[]): Macros {
  return ingredients.reduce((total, ing) => {
    const macros = calculateMacros(ing, ing.typical_serving_size_g);
    return {
      calories: total.calories + macros.calories,
      protein: total.protein + macros.protein,
      carbs: total.carbs + macros.carbs,
      fat: total.fat + macros.fat,
      fiber: (total.fiber || 0) + (macros.fiber || 0),
    };
  }, { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
}

export function generateRecipe(
  selectedFoods: string[],
  mealType: MealType
): GeneratedRecipe {
  // Filter for suitable ingredients
  const suitableIngredients = getSuitableIngredients(selectedFoods, mealType);
  
  if (suitableIngredients.length === 0) {
    throw new Error(`No suitable ingredients selected for ${mealType}. Please select foods that are appropriate for this meal type.`);
  }
  
  // Select balanced combination
  const selectedIngredients = selectBalancedIngredients(suitableIngredients, mealType);
  
  if (selectedIngredients.length === 0) {
    throw new Error(`Could not build a balanced recipe. Please select more variety of ingredients.`);
  }
  
  // Generate recipe details
  const name = generateRecipeName(selectedIngredients, mealType);
  const instructions = generateInstructions(selectedIngredients, mealType);
  const totalMacros = calculateTotalMacros(selectedIngredients);
  
  // Convert to Recipe format
  const recipeIngredients: Ingredient[] = selectedIngredients.map(ing => ({
    id: ing.id,
    name: ing.name,
    amount: ing.typical_serving_size_g,
    unit: 'g' as const,
    category: ing.category === 'carbohydrate' ? 'carb' : ing.category === 'misc' ? 'spice' : ing.category as any,
    macrosPer100g: {
      calories: ing.macros.calories,
      protein: ing.macros.protein,
      carbs: ing.macros.carbs,
      fat: ing.macros.fat,
      fiber: ing.macros.fiber,
    },
  }));
  
  const recipe: GeneratedRecipe = {
    id: `generated-${Date.now()}`,
    name,
    category: mealType,
    prepTime: mealType === 'snack' ? 5 : 10,
    cookTime: mealType === 'snack' ? 0 : mealType === 'breakfast' ? 10 : 20,
    servings: 1,
    ingredients: recipeIngredients,
    instructions,
    macrosPerServing: {
      calories: Math.round(totalMacros.calories),
      protein: Math.round(totalMacros.protein),
      carbs: Math.round(totalMacros.carbs),
      fat: Math.round(totalMacros.fat),
      fiber: Math.round(totalMacros.fiber || 0),
    },
    tags: selectedIngredients.flatMap(i => i.tags).slice(0, 5),
    dietTypes: determineDietTypes(selectedIngredients),
    allergens: determineAllergens(selectedIngredients),
    equipment: determineEquipment(mealType),
    difficulty: mealType === 'snack' ? 'easy' : 'medium',
    suitableFor: mealType,
    selectedIngredients,
  };
  
  return recipe;
}

function determineDietTypes(ingredients: IngredientData[]): string[] {
  const dietTypes: string[] = [];
  const hasAnimalProtein = ingredients.some(i => 
    ['chicken-breast', 'salmon', 'turkey-breast', 'tuna'].includes(i.id)
  );
  const hasDairy = ingredients.some(i => 
    ['greek-yogurt', 'cottage-cheese'].includes(i.id)
  );
  const hasEggs = ingredients.some(i => i.id === 'eggs');
  
  if (!hasAnimalProtein && !hasDairy && !hasEggs) {
    dietTypes.push('vegan');
  } else if (!hasAnimalProtein) {
    dietTypes.push('vegetarian');
  }
  
  const isGlutenFree = !ingredients.some(i => 
    ['whole-wheat-pasta', 'whole-wheat-bread', 'barley', 'oats'].includes(i.id)
  );
  if (isGlutenFree) dietTypes.push('gluten-free');
  
  return dietTypes;
}

function determineAllergens(ingredients: IngredientData[]): string[] {
  const allergens: string[] = [];
  
  if (ingredients.some(i => i.id === 'eggs')) allergens.push('eggs');
  if (ingredients.some(i => ['greek-yogurt', 'cottage-cheese'].includes(i.id))) allergens.push('dairy');
  if (ingredients.some(i => ['almonds', 'walnuts', 'peanut-butter'].includes(i.id))) allergens.push('nuts');
  if (ingredients.some(i => ['salmon', 'tuna'].includes(i.id))) allergens.push('fish');
  if (ingredients.some(i => i.id === 'tofu')) allergens.push('soy');
  if (ingredients.some(i => ['whole-wheat-pasta', 'whole-wheat-bread', 'barley'].includes(i.id))) allergens.push('gluten');
  
  return allergens;
}

function determineEquipment(mealType: MealType): string[] {
  switch (mealType) {
    case 'breakfast':
      return ['stove', 'pan', 'bowl'];
    case 'lunch':
    case 'dinner':
      return ['stove', 'pan', 'cutting board', 'knife'];
    case 'snack':
      return ['bowl'];
    default:
      return ['bowl'];
  }
}

export function getMealSuitability(ingredientId: string): MealType[] {
  const ingredient = coreIngredients.find(ing => ing.id === ingredientId);
  return ingredient?.allowedMeals || ['lunch', 'dinner'];
}

// Macro allocation per meal (must sum to 1.0)
const MEAL_MACRO_SPLIT: Record<MealType, number> = {
  breakfast: 0.25,
  lunch: 0.35,
  dinner: 0.30,
  snack: 0.10,
};

export interface MacroTargets {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
}

export interface FullDayMealPlanResult {
  dailyPlan: import('@/data/ingredientDatabase').DailyMealPlan;
  totalMacros: Macros;
  targetMacros: MacroTargets;
  variance: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
}

/**
 * Generates a complete daily meal plan with breakfast, lunch, dinner, and snack.
 * Uses allowedMeals on ingredients to filter per meal and allocates macros using the split.
 */
export function generateFullDayMealPlan(
  selectedFoods: string[],
  macroTargets: MacroTargets
): FullDayMealPlanResult {
  const mealTypes: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
  
  const dailyPlan: import('@/data/ingredientDatabase').DailyMealPlan = {
    breakfast: { ingredients: [], recipeText: '', macros: { protein: 0, carbs: 0, fat: 0, calories: 0 } },
    lunch: { ingredients: [], recipeText: '', macros: { protein: 0, carbs: 0, fat: 0, calories: 0 } },
    dinner: { ingredients: [], recipeText: '', macros: { protein: 0, carbs: 0, fat: 0, calories: 0 } },
    snack: { ingredients: [], recipeText: '', macros: { protein: 0, carbs: 0, fat: 0, calories: 0 } },
  };

  const totalMacros: Macros = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };

  for (const mealType of mealTypes) {
    const mealSplit = MEAL_MACRO_SPLIT[mealType];
    
    // Calculate target macros for this meal
    const mealTargetCalories = Math.round(macroTargets.calories * mealSplit);
    const mealTargetProtein = Math.round(macroTargets.protein * mealSplit);
    
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

  // Calculate variance from targets
  const variance = {
    calories: totalMacros.calories - macroTargets.calories,
    protein: totalMacros.protein - macroTargets.protein,
    carbs: totalMacros.carbs - macroTargets.carbs,
    fat: totalMacros.fat - macroTargets.fat,
  };

  return {
    dailyPlan,
    totalMacros,
    targetMacros: macroTargets,
    variance,
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
