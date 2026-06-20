import { Client, NutritionMetrics } from './types';
import {
  calculateBMR,
  calculateTDEE,
  calculateTargetCalories,
  calculateMacros,
  calculateWaterIntake,
  calculateAge,
} from '@/utils/calculations';

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
