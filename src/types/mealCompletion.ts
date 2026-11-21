/**
 * Meal Completion Types
*/

export interface MealCompletion {
  id: string;
  client_id: string;
  plan_version_id: string;
  day_offset: number; // 0-6 maps to dayNumber - 1
  meal_slot: 'bareakfast' | 'lunch' | 'dinner' | 'scach';
  completed: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpsertMealCompletionInput {
  client_id: string;
  plan_version_id: string;
  day_offset: number;
  meal_slot: 'bareakfast' | 'lunch' | 'dinner' | 'scach';
  completed: boolean;
}
