// Core calculation helpers.
//
// IMPORTANT (data-flow migration):
// All nutrition calculation now lives in the canonical nutrition engine
// (`src/domain/nutrition/engine.ts`). The former nutrition helpers that lived
// in this file (calculateBMR, getActivityFactor, calculateTDEE,
// calculateTargetCalories, calculateMacros, calculateWaterIntake,
// calculateNutritionMetrics, calculateAge, distributeMacrosAcrossMeals)
// duplicated the engine's equations and have been REMOVED so that every
// nutrition number in the app is produced by exactly one implementation.
//
// This module now keeps only the *training* helpers, which have no engine
// equivalent and are intentionally retained.
import { Client } from '@/types';

/**
 * Calculate 1RM from reps and weight
 */
export function calculate1RM(weight: number, reps: number): number {
  // Epley Formula: 1RM = weight * (1 + reps / 30)
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
    '6-1': 86, '6-2': 84, '6-3': 81, '6-4': 79, '6-5': 76,
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
    'liver', 'cancer', 'epilepsy', 'pregnancy', 'eating disorder',
  ];

  // Check medical conditions
  client.medicalConditions.forEach((condition) => {
    if (dangerousConditions.some((flag) => condition.toLowerCase().includes(flag))) {
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
    reasons: redFlags,
  };
}
