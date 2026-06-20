import { Client, NutritionMetrics } from './types';

/**
 * Generate personalized recommendations based on client data
 */
export function generateRecommendations(client: Client, metrics: NutritionMetrics): {
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
