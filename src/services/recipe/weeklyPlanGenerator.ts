import { type Macros, type MacroTargets } from '@/types';
import { DAYS_PER_WEEK } from '@/domain/nutrition/engine';
import { DAY_NAMES } from './constants';
import { generateFullDayMealPlan, shuffleForDay } from './mealPlanGenerator';
import type { WeeklyMealPlanResult } from './types';

/**
 * Generates a complete weekly meal plan with 7 days of meals.
 * Each day uses slightly varied ingredient combinations to avoid repetition.
 */
export function generateWeeklyMealPlan(
  selectedFoods: string[],
  macroTargets: MacroTargets,
  seed?: string
): WeeklyMealPlanResult {
  const days: WeeklyMealPlanResult['days'] = [];
  
  const weeklyTotalMacros: Macros = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
  
  for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
    // Shuffle ingredients differently for each day to create variation
    const shuffledFoods = shuffleForDay(selectedFoods, dayIndex);
    
    // Generate the daily plan with shuffled ingredients
    // The seed (if provided) makes each candidate's recipe selection vary
    const dailyResult = generateFullDayMealPlan(shuffledFoods, macroTargets, seed);
    
    days.push({
      dayNumber: dayIndex + 1,
      dayName: DAY_NAMES[dayIndex],
      plan: dailyResult,
    });
    
    // Accumulate weekly totals
    weeklyTotalMacros.calories += dailyResult.totalMacros.calories;
    weeklyTotalMacros.protein += dailyResult.totalMacros.protein;
    weeklyTotalMacros.carbs += dailyResult.totalMacros.carbs;
    weeklyTotalMacros.fat += dailyResult.totalMacros.fat;
    weeklyTotalMacros.fiber = (weeklyTotalMacros.fiber || 0) + (dailyResult.totalMacros.fiber || 0);
  }
  
  // Calculate weekly targets and variance (7 days per week, from the engine
  // constant so the weekly multiplier has exactly one definition).
  const weeklyTargetMacros: MacroTargets = {
    calories: macroTargets.calories * DAYS_PER_WEEK,
    protein: macroTargets.protein * DAYS_PER_WEEK,
    carbs: macroTargets.carbs * DAYS_PER_WEEK,
    fat: macroTargets.fat * DAYS_PER_WEEK,
  };
  
  const weeklyVariance = {
    calories: weeklyTotalMacros.calories - weeklyTargetMacros.calories,
    protein: weeklyTotalMacros.protein - weeklyTargetMacros.protein,
    carbs: weeklyTotalMacros.carbs - weeklyTargetMacros.carbs,
    fat: weeklyTotalMacros.fat - weeklyTargetMacros.fat,
  };
  
  return {
    days,
    weeklyTotalMacros,
    weeklyTargetMacros,
    weeklyVariance,
  };
}