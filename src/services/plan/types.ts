// Re-export any types or local interfaces if needed. Since types are from @/types, we can import and re-export them or export any plan-specific interfaces.
export type {
  Client,
  NutritionPlan,
  TrainingPlan,
  CompletePlan,
  MealPlan,
  Meal,
  WorkoutSession,
  WorkoutExercise,
  Exercise,
  GroceryItem,
  RecipeServing,
  NutritionMetrics
} from '@/types';
