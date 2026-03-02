import { coreIngredients, type MealData, type MealTimeType } from '../data/ingredientDatabase.js';
import type { MacroTargets, WeeklyMealPlanResult } from '../services/recipeService';
import type { PlanOverride } from '../services/supabaseOverrideService';
import type { PlanSnapshot, PlanSnapshotInput, PlanSnapshotStatus } from '../types/planSnapshot';
import type { Macros } from '../types';

type MacroDelta = PlanOverride['macroDelta'];

const MEAL_TYPES: MealTimeType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

const EMPTY_DELTA: MacroDelta = { calories: 0, protein: 0, carbs: 0, fat: 0 };

const VALID_SNAPSHOT_STATUSES: PlanSnapshotStatus[] = ['LOCKED', 'EXPIRED'];

const buildIngredientLookup = () => new Map(coreIngredients.map(ingredient => [ingredient.id, ingredient]));

const addMacroDelta = (macros: Macros, delta: MacroDelta): Macros => ({
  ...macros,
  calories: macros.calories + delta.calories,
  protein: macros.protein + delta.protein,
  carbs: macros.carbs + delta.carbs,
  fat: macros.fat + delta.fat,
});

const sumMacroDelta = (a: MacroDelta, b: MacroDelta): MacroDelta => ({
  calories: a.calories + b.calories,
  protein: a.protein + b.protein,
  carbs: a.carbs + b.carbs,
  fat: a.fat + b.fat,
});

const computeVariance = (actual: Macros, target: MacroTargets) => ({
  calories: actual.calories - target.calories,
  protein: actual.protein - target.protein,
  carbs: actual.carbs - target.carbs,
  fat: actual.fat - target.fat,
});

const normalizeOverrides = (overrides: PlanOverride[]): PlanOverride[] => {
  return [...overrides].sort((a, b) => {
    const createdDiff = a.createdAt.localeCompare(b.createdAt);
    if (createdDiff !== 0) {
      return createdDiff;
    }
    return a.id.localeCompare(b.id);
  });
};

const applyOverridesToMeal = (
  meal: MealData,
  overrides: PlanOverride[],
  ingredientLookup: Map<string, typeof coreIngredients[number]>
) => {
  let delta = EMPTY_DELTA;
  const updatedIngredients = [...meal.ingredients];
  const appliedOverrides: PlanOverride[] = [];

  overrides.forEach((override) => {
    const ingredientIndex = updatedIngredients.findIndex(
      ingredient => ingredient.id === override.originalIngredient
    );
    if (ingredientIndex === -1) {
      return;
    }
    const replacement = ingredientLookup.get(override.replacementIngredient);
    if (!replacement) {
      return;
    }
    updatedIngredients[ingredientIndex] = replacement;
    delta = sumMacroDelta(delta, override.macroDelta);
    appliedOverrides.push(override);
  });

  const updatedMacros = addMacroDelta({ ...meal.macros }, delta);

  return {
    meal: {
      ...meal,
      ingredients: updatedIngredients,
      macros: updatedMacros,
    },
    delta,
    appliedOverrides,
  };
};

const applyOverridesToDayPlan = (
  dayPlan: WeeklyMealPlanResult['days'][number]['plan'],
  overrides: PlanOverride[],
  ingredientLookup: Map<string, typeof coreIngredients[number]>
) => {
  let dayDelta = EMPTY_DELTA;
  const appliedOverrides: PlanOverride[] = [];
  const updatedDailyPlan = { ...dayPlan.dailyPlan };

  MEAL_TYPES.forEach((mealType) => {
    const mealOverrides = overrides.filter(override => override.mealType === mealType);
    if (mealOverrides.length === 0) {
      updatedDailyPlan[mealType] = {
        ...updatedDailyPlan[mealType],
        ingredients: [...updatedDailyPlan[mealType].ingredients],
        macros: { ...updatedDailyPlan[mealType].macros },
      };
      return;
    }

    const { meal, delta, appliedOverrides: applied } = applyOverridesToMeal(
      updatedDailyPlan[mealType],
      mealOverrides,
      ingredientLookup
    );

    updatedDailyPlan[mealType] = meal;
    dayDelta = sumMacroDelta(dayDelta, delta);
    appliedOverrides.push(...applied);
  });

  const updatedTotalMacros = addMacroDelta({ ...dayPlan.totalMacros }, dayDelta);
  const updatedVariance = computeVariance(updatedTotalMacros, dayPlan.targetMacros);

  return {
    updatedPlan: {
      ...dayPlan,
      dailyPlan: updatedDailyPlan,
      totalMacros: updatedTotalMacros,
      variance: updatedVariance,
    },
    appliedOverrides,
  };
};

const summarizeWeeklyTotals = (days: WeeklyMealPlanResult['days']) => {
  return days.reduce<Macros>(
    (acc, day) => ({
      calories: acc.calories + day.plan.totalMacros.calories,
      protein: acc.protein + day.plan.totalMacros.protein,
      carbs: acc.carbs + day.plan.totalMacros.carbs,
      fat: acc.fat + day.plan.totalMacros.fat,
      fiber: (acc.fiber || 0) + (day.plan.totalMacros.fiber || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
  );
};

export const buildPlanSnapshot = (input: PlanSnapshotInput): PlanSnapshot => {
  if (!VALID_SNAPSHOT_STATUSES.includes(input.status)) {
    throw new Error('Plan snapshot can only be built for LOCKED or EXPIRED plans.');
  }

  const { planPayload } = input;

  if (!planPayload.lockedAt) {
    throw new Error('Plan snapshot requires a locked plan payload.');
  }

  const ingredientLookup = buildIngredientLookup();
  const overrides = normalizeOverrides(input.pendingOverrides ?? []);

  const updatedDays: WeeklyMealPlanResult['days'] = [];
  const appliedOverrides: PlanOverride[] = [];

  planPayload.weeklyPlan.days.forEach((day) => {
    const { updatedPlan, appliedOverrides: applied } = applyOverridesToDayPlan(
      day.plan,
      overrides,
      ingredientLookup
    );
    appliedOverrides.push(...applied);
    updatedDays.push({
      dayNumber: day.dayNumber,
      dayName: day.dayName,
      plan: updatedPlan,
    });
  });

  const weeklyTotalMacros = summarizeWeeklyTotals(updatedDays);
  const weeklyTargetMacros = { ...planPayload.weeklyPlan.weeklyTargetMacros };
  const weeklyVariance = computeVariance(weeklyTotalMacros, weeklyTargetMacros);

  const weeklyPlan: WeeklyMealPlanResult = {
    days: updatedDays,
    weeklyTotalMacros,
    weeklyTargetMacros,
    weeklyVariance,
  };

  return {
    status: input.status,
    metadata: {
      planId: input.planId ?? null,
      planVersionId: input.planVersionId ?? null,
      clientId: input.clientId ?? null,
      generatedAt: planPayload.generatedAt,
      lockedAt: planPayload.lockedAt,
      snapshotCreatedAt: input.snapshotCreatedAt ?? planPayload.lockedAt ?? planPayload.generatedAt,
      macroTargets: { ...planPayload.macroTargets },
      likedIngredients: [...planPayload.likedIngredients],
      realismConstraintHit: planPayload.realismConstraintHit,
      constraintsHitDetails: planPayload.constraintsHitDetails ? [...planPayload.constraintsHitDetails] : undefined,
      overridesApplied: appliedOverrides,
    },
    weeklyPlan,
  };
};
