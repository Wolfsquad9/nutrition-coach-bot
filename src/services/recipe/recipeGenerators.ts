import { type IngredientData } from '@/data/ingredientDatabase';
import { type Ingredient } from '@/types';
import { createSeededRng, type Rng } from '@/utils/random';
import { type MealType, RECIPE_TEMPLATES } from './constants';
import { type GeneratedRecipe, type RecipeGenerationOptions } from './types';
import { selectBalancedIngredients } from './selectors';
import { selectArchetypeForMeal } from './archetypeSelection';
import { canFallBackToLegacy } from './activation';
import { getSuitableIngredients, determineDietTypes, determineAllergens, determineEquipment } from './ingredientUtils';
import { calculateTotalMacros } from './nutritionCalculations';

export function generateRecipeName(
  ingredients: IngredientData[],
  mealType: MealType,
  rng: Rng
): string {
  const templates = RECIPE_TEMPLATES[mealType];
  const template = templates[rng.int(templates.length)];
  
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

export function generateInstructions(
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

export function generateRecipe(
  selectedFoods: string[],
  mealType: MealType,
  seed: string = `recipe-${mealType}`,
  options?: RecipeGenerationOptions
): GeneratedRecipe {
  // Deterministic per (selectedFoods, mealType, seed) — same inputs = same recipe.
  // This is important: "regenerate plan" must not silently change grocery lists
  // when nothing has changed.
  const rng = createSeededRng(`${seed}-${selectedFoods.join('|')}`);

  // Filter for suitable ingredients. `options.allowedIngredientIds` (from the
  // eligibility boundary) is applied here so eligibility cannot be bypassed.
  const suitableIngredients = getSuitableIngredients(selectedFoods, mealType, options);

  if (suitableIngredients.length === 0) {
    throw new Error(`No suitable ingredients selected for ${mealType}. Please select foods that are appropriate for this meal type.`);
  }

  // Select the ingredient combination.
  //
  // LEGACY PATH (default, `archetypeGeneration` falsy): the original fixed
  // protein+carb+veg+fruit+fat+misc heuristic. The rng is consumed in exactly the
  // same order as before, so output is unchanged for the same inputs/seed.
  //
  // ARCHETYPE PATH (opt-in): the archetype catalogue picks the meal's structure
  // and resolves its required roles from the SAME eligible pool. It cannot widen
  // eligibility — `suitableIngredients` is already `allowedIngredientIds ∩
  // meal-slot`.
  //
  // Phase 4 fallback: when the eligible pool cannot satisfy ANY archetype's
  // required roles we degrade to the legacy balanced selector over that very
  // same pool instead of throwing. Throwing here surfaced upstream as an EMPTY
  // production meal, which would have been a regression the moment archetypes
  // were activated. The fallback never partially fills an archetype, never
  // substitutes another archetype's structure, and uses the identical
  // `allowedIngredientIds` — the pool it selects from is already the
  // allow-list. The resulting recipe carries no `archetypeId`, which is how
  // callers can tell a degraded meal from a structured one.
  let selectedIngredients: IngredientData[];
  let archetypeId: string | undefined;

  if (options?.archetypeGeneration) {
    const selection = selectArchetypeForMeal(
      suitableIngredients,
      mealType,
      options.dietType,
      rng
    );

    if (selection) {
      selectedIngredients = selection.ingredients;
      archetypeId = selection.archetype.id;
    } else if (canFallBackToLegacy(suitableIngredients)) {
      selectedIngredients = selectBalancedIngredients(suitableIngredients, mealType, rng);
    } else {
      // No eligible ingredients at all: neither path can build a meal, so the
      // original empty-pool error still applies.
      throw new Error(
        `No suitable ingredients selected for ${mealType}. Please select foods that are appropriate for this meal type.`
      );
    }
  } else {
    selectedIngredients = selectBalancedIngredients(suitableIngredients, mealType, rng);
  }

  if (selectedIngredients.length === 0) {
    throw new Error(`Could not build a balanced recipe. Please select more variety of ingredients.`);
  }

  // Generate recipe details
  const name = generateRecipeName(selectedIngredients, mealType, rng);
  const instructions = generateInstructions(selectedIngredients, mealType);
  const totalMacros = calculateTotalMacros(selectedIngredients);
  
  // Convert to Recipe format
  const recipeIngredients: Ingredient[] = selectedIngredients.map(ing => ({
    id: ing.id,
    name: ing.name,
    amount: ing.typical_serving_size_g,
    unit: 'g' as const,
    category: ing.category === 'carbohydrate' ? 'carb' : ing.category === 'misc' ? 'spice' : ing.category as 'protein' | 'carb' | 'fat' | 'vegetable' | 'fruit' | 'spice',
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
    ...(archetypeId ? { archetypeId } : {}),
  };
  
  return recipe;
}
