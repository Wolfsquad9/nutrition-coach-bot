// Core calculation algorithms for nutrition and training

import { Client, NutritionMetrics, Macros } from '@/types';

/**
 * Calculate BMR using Mifflin-St Jeor equation
 */
export function calculateBMR(weight: number, height: number, age: number, gender: 'male' | 'female'): number {
  // Mifflin-St Jeor Formula
  // Men: BMR = (10 × weight in kg) + (6.25 × height in cm) - (5 × age in years) + 5
  // Women: BMR = (10 × weight in kg) + (6.25 × height in cm) - (5 × age in years) - 161
  
  const baseBMR = (10 * weight) + (6.25 * height) - (5 * age);
  return gender === 'male' ? baseBMR + 5 : baseBMR - 161;
}

/**
 * Get activity factor multiplier based on activity level
 */
export function getActivityFactor(level: Client['activityLevel']): number {
  const factors = {
    sedentary: 1.2,        // Little to no exercise
    lightly_active: 1.375,  // Light exercise 1-3 days/week
    moderately_active: 1.55, // Moderate exercise 3-5 days/week
    very_active: 1.725,     // Heavy exercise 6-7 days/week
    extra_active: 1.9       // Very heavy physical job or 2x training
  };
  return factors[level];
}

/**
 * Calculate TDEE (Total Daily Energy Expenditure)
 */
export function calculateTDEE(bmr: number, activityLevel: Client['activityLevel']): number {
  return Math.round(bmr * getActivityFactor(activityLevel));
}

/**
 * Calculate target calories based on goal
 */
export function calculateTargetCalories(tdee: number, goal: Client['primaryGoal'], weeklyChange?: number): number {
  // 1 kg fat = ~7700 calories
  // Daily deficit/surplus = (weekly change in kg × 7700) / 7
  
  switch (goal) {
    case 'fat_loss':
      // Default: -0.5 kg/week = -550 cal/day deficit
      const deficit = weeklyChange ? (weeklyChange * 7700) / 7 : 550;
      return Math.round(tdee - Math.abs(deficit));
      
    case 'muscle_gain':
      // Default: +0.25 kg/week = +275 cal/day surplus
      const surplus = weeklyChange ? (weeklyChange * 7700) / 7 : 275;
      return Math.round(tdee + surplus);
      
    case 'recomposition':
      // Eat at maintenance or slight deficit on rest days, slight surplus on training days
      // For simplicity, we'll use maintenance
      return tdee;
      
    case 'maintenance':
      return tdee;
      
    default:
      return tdee;
  }
}

/**
 * Calculate macronutrient distribution
 */
export function calculateMacros(
  targetCalories: number,
  weight: number,
  goal: Client['primaryGoal'],
  activityLevel: Client['activityLevel']
): Omit<NutritionMetrics, 'tdee' | 'bmr' | 'waterLiters'> {
  
  let proteinMultiplier: number;
  let fatPercentage: number;
  
  // Protein recommendations based on goal and activity
  switch (goal) {
    case 'fat_loss':
      // Higher protein during deficit to preserve muscle (2.2-2.6 g/kg)
      proteinMultiplier = activityLevel === 'extra_active' || activityLevel === 'very_active' ? 2.6 : 2.3;
      fatPercentage = 0.25; // 25% of calories from fat
      break;
      
    case 'muscle_gain':
      // Moderate-high protein for muscle building (1.8-2.2 g/kg)
      proteinMultiplier = 2.0;
      fatPercentage = 0.30; // 30% of calories from fat
      break;
      
    case 'recomposition':
      // High protein for simultaneous fat loss and muscle gain (2.2-2.4 g/kg)
      proteinMultiplier = 2.3;
      fatPercentage = 0.28; // 28% of calories from fat
      break;
      
    case 'maintenance':
      // Standard protein intake (1.6-1.8 g/kg)
      proteinMultiplier = 1.7;
      fatPercentage = 0.30; // 30% of calories from fat
      break;
      
    default:
      proteinMultiplier = 1.8;
      fatPercentage = 0.30;
  }
  
  // Calculate macros in grams
  const proteinGrams = Math.round(weight * proteinMultiplier);
  const fatGrams = Math.round((targetCalories * fatPercentage) / 9); // 9 cal per gram of fat
  
  // Carbs fill the remaining calories
  const proteinCalories = proteinGrams * 4; // 4 cal per gram of protein
  const fatCalories = fatGrams * 9;
  const remainingCalories = targetCalories - proteinCalories - fatCalories;
  const carbsGrams = Math.round(remainingCalories / 4); // 4 cal per gram of carbs
  
  // Fiber recommendation (14g per 1000 calories, minimum 25g)
  const fiberGrams = Math.max(25, Math.round((targetCalories / 1000) * 14));
  
  return {
    targetCalories,
    proteinGrams,
    carbsGrams,
    fatGrams,
    fiberGrams
  };
}

/**
 * Calculate water intake recommendation
 */
export function calculateWaterIntake(weight: number, activityLevel: Client['activityLevel']): number {
  // Base: 35ml per kg body weight
  let waterMl = weight * 35;
  
  // Add extra for active individuals
  if (activityLevel === 'very_active' || activityLevel === 'extra_active') {
    waterMl += 1000; // Add 1L for very active
  } else if (activityLevel === 'moderately_active') {
    waterMl += 500; // Add 500ml for moderately active
  }
  
  // Convert to liters and round to nearest 0.5L
  return Math.round((waterMl / 1000) * 2) / 2;
}

/**
 * Get age from birthdate
 */
export function calculateAge(birthDate: string): number {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  
  return age;
}

/**
 * Calculate complete nutrition metrics for a client
 */
export function calculateNutritionMetrics(client: Client): NutritionMetrics {
  const age = calculateAge(client.birthDate);
  const bmr = calculateBMR(client.weight, client.height, age, client.gender);
  const tdee = calculateTDEE(bmr, client.activityLevel);
  const targetCalories = calculateTargetCalories(tdee, client.primaryGoal, client.weeklyWeightChange);
  const macros = calculateMacros(targetCalories, client.weight, client.primaryGoal, client.activityLevel);
  const waterLiters = calculateWaterIntake(client.weight, client.activityLevel);
  
  return {
    bmr,
    tdee,
    ...macros,
    waterLiters
  };
}

/**
 * Distribute macros across meals
 */
export function distributeMacrosAcrossMeals(
  totalMacros: NutritionMetrics,
  mealsPerDay: number
): Macros[] {
  const mealDistributions = {
    3: [0.30, 0.40, 0.30],        // Breakfast 30%, Lunch 40%, Dinner 30%
    4: [0.25, 0.35, 0.25, 0.15],  // + Snack 15%
    5: [0.20, 0.15, 0.30, 0.20, 0.15], // + Pre/Post workout
    6: [0.15, 0.15, 0.25, 0.15, 0.20, 0.10] // Multiple smaller meals
  };
  
  const distribution = mealDistributions[mealsPerDay as keyof typeof mealDistributions] || mealDistributions[3];
  
  return distribution.map(percentage => ({
    calories: Math.round(totalMacros.targetCalories * percentage),
    protein: Math.round(totalMacros.proteinGrams * percentage),
    carbs: Math.round(totalMacros.carbsGrams * percentage),
    fat: Math.round(totalMacros.fatGrams * percentage),
    fiber: Math.round(totalMacros.fiberGrams * percentage)
  }));
}

/**
 * Calculate 1RM from reps and weight
 */
export function calculate1RM(weight: number, reps: number): number {
  // Epley Formula: 1RM = weight × (1 + reps/30)
  return Math.round(weight * (1 + reps / 30));
}

/**
 * Calculate working weight from 1RM and percentage
 */
export function calculateWorkingWeight(oneRM: number, percentage: number): number {
  return Math.round((oneRM * percentage) / 100 / 2.5) * 2.5; // Round to nearest 2.5kg
}

/**
 * Convert RPE to percentage of 1RM
 */
export function rpeToPercentage(rpe: number, reps: number): number {
  // Simplified RPE chart conversion
  const rpeChart: { [key: string]: number } = {
    '10-1': 100, '10-2': 95, '10-3': 92, '10-4': 89, '10-5': 86,
    '9-1': 95, '9-2': 92, '9-3': 89, '9-4': 86, '9-5': 84,
    '8-1': 92, '8-2': 89, '8-3': 86, '8-4': 84, '8-5': 81,
    '7-1': 89, '7-2': 86, '7-3': 84, '7-4': 81, '7-5': 79,
    '6-1': 86, '6-2': 84, '6-3': 81, '6-4': 79, '6-5': 76
  };
  
  const key = `${rpe}-${reps}`;
  return rpeChart[key] || 75;
}

/**
 * Check for medical red flags
 */
export function checkRedFlags(client: Client): { hasRedFlags: boolean; reasons: string[] } {
  const redFlags: string[] = [];
  const dangerousConditions = [
    'heart disease', 'cardiac', 'hypertension', 'diabetes', 'kidney',
    'liver', 'cancer', 'epilepsy', 'pregnancy', 'eating disorder'
  ];
  
  // Check medical conditions
  client.medicalConditions.forEach(condition => {
    if (dangerousConditions.some(flag => condition.toLowerCase().includes(flag))) {
      redFlags.push(`Medical condition: ${condition}`);
    }
  });
  
  // Check extreme weight goals
  if (client.weeklyWeightChange && Math.abs(client.weeklyWeightChange) > 1) {
    redFlags.push('Extreme weekly weight change goal (>1kg/week)');
  }
  
  // Check BMI extremes
  const bmi = client.weight / Math.pow(client.height / 100, 2);
  if (bmi < 17 || bmi > 40) {
    redFlags.push(`Extreme BMI: ${bmi.toFixed(1)}`);
  }
  
  return {
    hasRedFlags: redFlags.length > 0,
    reasons: redFlags
  };
}