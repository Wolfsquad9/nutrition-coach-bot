import { type IngredientData } from '@/data/ingredientDatabase';
import { type MealType } from './constants';

/**
 * Generates a deterministic recipe name based on main ingredients
 */
export function generateDeterministicRecipeName(
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
export function generateDeterministicInstructions(
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
export function generateFinalRecipeText(
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
 * Generates formatted recipe text for a meal
 */
export function generateMealRecipeText(
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