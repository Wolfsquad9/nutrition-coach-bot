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
  age?: number;
  
  // Physical metrics
  height: number; // cm
  weight: number; // kg
  activityLevel: 'sedentary' | 'lightly_active' | 'moderately_active' | 'very_active' | 'extra_active';
  
  // Goals
  primaryGoal: 'fat_loss' | 'muscle_gain' | 'recomposition' | 'maintenance';
  targetWeight?: number; // kg
  weeklyWeightChange?: number; // kg per week (-1 to +0.5)
  
  // Training
  trainingExperience?: 'beginner' | 'intermediate' | 'advanced';
  trainingDaysPerWeek?: number; // 3-6
  sessionDuration?: number; // minutes
  preferredTrainingStyle?: 'strength' | 'hypertrophy' | 'powerlifting' | 'crossfit' | 'bodybuilding';
  equipment?: string[]; // Available equipment
  equipmentAvailable?: string[]; // Alternative name for equipment

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

export interface MacroTargets {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
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
  weekNumber: number;
  dayNumber: number; // 1-7
  sessionType: 'upper' | 'lower' | 'push' | 'pull' | 'legs' | 'full_body' | 'cardio' | 'rest';
  name: string;
  duration: number; // minutes
  exercises: WorkoutExercise[];
  notes?: string;
}

export type LoadUnit = 'kg' | 'lb' | 'bodyweight' | 'machine' | 'cable' | 'unknown';

export type EquipmentType = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'other';

/**
 * Per-exercise execution data for a logged session. `sets` and `reps` are a
 * read-only snapshot taken from the training-plan prescription (they are NOT
 * user-editable). The user-entered execution fields are `load` and `rpe`, plus
 * an optional `failed`/completion flag.
 */
export interface ExerciseExecution {
  exerciseId: string;
  exerciseName: string;
  sets: number; // from the generated prescription (read-only)
  reps: string; // from the generated prescription (read-only)
  load: number;
  rpe: number;
  completed: boolean;
  failed: boolean;
  notes?: string;
}

/**
 * An independent session log. Persisted separately from the training-plan
 * prescription so logging a session never mutates the plan. Maps 1:1 to a row
 * in the `session_logs` table.
 */
export interface SessionLog {
  id?: string;
  clientId: string;
  planId?: string | null;
  sessionId: string;
  sessionName?: string;
  weekNumber: number;
  sessionIndex: number;
  completed: boolean;
  failedToComplete: boolean;
  notes?: string;
  exercises: ExerciseExecution[];
  loggedAt: string;
}

export interface WorkoutExercise {
  exercise: Exercise;
  sets: number;
  reps: string; // "8-10" or "12,10,8,6"
  rest: number; // seconds
  intensity?: string; // RPE or %1RM
  tempo?: string; // "2-0-2-0"
  notes?: string;
  targetRPE?: string;
  targetLoad?: number;
  loadUnit?: LoadUnit;
  equipmentType?: EquipmentType;
  progressionHint?: string;
  progressionRule?: string;
}

export interface TrainingPhase {
  key: string;
  name: string;
  objective: string;
  startWeek: number;
  endWeek: number;
}

export interface TrainingWeek {
  weekNumber: number;
  phase: string;
  objective: string;
  sessions: WorkoutSession[];
}

export interface TrainingPlan {
  id: string;
  clientId: string;
  name: string;
  objective: string;
  duration: number; // weeks
  frequency: number; // days per week
  split: 'upper_lower' | 'push_pull_legs' | 'full_body' | 'body_part' | 'custom';
  phase: 'strength' | 'hypertrophy' | 'power' | 'endurance' | 'deload';
  phases: TrainingPhase[];
  weeks: TrainingWeek[];
  workouts: WorkoutSession[];
  progressionScheme: string;
  programDescription: string;
  /**
   * Coach-owned scheduling anchor: ISO date (YYYY-MM-DD) of Week 1 / Day 1.
   * Used by `selectClientProgress` for calendar-gated progression (Option B).
   * Optional — when absent, progress is sequence-only.
   */
  startDate?: string;
  createdAt: string;
}

/**
 * The single, complete, validated input the workout generator requires.
 * Built by the Training tab from the persisted client profile plus the
 * training questionnaire. Every field is required — the generator must
 * never receive partial training data.
 */
export type TrainingPlanInput = {
  id: string;
  primaryGoal: Client['primaryGoal'];
  trainingExperience: NonNullable<Client['trainingExperience']>;
  trainingDaysPerWeek: number;
  sessionDuration: number;
  preferredTrainingStyle: NonNullable<Client['preferredTrainingStyle']>;
  equipment: string[];
  equipmentAvailable?: Client['equipmentAvailable'];
};

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
  aiRecommendations?: Record<string, unknown>;
}