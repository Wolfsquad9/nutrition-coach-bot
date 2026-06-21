import { Client, NutritionPlan, CompletePlan } from '@/types';
import { checkRedFlags } from '@/utils/calculations';
import { calculatePersonalizedMetrics } from './metricsCalculator';
import { generateDynamicNutritionPlan } from './mealGenerator';
import { generateDynamicTrainingPlan } from './workoutGenerator';
import { generateRecommendations } from './recommendations';

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
