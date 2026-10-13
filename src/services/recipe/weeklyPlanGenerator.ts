import { type Macros, type MacroTargets } from '@/types';
import { DAYS_PER_WEEK } from '@/domain/nutrition/engine';
import { DAY_NAMES } from './constants';
import { generateFullDayMealPlan, shuffleForDay } from './mealPlanGenerator';
import type { WeeklyMealPlanResult, RecipeGenerationOptions } from './types';

/**
 * Generates a complete weekly meal plan with 7 days of meals.
 * Each day uses slightly varied ingredient combinations to avoid repetition.
 *
 * `options.allowedIngredientIds` (eligibility boundary) is threaded through to
 * every recipe so eligibility can never be bypassed by a caller.
 */
export function generateWeeklyMealPlan(
  selectedFoods: string[],
  macroTargets: MacroTargets,
  seed?: string,
  options?: RecipeGenerationOptions
): WeeklyMealPlanResult {
  const days: WeeklyMealPlanResult['days'] = [];
  
  const weeklyTotalMacros: Macros = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };

  // Phase 5 3A — SOFT cross-day ingredient diversity. EXPLICIT OPT-IN via
  // `options.weekIngredientDiversity === true`. When the flag is absent/false
  // the generator threads each day's plan with the SAME options object it was
  // given, so weekly output is byte-identical to the pre-Step-3A
  // implementation and no existing caller (e.g. the optimizer) silently
  // changes behaviour. This mirrors the Phase 3C `archetypeGeneration` opt-in
  // convention.
  //
  // When enabled, ids are read from each day AFTER it is generated and
  // forwarded to the next day as a preference only: it can reorder picks
  // inside the same eligible candidate pool but can never add an ingredient,
  // reject a meal, or bypass `allowedIngredientIds` and diet filtering (both
  // resolved upstream) or nutrition validity (the canonical engine
  // downstream). When a meal slot has no unused candidate left the selectors
  // repeat exactly as before. A fresh array is passed per day; the caller's
  // options object is never mutated.
  //
  // `weekUsedIngredientIds` is an OPTIONAL initial history (ids already used by
  // earlier days when this is a continuation), NOT the activation mechanism.
  const weeklyDiversityEnabled = options?.weekIngredientDiversity === true;
  const weekUsedIngredientIds = new Set<string>(options?.weekUsedIngredientIds ?? []);
  
  for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
    // Shuffle ingredients differently for each day to create variation
    const shuffledFoods = shuffleForDay(selectedFoods, dayIndex);
    
    // Generate the daily plan with shuffled ingredients
    // The seed (if provided) makes each candidate's recipe selection vary.
    // The diversity flag is the SINGLE switch. When off, `weekUsedIngredientIds`
    // is stripped so disabled/omitted ⇒ byte-identical legacy output even if an
    // initial-history array was (accidentally) supplied — the flag alone never
    // leaks a preference through. When on, attach a fresh snapshot of the
    // running used-set per day; the caller's options object is never mutated,
    // and each day sees exactly the ids of the days before it.
    const dayOptions: RecipeGenerationOptions = weeklyDiversityEnabled
      ? { ...options, weekUsedIngredientIds: [...weekUsedIngredientIds] }
      : { ...options, weekUsedIngredientIds: undefined };

    const dailyResult = generateFullDayMealPlan(
      shuffledFoods,
      macroTargets,
      seed,
      dayOptions
    );
    
    days.push({
      dayNumber: dayIndex + 1,
      dayName: DAY_NAMES[dayIndex],
      plan: dailyResult,
    });

    // Phase 5 3A — accumulate this day's picks so the NEXT day can prefer
    // unused alternatives. Read from the meal plans just generated; adds only
    // ids that already passed eligibility for their slot. Only when enabled.
    if (weeklyDiversityEnabled) {
      for (const meal of Object.values(dailyResult.dailyPlan)) {
        for (const ingredient of meal.ingredients) {
          weekUsedIngredientIds.add(ingredient.id);
        }
      }
    }
    
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