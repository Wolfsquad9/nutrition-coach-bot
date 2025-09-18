/**
 * Plan Generation Engine
 * Génère automatiquement des plans nutrition et entraînement personnalisés
 */

import { Client, NutritionPlan, TrainingPlan, CompletePlan, MealPlan, Meal, Recipe, WorkoutSession, Exercise, GroceryItem, RecipeServing } from '@/types';
import { calculateNutritionMetrics, distributeMacrosAcrossMeals } from './calculations';
import { sampleRecipes, sampleExercises } from '@/data/sampleData';

/**
 * Filtre les recettes selon les préférences et intolérances du client
 */
function filterRecipesForClient(recipes: Recipe[], client: Client): Recipe[] {
  return recipes.filter(recipe => {
    // Exclure si contient des allergènes
    if (client.allergies.some(allergy => 
      recipe.allergens.some(allergen => 
        allergen.toLowerCase().includes(allergy.toLowerCase())
      )
    )) {
      return false;
    }
    
    // Exclure si contient des intolérances
    if (client.intolerances.some(intolerance => 
      recipe.allergens.some(allergen => 
        allergen.toLowerCase().includes(intolerance.toLowerCase())
      )
    )) {
      return false;
    }
    
    // Exclure si contient des aliments non aimés
    if (client.dislikedFoods.some(disliked => 
      recipe.ingredients.some(ing => 
        ing.name.toLowerCase().includes(disliked.toLowerCase())
      )
    )) {
      return false;
    }
    
    // Vérifier compatibilité avec le régime
    if (client.dietType === 'vegan' && !recipe.dietTypes.includes('vegan')) {
      return false;
    }
    if (client.dietType === 'vegetarian' && !recipe.dietTypes.includes('vegetarian')) {
      return false;
    }
    if (client.dietType === 'pescatarian' && !recipe.dietTypes.includes('pescatarian')) {
      return false;
    }
    
    return true;
  });
}

/**
 * Sélectionne les meilleures recettes pour matcher les macros cibles
 */
function selectRecipesForMeal(
  availableRecipes: Recipe[],
  targetMacros: { calories: number; protein: number; carbs: number; fat: number },
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack'
): RecipeServing[] {
  // Filtrer par type de repas
  const mealRecipes = availableRecipes.filter(r => r.category === mealType);
  
  if (mealRecipes.length === 0) {
    // Fallback: utiliser n'importe quelle recette si pas de recette pour ce type
    mealRecipes.push(...availableRecipes);
  }
  
  // Sélectionner la recette la plus proche des macros cibles
  let bestRecipe = mealRecipes[0];
  let bestScore = Infinity;
  let bestServings = 1;
  
  for (const recipe of mealRecipes) {
    // Calculer le nombre de portions optimal
    const servings = Math.max(0.5, Math.min(3, targetMacros.calories / recipe.macrosPerServing.calories));
    
    // Calculer les macros ajustés
    const adjustedMacros = {
      calories: recipe.macrosPerServing.calories * servings,
      protein: recipe.macrosPerServing.protein * servings,
      carbs: recipe.macrosPerServing.carbs * servings,
      fat: recipe.macrosPerServing.fat * servings
    };
    
    // Calculer le score (différence avec les cibles)
    const score = 
      Math.abs(adjustedMacros.calories - targetMacros.calories) * 0.3 +
      Math.abs(adjustedMacros.protein - targetMacros.protein) * 2 +
      Math.abs(adjustedMacros.carbs - targetMacros.carbs) * 0.5 +
      Math.abs(adjustedMacros.fat - targetMacros.fat) * 1;
    
    if (score < bestScore) {
      bestScore = score;
      bestRecipe = recipe;
      bestServings = servings;
    }
  }
  
  return [{
    recipe: bestRecipe,
    servings: Math.round(bestServings * 10) / 10, // Arrondir à 0.1
    adjustedMacros: {
      calories: Math.round(bestRecipe.macrosPerServing.calories * bestServings),
      protein: Math.round(bestRecipe.macrosPerServing.protein * bestServings),
      carbs: Math.round(bestRecipe.macrosPerServing.carbs * bestServings),
      fat: Math.round(bestRecipe.macrosPerServing.fat * bestServings),
      fiber: bestRecipe.macrosPerServing.fiber ? Math.round(bestRecipe.macrosPerServing.fiber * bestServings) : 0
    }
  }];
}

/**
 * Génère un plan de repas pour une journée
 */
function generateDailyMealPlan(
  client: Client,
  dayNumber: number,
  availableRecipes: Recipe[]
): MealPlan {
  const metrics = calculateNutritionMetrics(client);
  const mealMacros = distributeMacrosAcrossMeals(metrics, client.mealsPerDay);
  
  const meals: Meal[] = [];
  const mealTypes: ('breakfast' | 'lunch' | 'dinner' | 'snack')[] = 
    client.mealsPerDay === 3 ? ['breakfast', 'lunch', 'dinner'] :
    client.mealsPerDay === 4 ? ['breakfast', 'lunch', 'dinner', 'snack'] :
    client.mealsPerDay === 5 ? ['breakfast', 'snack', 'lunch', 'snack', 'dinner'] :
    ['breakfast', 'snack', 'lunch', 'snack', 'dinner', 'snack'];
  
  const mealTimes = 
    client.mealsPerDay === 3 ? ['07:00', '12:30', '19:00'] :
    client.mealsPerDay === 4 ? ['07:00', '12:30', '16:00', '19:30'] :
    client.mealsPerDay === 5 ? ['07:00', '10:00', '13:00', '16:00', '19:30'] :
    ['06:30', '09:30', '12:30', '15:30', '18:30', '21:00'];
  
  mealTypes.forEach((mealType, index) => {
    const targetMacros = mealMacros[index];
    const recipes = selectRecipesForMeal(availableRecipes, targetMacros, mealType);
    
    const totalMacros = recipes.reduce((acc, rs) => ({
      calories: acc.calories + rs.adjustedMacros.calories,
      protein: acc.protein + rs.adjustedMacros.protein,
      carbs: acc.carbs + rs.adjustedMacros.carbs,
      fat: acc.fat + rs.adjustedMacros.fat,
      fiber: acc.fiber + (rs.adjustedMacros.fiber || 0)
    }), { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
    
    meals.push({
      id: `meal-${dayNumber}-${index + 1}`,
      mealNumber: index + 1,
      mealType,
      time: mealTimes[index],
      recipes,
      totalMacros
    });
  });
  
  const totalDayMacros = meals.reduce((acc, meal) => ({
    calories: acc.calories + meal.totalMacros.calories,
    protein: acc.protein + meal.totalMacros.protein,
    carbs: acc.carbs + meal.totalMacros.carbs,
    fat: acc.fat + meal.totalMacros.fat,
    fiber: acc.fiber + (meal.totalMacros.fiber || 0)
  }), { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
  
  return {
    day: dayNumber,
    meals,
    totalMacros: totalDayMacros,
    hydration: metrics.waterLiters
  };
}

/**
 * Génère une liste de courses consolidée
 */
function generateGroceryList(weeklyMealPlan: MealPlan[]): GroceryItem[] {
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
              estimatedCost: amount * 0.05 // Estimation simple
            });
          }
        });
      });
    });
  });
  
  // Convertir en array et trier par catégorie
  return Array.from(groceryMap.values()).sort((a, b) => 
    a.category.localeCompare(b.category)
  );
}

/**
 * Sélectionne un template d'entraînement approprié
 */
function selectTrainingTemplate(client: Client): 'upper_lower' | 'push_pull_legs' | 'full_body' {
  if (client.trainingDaysPerWeek <= 3) {
    return 'full_body';
  } else if (client.trainingDaysPerWeek === 4) {
    return 'upper_lower';
  } else {
    return 'push_pull_legs';
  }
}

/**
 * Génère une session d'entraînement
 */
function generateWorkoutSession(
  sessionType: 'upper' | 'lower' | 'push' | 'pull' | 'legs' | 'full_body',
  exercises: Exercise[],
  dayNumber: number,
  client: Client
): WorkoutSession {
  // Sélectionner les exercices selon le type de session
  let selectedExercises: Exercise[] = [];
  
  switch (sessionType) {
    case 'upper':
      selectedExercises = exercises.filter(ex => 
        ['chest', 'back', 'shoulders', 'biceps', 'triceps'].includes(ex.category)
      );
      break;
    case 'lower':
      selectedExercises = exercises.filter(ex => 
        ['legs', 'glutes'].includes(ex.category)
      );
      break;
    case 'push':
      selectedExercises = exercises.filter(ex => 
        ['chest', 'shoulders', 'triceps'].includes(ex.category)
      );
      break;
    case 'pull':
      selectedExercises = exercises.filter(ex => 
        ['back', 'biceps'].includes(ex.category)
      );
      break;
    case 'legs':
      selectedExercises = exercises.filter(ex => 
        ['legs', 'glutes'].includes(ex.category)
      );
      break;
    case 'full_body':
      // Prendre un peu de chaque catégorie
      const categories = ['chest', 'back', 'legs', 'shoulders'];
      selectedExercises = [];
      categories.forEach(cat => {
        const catExercises = exercises.filter(ex => ex.category === cat);
        if (catExercises.length > 0) {
          selectedExercises.push(catExercises[0]);
        }
      });
      break;
  }
  
  // Limiter le nombre d'exercices selon la durée de session
  const exerciseCount = Math.min(
    selectedExercises.length,
    Math.floor(client.sessionDuration / 10) // ~10 min par exercice
  );
  
  selectedExercises = selectedExercises.slice(0, exerciseCount);
  
  // Créer les exercices de la session
  const workoutExercises = selectedExercises.map(exercise => {
    let sets: number;
    let reps: string;
    let rest: number;
    let intensity: string;
    
    // Adapter selon l'objectif
    switch (client.primaryGoal) {
      case 'muscle_gain':
        sets = 4;
        reps = '8-12';
        rest = 90;
        intensity = 'RPE 7-8';
        break;
      case 'fat_loss':
        sets = 3;
        reps = '12-15';
        rest = 60;
        intensity = 'RPE 6-7';
        break;
      default:
        sets = 3;
        reps = '8-10';
        rest = 90;
        intensity = 'RPE 7';
    }
    
    // Ajuster pour les exercices composés
    if (['Deadlift', 'Squat', 'Bench Press'].some(name => exercise.name.includes(name))) {
      reps = client.primaryGoal === 'muscle_gain' ? '5-8' : '6-10';
      rest = 120;
      intensity = 'RPE 8';
    }
    
    return {
      exercise,
      sets,
      reps,
      rest,
      intensity,
      tempo: '2-0-2-0',
      notes: client.trainingExperience === 'beginner' ? 'Focus on form' : undefined
    };
  });
  
  return {
    id: `session-${dayNumber}`,
    dayNumber,
    sessionType,
    name: `${sessionType.charAt(0).toUpperCase() + sessionType.slice(1).replace('_', ' ')} Day`,
    duration: client.sessionDuration,
    exercises: workoutExercises,
    notes: `Remember to warm up for 5-10 minutes before starting`
  };
}

/**
 * Génère un plan d'entraînement complet
 */
export function generateTrainingPlan(client: Client): TrainingPlan {
  const template = selectTrainingTemplate(client);
  const workouts: WorkoutSession[] = [];
  
  // Générer les sessions selon le template
  if (template === 'full_body') {
    for (let i = 0; i < client.trainingDaysPerWeek; i++) {
      workouts.push(generateWorkoutSession('full_body', sampleExercises, i + 1, client));
    }
  } else if (template === 'upper_lower') {
    // Alterner Upper/Lower
    for (let i = 0; i < client.trainingDaysPerWeek; i++) {
      const sessionType = i % 2 === 0 ? 'upper' : 'lower';
      workouts.push(generateWorkoutSession(sessionType, sampleExercises, i + 1, client));
    }
  } else if (template === 'push_pull_legs') {
    const sessionTypes: ('push' | 'pull' | 'legs')[] = ['push', 'pull', 'legs'];
    for (let i = 0; i < client.trainingDaysPerWeek; i++) {
      const sessionType = sessionTypes[i % 3];
      workouts.push(generateWorkoutSession(sessionType, sampleExercises, i + 1, client));
    }
  }
  
  // Déterminer la phase selon l'objectif
  let phase: 'strength' | 'hypertrophy' | 'power' | 'endurance';
  switch (client.primaryGoal) {
    case 'muscle_gain':
      phase = 'hypertrophy';
      break;
    case 'fat_loss':
      phase = 'endurance';
      break;
    default:
      phase = 'strength';
  }
  
  return {
    id: `training-${Date.now()}`,
    clientId: client.id,
    name: `${client.primaryGoal.replace('_', ' ')} Training Program`,
    duration: 4, // 4 semaines par défaut
    frequency: client.trainingDaysPerWeek,
    split: template,
    phase,
    workouts,
    progressionScheme: 'Progressive overload: Increase weight by 2.5-5kg when you can complete all sets with good form',
    createdAt: new Date().toISOString()
  };
}

/**
 * Génère un plan nutritionnel complet
 */
export function generateNutritionPlan(client: Client): NutritionPlan {
  // Filtrer les recettes selon le client
  const availableRecipes = filterRecipesForClient(sampleRecipes, client);
  
  if (availableRecipes.length < 3) {
    throw new Error('Not enough compatible recipes for this client. Please adjust preferences.');
  }
  
  // Générer un plan pour 7 jours
  const weeklyMealPlan: MealPlan[] = [];
  for (let day = 1; day <= 7; day++) {
    weeklyMealPlan.push(generateDailyMealPlan(client, day, availableRecipes));
  }
  
  // Générer la liste de courses
  const groceryList = generateGroceryList(weeklyMealPlan);
  
  return {
    id: `nutrition-${Date.now()}`,
    clientId: client.id,
    name: `${client.primaryGoal.replace('_', ' ')} Nutrition Plan`,
    startDate: new Date().toISOString(),
    endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    metrics: calculateNutritionMetrics(client),
    weeklyMealPlan,
    groceryList,
    notes: `Plan based on ${client.dietType} diet with ${client.mealsPerDay} meals per day`,
    createdAt: new Date().toISOString()
  };
}

/**
 * Génère un plan complet (nutrition + entraînement) avec IA
 */
export async function generateCompletePlan(client: Client): Promise<CompletePlan> {
  // Vérifier les red flags
  const redFlags = checkForRedFlags(client);
  if (redFlags.length > 0) {
    throw new Error(`⚠️ Red flags detected: ${redFlags.join(', ')}. Manual review required.`);
  }
  
  try {
    // Appeler la fonction Supabase Edge pour générer le plan avec OpenAI
    const response = await fetch('https://ennbxdpthjtzsobnqvqw.supabase.co/functions/v1/generate-fitness-plan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ client })
    });

    if (!response.ok) {
      throw new Error('Failed to generate plan with AI');
    }

    const { plan: aiGeneratedPlan } = await response.json();
    
    // Transformer la réponse AI en format attendu par l'application
    const nutritionPlan = transformAINutritionPlan(aiGeneratedPlan.nutrition_plan, client);
    const trainingPlan = transformAITrainingPlan(aiGeneratedPlan.training_plan, client);
    
    return {
      client,
      nutritionPlan,
      trainingPlan,
      generatedAt: new Date().toISOString(),
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'active',
      aiRecommendations: aiGeneratedPlan.recommendations
    };
  } catch (error) {
    console.error('Error generating AI plan, falling back to local generation:', error);
    // Fallback to local generation if AI fails
    const nutritionPlan = generateNutritionPlan(client);
    const trainingPlan = generateTrainingPlan(client);
    
    return {
      client,
      nutritionPlan,
      trainingPlan,
      generatedAt: new Date().toISOString(),
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'active'
    };
  }
}

/**
 * Transforme le plan nutrition AI en format de l'app
 */
function transformAINutritionPlan(aiPlan: any, client: Client): NutritionPlan {
  const weeklyMealPlan: MealPlan[] = [];
  
  aiPlan.meal_plans.forEach((dayPlan: any) => {
    const meals: Meal[] = dayPlan.meals.map((meal: any, index: number) => {
      const recipes: RecipeServing[] = [{
        recipe: {
          id: `ai-recipe-${dayPlan.day}-${index}`,
          name: meal.foods.map((f: any) => f.name).join(', '),
          category: meal.meal_type,
          prepTime: 10,
          cookTime: 15,
          servings: 1,
          ingredients: meal.foods.map((food: any) => ({
            id: `ing-${dayPlan.day}-${index}`,
            name: food.name,
            amount: food.amount,
            unit: food.unit,
            category: 'various',
            macrosPer100g: { calories: 0, protein: 0, carbs: 0, fat: 0 }
          })),
          instructions: [],
          macrosPerServing: {
            calories: meal.foods.reduce((sum: number, f: any) => sum + f.calories, 0),
            protein: meal.foods.reduce((sum: number, f: any) => sum + f.protein, 0),
            carbs: meal.foods.reduce((sum: number, f: any) => sum + f.carbs, 0),
            fat: meal.foods.reduce((sum: number, f: any) => sum + f.fat, 0)
          },
          allergens: [],
          dietTypes: [],
          tags: [],
          equipment: [],
          difficulty: 'easy' as const
        },
        servings: 1,
        adjustedMacros: {
          calories: meal.foods.reduce((sum: number, f: any) => sum + f.calories, 0),
          protein: meal.foods.reduce((sum: number, f: any) => sum + f.protein, 0),
          carbs: meal.foods.reduce((sum: number, f: any) => sum + f.carbs, 0),
          fat: meal.foods.reduce((sum: number, f: any) => sum + f.fat, 0)
        }
      }];
      
      return {
        id: `meal-${dayPlan.day}-${index}`,
        mealNumber: meal.meal_number,
        mealType: meal.meal_type,
        time: meal.time,
        recipes,
        totalMacros: recipes[0].adjustedMacros
      };
    });
    
    const totalDayMacros = meals.reduce((acc, meal) => ({
      calories: acc.calories + meal.totalMacros.calories,
      protein: acc.protein + meal.totalMacros.protein,
      carbs: acc.carbs + meal.totalMacros.carbs,
      fat: acc.fat + meal.totalMacros.fat,
      fiber: 0
    }), { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
    
    weeklyMealPlan.push({
      day: dayPlan.day,
      meals,
      totalMacros: totalDayMacros,
      hydration: Math.round(client.weight * 0.033)
    });
  });
  
  // Transformer la liste de courses
  const groceryList: GroceryItem[] = [];
  aiPlan.grocery_list?.forEach((category: any) => {
    category.items.forEach((item: any) => {
      groceryList.push({
        ingredient: item.name,
        totalAmount: item.amount,
        unit: item.unit,
        category: category.category,
        estimatedCost: item.amount * 0.05
      });
    });
  });
  
  return {
    id: `nutrition-${Date.now()}`,
    clientId: client.id,
    name: `${client.primaryGoal.replace('_', ' ')} AI Nutrition Plan`,
    startDate: new Date().toISOString(),
    endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    metrics: {
      tdee: aiPlan.daily_calories,
      bmr: Math.round(aiPlan.daily_calories / 1.5), // Estimation du BMR
      targetCalories: aiPlan.daily_calories,
      proteinGrams: aiPlan.daily_macros.protein,
      carbsGrams: aiPlan.daily_macros.carbs,
      fatGrams: aiPlan.daily_macros.fat,
      fiberGrams: 30,
      waterLiters: Math.round(client.weight * 0.033)
    },
    weeklyMealPlan,
    groceryList,
    notes: `AI-generated plan optimized for ${client.primaryGoal}`,
    createdAt: new Date().toISOString()
  };
}

/**
 * Transforme le plan training AI en format de l'app
 */
function transformAITrainingPlan(aiPlan: any, client: Client): TrainingPlan {
  const workouts: WorkoutSession[] = aiPlan.workouts.map((workout: any) => ({
    id: `session-${workout.day}`,
    dayNumber: workout.day,
    sessionType: workout.name.toLowerCase().replace(' ', '_'),
    name: workout.name,
    duration: client.sessionDuration,
    exercises: workout.exercises.map((ex: any) => ({
      exercise: {
        id: `ex-${workout.day}-${ex.name}`,
        name: ex.name,
        category: 'various',
        equipment: client.equipmentAvailable,
        difficulty: client.trainingExperience
      },
      sets: ex.sets,
      reps: ex.reps,
      rest: ex.rest,
      intensity: ex.intensity,
      tempo: '2-0-2-0',
      notes: ex.notes
    })),
    notes: 'AI-optimized workout'
  }));
  
  return {
    id: `training-${Date.now()}`,
    clientId: client.id,
    name: `AI ${client.primaryGoal.replace('_', ' ')} Training Program`,
    duration: 4,
    frequency: client.trainingDaysPerWeek,
    split: aiPlan.split || 'custom',
    phase: client.primaryGoal === 'muscle_gain' ? 'hypertrophy' : 
           client.primaryGoal === 'fat_loss' ? 'endurance' : 'strength',
    workouts,
    progressionScheme: 'AI-optimized progressive overload',
    createdAt: new Date().toISOString()
  };
}

/**
 * Vérifie les red flags médicaux
 */
function checkForRedFlags(client: Client): string[] {
  const redFlags: string[] = [];
  const dangerousConditions = [
    'heart disease', 'cardiac', 'hypertension', 'diabetes', 'kidney',
    'liver', 'cancer', 'epilepsy', 'pregnancy', 'eating disorder'
  ];
  
  client.medicalConditions.forEach(condition => {
    if (dangerousConditions.some(flag => 
      condition.toLowerCase().includes(flag)
    )) {
      redFlags.push(condition);
    }
  });
  
  // Vérifier les objectifs extrêmes
  if (client.weeklyWeightChange && Math.abs(client.weeklyWeightChange) > 1) {
    redFlags.push('Extreme weekly weight change goal');
  }
  
  // Vérifier le BMI
  const bmi = client.weight / Math.pow(client.height / 100, 2);
  if (bmi < 17 || bmi > 40) {
    redFlags.push(`Extreme BMI: ${bmi.toFixed(1)}`);
  }
  
  return redFlags;
}