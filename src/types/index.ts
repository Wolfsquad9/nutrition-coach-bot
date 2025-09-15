// Types for the entire application

export interface Client {
  id: string;
  // Personal info
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  birthDate: string;
  gender: 'male' | 'female';
  
  // Physical metrics
  height: number; // cm
  weight: number; // kg
  activityLevel: 'sedentary' | 'lightly_active' | 'moderately_active' | 'very_active' | 'extra_active';
  
  // Goals
  primaryGoal: 'fat_loss' | 'muscle_gain' | 'recomposition' | 'maintenance';
  targetWeight?: number; // kg
  weeklyWeightChange?: number; // kg per week (-1 to +0.5)
  
  // Training
  trainingExperience: 'beginner' | 'intermediate' | 'advanced';
  trainingDaysPerWeek: number; // 3-6
  sessionDuration: number; // minutes
  preferredTrainingStyle: 'strength' | 'hypertrophy' | 'powerlifting' | 'crossfit' | 'bodybuilding';
  equipment: string[]; // Available equipment
  
  // Nutrition preferences
  dietType: 'omnivore' | 'vegetarian' | 'vegan' | 'pescatarian' | 'keto' | 'paleo';
  mealsPerDay: 3 | 4 | 5 | 6;
  intolerances: string[];
  allergies: string[];
  dislikedFoods: string[];
  
  // Medical
  medicalConditions: string[];
  medications: string[];
  injuries: string[];
  hasRedFlags: boolean;
  
  // Meta
  createdAt: string;
  updatedAt: string;
  coachNotes?: string;
}

export interface NutritionMetrics {
  tdee: number;
  bmr: number;
  targetCalories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  fiberGrams: number;
  waterLiters: number;
}

export interface Macros {
  calories: number;
  protein: number; // grams
  carbs: number; // grams
  fat: number; // grams
  fiber?: number; // grams
}

export interface Recipe {
  id: string;
  name: string;
  category: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'pre_workout' | 'post_workout';
  prepTime: number; // minutes
  cookTime: number; // minutes
  servings: number;
  ingredients: Ingredient[];
  instructions: string[];
  macrosPerServing: Macros;
  tags: string[];
  dietTypes: string[];
  allergens: string[];
  equipment: string[];
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface Ingredient {
  id: string;
  name: string;
  amount: number;
  unit: 'g' | 'kg' | 'ml' | 'l' | 'cup' | 'tbsp' | 'tsp' | 'oz' | 'lb' | 'piece';
  category: 'protein' | 'carb' | 'fat' | 'vegetable' | 'fruit' | 'dairy' | 'spice' | 'other';
  macrosPer100g: Macros;
  allergens?: string[];
  substitutes?: string[];
}

export interface MealPlan {
  day: number; // 1-7
  meals: Meal[];
  totalMacros: Macros;
  hydration: number; // liters
}

export interface Meal {
  id: string;
  mealNumber: number; // 1, 2, 3, etc.
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'pre_workout' | 'post_workout';
  time: string; // "07:00"
  recipes: RecipeServing[];
  totalMacros: Macros;
}

export interface RecipeServing {
  recipe: Recipe;
  servings: number;
  adjustedMacros: Macros;
}

export interface GroceryItem {
  ingredient: string;
  totalAmount: number;
  unit: string;
  category: string;
  estimatedCost?: number;
}

export interface Exercise {
  id: string;
  name: string;
  category: 'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps' | 'legs' | 'glutes' | 'abs' | 'cardio';
  equipment: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  videoUrl?: string;
}

export interface WorkoutSession {
  id: string;
  dayNumber: number; // 1-7
  sessionType: 'upper' | 'lower' | 'push' | 'pull' | 'legs' | 'full_body' | 'cardio' | 'rest';
  name: string;
  duration: number; // minutes
  exercises: WorkoutExercise[];
  notes?: string;
}

export interface WorkoutExercise {
  exercise: Exercise;
  sets: number;
  reps: string; // "8-10" or "12,10,8,6"
  rest: number; // seconds
  intensity?: string; // RPE or %1RM
  tempo?: string; // "2-0-2-0"
  notes?: string;
}

export interface TrainingPlan {
  id: string;
  clientId: string;
  name: string;
  duration: number; // weeks
  frequency: number; // days per week
  split: 'upper_lower' | 'push_pull_legs' | 'full_body' | 'body_part' | 'custom';
  phase: 'strength' | 'hypertrophy' | 'power' | 'endurance' | 'deload';
  workouts: WorkoutSession[];
  progressionScheme: string;
  createdAt: string;
}

export interface NutritionPlan {
  id: string;
  clientId: string;
  name: string;
  startDate: string;
  endDate: string;
  metrics: NutritionMetrics;
  weeklyMealPlan: MealPlan[];
  groceryList: GroceryItem[];
  notes?: string;
  createdAt: string;
}

export interface CompletePlan {
  client: Client;
  nutritionPlan: NutritionPlan;
  trainingPlan: TrainingPlan;
  generatedAt: string;
  validUntil: string;
  status: 'active' | 'pending_review' | 'archived';
}