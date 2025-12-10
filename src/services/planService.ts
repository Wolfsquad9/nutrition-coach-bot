/**
 * Fully Dynamic Plan Generation Service
 * Generates personalized nutrition and training plans based on user data
 */

import { Client, NutritionPlan, TrainingPlan, CompletePlan, MealPlan, Meal, WorkoutSession, WorkoutExercise, Exercise, GroceryItem, RecipeServing, NutritionMetrics } from '@/types';
import { 
  calculateBMR, 
  calculateTDEE, 
  calculateTargetCalories, 
  calculateMacros, 
  calculateWaterIntake, 
  calculateAge,
  distributeMacrosAcrossMeals,
  checkRedFlags
} from '@/utils/calculations';
import { generateRecipe, MealType } from './recipeService';
import { sampleExercises } from '@/data/sampleData';

// Exercise database organized by muscle group and difficulty
const EXERCISE_DATABASE: Record<string, Exercise[]> = {
  chest: sampleExercises.filter(ex => ex.category === 'chest'),
  back: sampleExercises.filter(ex => ex.category === 'back'),
  legs: sampleExercises.filter(ex => ex.category === 'legs'),
  shoulders: sampleExercises.filter(ex => ex.category === 'shoulders'),
  biceps: sampleExercises.filter(ex => ex.category === 'biceps'),
  triceps: sampleExercises.filter(ex => ex.category === 'triceps'),
  glutes: sampleExercises.filter(ex => ex.category === 'glutes'),
  abs: sampleExercises.filter(ex => ex.category === 'abs'),
};

// Training parameters by goal
const GOAL_TRAINING_PARAMS: Record<string, { 
  sets: number; 
  reps: string; 
  rest: number; 
  intensity: string;
  volumeMultiplier: number;
}> = {
  fat_loss: { sets: 3, reps: '12-15', rest: 45, intensity: 'RPE 6-7', volumeMultiplier: 1.2 },
  muscle_gain: { sets: 4, reps: '8-12', rest: 90, intensity: 'RPE 7-8', volumeMultiplier: 1.0 },
  recomposition: { sets: 4, reps: '10-12', rest: 75, intensity: 'RPE 7-8', volumeMultiplier: 1.1 },
  maintenance: { sets: 3, reps: '8-10', rest: 90, intensity: 'RPE 7', volumeMultiplier: 0.8 },
};

// Experience-based adjustments
const EXPERIENCE_ADJUSTMENTS: Record<string, { setModifier: number; exerciseCount: number; complexityLevel: string[] }> = {
  beginner: { setModifier: -1, exerciseCount: 4, complexityLevel: ['beginner', 'intermediate'] },
  intermediate: { setModifier: 0, exerciseCount: 5, complexityLevel: ['beginner', 'intermediate', 'advanced'] },
  advanced: { setModifier: 1, exerciseCount: 6, complexityLevel: ['intermediate', 'advanced'] },
};

/**
 * Calculate complete nutrition metrics using Mifflin-St Jeor
 */
export function calculatePersonalizedMetrics(client: Client): NutritionMetrics {
  const age = client.age || calculateAge(client.birthDate);
  
  // Mifflin-St Jeor BMR calculation
  const bmr = calculateBMR(client.weight, client.height, age, client.gender);
  
  // TDEE based on activity level
  const tdee = calculateTDEE(bmr, client.activityLevel);
  
  // Adjust calories based on goal
  const targetCalories = calculateTargetCalories(tdee, client.primaryGoal, client.weeklyWeightChange);
  
  // Calculate macros based on goal
  const macros = calculateMacros(targetCalories, client.weight, client.primaryGoal, client.activityLevel);
  
  // Water intake
  const waterLiters = calculateWaterIntake(client.weight, client.activityLevel);
  
  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    targetCalories: Math.round(targetCalories),
    proteinGrams: macros.proteinGrams,
    carbsGrams: macros.carbsGrams,
    fatGrams: macros.fatGrams,
    fiberGrams: macros.fiberGrams,
    waterLiters,
  };
}

/**
 * Generate a daily meal plan using liked foods
 */
function generateDynamicDailyMealPlan(
  dayNumber: number,
  metrics: NutritionMetrics,
  mealsPerDay: number,
  likedFoods: string[]
): MealPlan {
  const mealMacros = distributeMacrosAcrossMeals(metrics, mealsPerDay);
  
  // Define meal structure based on meals per day
  const mealTypes: MealType[] = 
    mealsPerDay === 3 ? ['breakfast', 'lunch', 'dinner'] :
    mealsPerDay === 4 ? ['breakfast', 'lunch', 'snack', 'dinner'] :
    mealsPerDay === 5 ? ['breakfast', 'snack', 'lunch', 'snack', 'dinner'] :
    ['breakfast', 'snack', 'lunch', 'snack', 'dinner', 'snack'];
  
  const mealTimes = 
    mealsPerDay === 3 ? ['07:00', '12:30', '19:00'] :
    mealsPerDay === 4 ? ['07:00', '12:30', '16:00', '19:30'] :
    mealsPerDay === 5 ? ['07:00', '10:00', '13:00', '16:00', '19:30'] :
    ['06:30', '09:30', '12:30', '15:30', '18:30', '21:00'];
  
  const meals: Meal[] = [];
  
  mealTypes.forEach((mealType, index) => {
    try {
      // Generate recipe using liked foods
      const recipe = generateRecipe(likedFoods, mealType);
      
      // Calculate serving size to match target macros
      const targetMacros = mealMacros[index];
      const baseCalories = recipe.macrosPerServing.calories;
      const servings = Math.max(0.5, Math.min(2.5, targetMacros.calories / baseCalories));
      
      const adjustedMacros = {
        calories: Math.round(recipe.macrosPerServing.calories * servings),
        protein: Math.round(recipe.macrosPerServing.protein * servings),
        carbs: Math.round(recipe.macrosPerServing.carbs * servings),
        fat: Math.round(recipe.macrosPerServing.fat * servings),
        fiber: Math.round((recipe.macrosPerServing.fiber || 0) * servings),
      };
      
      const recipeServing: RecipeServing = {
        recipe,
        servings: Math.round(servings * 10) / 10,
        adjustedMacros,
      };
      
      meals.push({
        id: `meal-${dayNumber}-${index + 1}`,
        mealNumber: index + 1,
        mealType,
        time: mealTimes[index],
        recipes: [recipeServing],
        totalMacros: adjustedMacros,
      });
    } catch (error) {
      // Fallback to placeholder if recipe generation fails
      console.warn(`Could not generate ${mealType} for day ${dayNumber}:`, error);
      const targetMacros = mealMacros[index];
      meals.push({
        id: `meal-${dayNumber}-${index + 1}`,
        mealNumber: index + 1,
        mealType,
        time: mealTimes[index],
        recipes: [],
        totalMacros: targetMacros,
      });
    }
  });
  
  // Calculate daily totals
  const totalDayMacros = meals.reduce((acc, meal) => ({
    calories: acc.calories + meal.totalMacros.calories,
    protein: acc.protein + meal.totalMacros.protein,
    carbs: acc.carbs + meal.totalMacros.carbs,
    fat: acc.fat + meal.totalMacros.fat,
    fiber: acc.fiber + (meal.totalMacros.fiber || 0),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
  
  return {
    day: dayNumber,
    meals,
    totalMacros: totalDayMacros,
    hydration: metrics.waterLiters,
  };
}

/**
 * Generate grocery list from weekly meal plan
 */
function generateDynamicGroceryList(weeklyMealPlan: MealPlan[]): GroceryItem[] {
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

/**
 * Select exercises based on session type, experience, and available equipment
 */
function selectExercisesForSession(
  sessionType: 'upper' | 'lower' | 'push' | 'pull' | 'legs' | 'full_body',
  experience: string,
  availableEquipment: string[]
): Exercise[] {
  const expConfig = EXPERIENCE_ADJUSTMENTS[experience] || EXPERIENCE_ADJUSTMENTS.intermediate;
  let muscleGroups: string[] = [];
  
  switch (sessionType) {
    case 'upper':
      muscleGroups = ['chest', 'back', 'shoulders', 'biceps', 'triceps'];
      break;
    case 'lower':
    case 'legs':
      muscleGroups = ['legs', 'glutes', 'abs'];
      break;
    case 'push':
      muscleGroups = ['chest', 'shoulders', 'triceps'];
      break;
    case 'pull':
      muscleGroups = ['back', 'biceps'];
      break;
    case 'full_body':
      muscleGroups = ['chest', 'back', 'legs', 'shoulders', 'abs'];
      break;
  }
  
  const selectedExercises: Exercise[] = [];
  
  // Select 1-2 exercises per muscle group based on session type
  muscleGroups.forEach(muscle => {
    const muscleExercises = (EXERCISE_DATABASE[muscle] || [])
      .filter(ex => expConfig.complexityLevel.includes(ex.difficulty));
    
    if (muscleExercises.length > 0) {
      // Shuffle and pick
      const shuffled = muscleExercises.sort(() => Math.random() - 0.5);
      const exercisesToAdd = sessionType === 'full_body' ? 1 : Math.min(2, shuffled.length);
      selectedExercises.push(...shuffled.slice(0, exercisesToAdd));
    }
  });
  
  // Limit total exercises based on experience
  return selectedExercises.slice(0, expConfig.exerciseCount);
}

/**
 * Generate a workout session with dynamic parameters
 */
function generateDynamicWorkoutSession(
  sessionType: 'upper' | 'lower' | 'push' | 'pull' | 'legs' | 'full_body',
  dayNumber: number,
  client: Client
): WorkoutSession {
  const goalParams = GOAL_TRAINING_PARAMS[client.primaryGoal] || GOAL_TRAINING_PARAMS.maintenance;
  const expConfig = EXPERIENCE_ADJUSTMENTS[client.trainingExperience] || EXPERIENCE_ADJUSTMENTS.intermediate;
  
  const exercises = selectExercisesForSession(
    sessionType, 
    client.trainingExperience,
    client.equipmentAvailable || []
  );
  
  const workoutExercises: WorkoutExercise[] = exercises.map((exercise, idx) => {
    let sets = Math.max(2, goalParams.sets + expConfig.setModifier);
    let reps = goalParams.reps;
    let rest = goalParams.rest;
    let intensity = goalParams.intensity;
    
    // Adjust for compound movements
    if (exercise.name.toLowerCase().includes('squat') || 
        exercise.name.toLowerCase().includes('deadlift') ||
        exercise.name.toLowerCase().includes('bench press')) {
      sets = Math.min(sets + 1, 5);
      reps = client.primaryGoal === 'fat_loss' ? '8-10' : '5-8';
      rest = 120;
      intensity = 'RPE 8-9';
    }
    
    return {
      exercise,
      sets,
      reps,
      rest,
      intensity,
      tempo: client.trainingExperience === 'beginner' ? '3-1-2-0' : '2-0-2-0',
      notes: client.trainingExperience === 'beginner' ? 'Focus on form and controlled movement' : undefined,
    };
  });
  
  const sessionName = {
    upper: 'Upper Body',
    lower: 'Lower Body',
    push: 'Push Day',
    pull: 'Pull Day',
    legs: 'Leg Day',
    full_body: 'Full Body',
  }[sessionType];
  
  return {
    id: `session-${dayNumber}`,
    dayNumber,
    sessionType,
    name: `${sessionName} - Day ${dayNumber}`,
    duration: client.sessionDuration || 60,
    exercises: workoutExercises,
    notes: `Warm up 5-10 minutes. Rest ${goalParams.rest}s between sets. Cool down and stretch after.`,
  };
}

/**
 * Generate a complete training plan based on client data
 */
export function generateDynamicTrainingPlan(client: Client): TrainingPlan {
  const daysPerWeek = client.trainingDaysPerWeek || 3;
  const workouts: WorkoutSession[] = [];
  
  // Select split based on training frequency
  let split: 'full_body' | 'upper_lower' | 'push_pull_legs';
  let sessionPattern: ('upper' | 'lower' | 'push' | 'pull' | 'legs' | 'full_body')[];
  
  if (daysPerWeek <= 3) {
    split = 'full_body';
    sessionPattern = Array(daysPerWeek).fill('full_body');
  } else if (daysPerWeek === 4) {
    split = 'upper_lower';
    sessionPattern = ['upper', 'lower', 'upper', 'lower'];
  } else {
    split = 'push_pull_legs';
    const pplPattern: ('push' | 'pull' | 'legs')[] = ['push', 'pull', 'legs'];
    sessionPattern = [];
    for (let i = 0; i < daysPerWeek; i++) {
      sessionPattern.push(pplPattern[i % 3]);
    }
  }
  
  // Generate each workout session
  sessionPattern.forEach((sessionType, idx) => {
    workouts.push(generateDynamicWorkoutSession(sessionType, idx + 1, client));
  });
  
  // Determine training phase based on goal
  const phase: 'strength' | 'hypertrophy' | 'power' | 'endurance' = 
    client.primaryGoal === 'muscle_gain' ? 'hypertrophy' :
    client.primaryGoal === 'fat_loss' ? 'endurance' :
    'strength';
  
  return {
    id: `training-${Date.now()}`,
    clientId: client.id,
    name: `${client.primaryGoal.replace('_', ' ')} ${split.replace('_', '/')} Program`,
    duration: 4, // 4-week cycles
    frequency: daysPerWeek,
    split,
    phase,
    workouts,
    progressionScheme: client.trainingExperience === 'beginner' 
      ? 'Add 2.5kg when completing all sets with good form'
      : 'Progressive overload: Increase weight 2.5-5kg or add 1-2 reps per week',
    createdAt: new Date().toISOString(),
  };
}

/**
 * Generate a complete nutrition plan using liked foods
 */
export function generateDynamicNutritionPlan(client: Client, likedFoods: string[]): NutritionPlan {
  const metrics = calculatePersonalizedMetrics(client);
  const mealsPerDay = client.mealsPerDay || 4;
  
  // Ensure we have enough liked foods
  if (likedFoods.length < 5) {
    throw new Error('Please select at least 5 foods you like to generate a personalized meal plan.');
  }
  
  // Generate 7-day meal plan
  const weeklyMealPlan: MealPlan[] = [];
  for (let day = 1; day <= 7; day++) {
    weeklyMealPlan.push(generateDynamicDailyMealPlan(day, metrics, mealsPerDay, likedFoods));
  }
  
  // Generate grocery list
  const groceryList = generateDynamicGroceryList(weeklyMealPlan);
  
  return {
    id: `nutrition-${Date.now()}`,
    clientId: client.id,
    name: `${client.primaryGoal.replace('_', ' ')} Nutrition Plan`,
    startDate: new Date().toISOString(),
    endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    metrics,
    weeklyMealPlan,
    groceryList,
    notes: `Personalized plan with ${metrics.targetCalories} kcal/day | ${metrics.proteinGrams}g protein | ${metrics.carbsGrams}g carbs | ${metrics.fatGrams}g fat`,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Generate complete personalized plan
 */
export async function generatePersonalizedPlan(
  client: Client, 
  likedFoods: string[] = []
): Promise<CompletePlan> {
  // Check for red flags
  const { hasRedFlags, reasons } = checkRedFlags(client);
  if (hasRedFlags) {
    throw new Error(`⚠️ Health concerns detected: ${reasons.join(', ')}. Please consult a healthcare provider.`);
  }
  
  // Calculate metrics
  const metrics = calculatePersonalizedMetrics(client);
  
  // Generate nutrition plan (with or without liked foods)
  let nutritionPlan: NutritionPlan;
  
  if (likedFoods.length >= 5) {
    nutritionPlan = generateDynamicNutritionPlan(client, likedFoods);
  } else {
    // Fallback to basic plan if not enough foods selected
    nutritionPlan = {
      id: `nutrition-${Date.now()}`,
      clientId: client.id,
      name: `${client.primaryGoal.replace('_', ' ')} Nutrition Plan`,
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      metrics,
      weeklyMealPlan: [],
      groceryList: [],
      notes: 'Select more liked foods in the Ingredients tab to generate personalized meals.',
      createdAt: new Date().toISOString(),
    };
  }
  
  // Generate training plan
  const trainingPlan = generateDynamicTrainingPlan(client);
  
  // Calculate goal-specific recommendations
  const recommendations = generateRecommendations(client, metrics);
  
  return {
    client,
    nutritionPlan,
    trainingPlan,
    generatedAt: new Date().toISOString(),
    validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'active',
    aiRecommendations: recommendations,
  };
}

/**
 * Generate personalized recommendations based on client data
 */
function generateRecommendations(client: Client, metrics: NutritionMetrics): {
  nutrition_tips: string[];
  training_tips: string[];
  adherence_strategies: string[];
} {
  const nutrition_tips: string[] = [];
  const training_tips: string[] = [];
  const adherence_strategies: string[] = [];
  
  // Goal-specific nutrition tips
  if (client.primaryGoal === 'fat_loss') {
    nutrition_tips.push(`Caloric deficit of ${metrics.tdee - metrics.targetCalories} kcal/day for steady fat loss`);
    nutrition_tips.push('Prioritize protein at each meal to preserve muscle mass');
    nutrition_tips.push('Increase fiber intake to improve satiety');
  } else if (client.primaryGoal === 'muscle_gain') {
    nutrition_tips.push(`Caloric surplus of ${metrics.targetCalories - metrics.tdee} kcal/day for muscle growth`);
    nutrition_tips.push('Consume protein within 2 hours post-workout');
    nutrition_tips.push('Spread protein intake evenly across all meals');
  }
  
  nutrition_tips.push(`Drink ${metrics.waterLiters}L of water daily`);
  
  // Experience-based training tips
  if (client.trainingExperience === 'beginner') {
    training_tips.push('Focus on learning proper form before increasing weights');
    training_tips.push('Progress slowly - add weight only when form is perfect');
    training_tips.push('Rest at least 48 hours between training the same muscle group');
  } else if (client.trainingExperience === 'advanced') {
    training_tips.push('Consider periodization - vary intensity weekly');
    training_tips.push('Track progressive overload carefully');
    training_tips.push('Include deload weeks every 4-6 weeks');
  }
  
  training_tips.push(`Train ${client.trainingDaysPerWeek} days per week for optimal results`);
  
  // General adherence
  adherence_strategies.push('Meal prep on weekends to save time during the week');
  adherence_strategies.push('Track your progress weekly with photos and measurements');
  adherence_strategies.push('Set small weekly goals to maintain motivation');
  
  return { nutrition_tips, training_tips, adherence_strategies };
}
