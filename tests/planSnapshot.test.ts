import { strict as assert } from 'node:assert';
import { buildPlanSnapshot } from '../src/utils/planSnapshot.js';
import { resolveSnapshotWeeklyPlan } from '../src/utils/snapshotResolver.js';
import { coreIngredients } from '../src/data/ingredientDatabase.js';
import type { WeeklyMealPlanResult } from '../src/services/recipeService.js';
import type { PlanPayload } from '../src/services/supabasePlanService.js';
import type { PlanOverride } from '../src/services/supabaseOverrideService.js';
import type { PlanSnapshot } from '../src/types/planSnapshot.js';

const chicken = coreIngredients.find(ingredient => ingredient.id === 'chicken-breast');
const tofu = coreIngredients.find(ingredient => ingredient.id === 'tofu');
const oats = coreIngredients.find(ingredient => ingredient.id === 'oats');

if (!chicken || !tofu || !oats) {
  throw new Error('Test ingredients missing from coreIngredients.');
}

const baseWeeklyPlan: WeeklyMealPlanResult = {
  days: [
    {
      dayNumber: 1,
      dayName: 'Lundi',
      plan: {
        dailyPlan: {
          breakfast: {
            ingredients: [oats],
            recipeText: 'Oat bowl',
            macros: { calories: 150, protein: 6, carbs: 24, fat: 3 },
          },
          lunch: {
            ingredients: [chicken],
            recipeText: 'Chicken bowl',
            macros: { calories: 300, protein: 40, carbs: 0, fat: 8 },
          },
          dinner: { ingredients: [], recipeText: '', macros: { calories: 0, protein: 0, carbs: 0, fat: 0 } },
          snack: { ingredients: [], recipeText: '', macros: { calories: 0, protein: 0, carbs: 0, fat: 0 } },
        },
        totalMacros: { calories: 450, protein: 46, carbs: 24, fat: 11 },
        targetMacros: { calories: 500, protein: 50, carbs: 40, fat: 15 },
        variance: { calories: -50, protein: -4, carbs: -16, fat: -4 },
      },
    },
  ],
  weeklyTotalMacros: { calories: 450, protein: 46, carbs: 24, fat: 11 },
  weeklyTargetMacros: { calories: 3500, protein: 350, carbs: 280, fat: 105 },
  weeklyVariance: { calories: -3050, protein: -304, carbs: -256, fat: -94 },
};

const payload: PlanPayload = {
  type: 'nutrition',
  generatedAt: '2024-01-01T00:00:00.000Z',
  lockedAt: '2024-01-02T00:00:00.000Z',
  macroTargets: { calories: 500, protein: 50, carbs: 40, fat: 15 },
  weeklyPlan: baseWeeklyPlan,
  likedIngredients: ['chicken-breast'],
};

const override: PlanOverride = {
  id: 'override-1',
  planVersionId: 'version-1',
  clientId: 'client-1',
  mealType: 'lunch',
  originalIngredient: 'chicken-breast',
  replacementIngredient: 'tofu',
  macroDelta: { calories: -50, protein: -10, carbs: 5, fat: 2 },
  withinTolerance: true,
  suggestedBy: 'coach',
  approvedBy: null,
  createdAt: '2024-01-03T00:00:00.000Z',
  archived: false,
  requiresRecipeRegeneration: false,
};

// immutability + base deterministic check
const snapshot = buildPlanSnapshot({
  status: 'LOCKED',
  planPayload: payload,
  pendingOverrides: [override],
  snapshotCreatedAt: '2024-01-05T00:00:00.000Z',
});
assert.equal(snapshot.weeklyPlan.days[0].plan.dailyPlan.lunch.ingredients[0].id, 'tofu');
assert.equal(payload.weeklyPlan.days[0].plan.dailyPlan.lunch.ingredients[0].id, 'chicken-breast');

const snapshotAgain = buildPlanSnapshot({
  status: 'LOCKED',
  planPayload: payload,
  pendingOverrides: [override],
  snapshotCreatedAt: '2024-01-05T00:00:00.000Z',
});
assert.deepEqual(snapshot, snapshotAgain);

// unknown replacement ingredient should be ignored safely
const unknownReplacementSnapshot = buildPlanSnapshot({
  status: 'LOCKED',
  planPayload: payload,
  pendingOverrides: [{ ...override, id: 'override-unknown', replacementIngredient: 'missing-food-id' }],
  snapshotCreatedAt: '2024-01-05T00:00:00.000Z',
});
assert.equal(unknownReplacementSnapshot.weeklyPlan.days[0].plan.dailyPlan.lunch.ingredients[0].id, 'chicken-breast');

// deterministic sorting for same createdAt using ID tiebreaker
const sameTimeOverrides: PlanOverride[] = [
  { ...override, id: 'b-override', macroDelta: { calories: -10, protein: -2, carbs: 1, fat: 0 }, createdAt: '2024-01-03T00:00:00.000Z' },
  { ...override, id: 'a-override', macroDelta: { calories: -20, protein: -3, carbs: 1, fat: 1 }, createdAt: '2024-01-03T00:00:00.000Z' },
];

const sortedSnapshotA = buildPlanSnapshot({
  status: 'LOCKED',
  planPayload: payload,
  pendingOverrides: sameTimeOverrides,
  snapshotCreatedAt: '2024-01-05T00:00:00.000Z',
});

const sortedSnapshotB = buildPlanSnapshot({
  status: 'LOCKED',
  planPayload: payload,
  pendingOverrides: [...sameTimeOverrides].reverse(),
  snapshotCreatedAt: '2024-01-05T00:00:00.000Z',
});

assert.deepEqual(sortedSnapshotA, sortedSnapshotB);
assert.deepEqual(
  sortedSnapshotA.metadata.overridesApplied.map(ov => ov.id),
  ['a-override']
);

// multi-meal overrides should recompute day and week totals
const multiMealSnapshot = buildPlanSnapshot({
  status: 'LOCKED',
  planPayload: payload,
  pendingOverrides: [
    { ...override, id: 'lunch-change' },
    {
      ...override,
      id: 'breakfast-change',
      mealType: 'breakfast',
      originalIngredient: 'oats',
      replacementIngredient: 'tofu',
      macroDelta: { calories: -30, protein: 4, carbs: -10, fat: 1 },
      createdAt: '2024-01-04T00:00:00.000Z',
    },
  ],
  snapshotCreatedAt: '2024-01-05T00:00:00.000Z',
});

assert.equal(multiMealSnapshot.weeklyPlan.days[0].plan.totalMacros.calories, 370);
assert.equal(multiMealSnapshot.weeklyPlan.days[0].plan.totalMacros.protein, 40);
assert.equal(multiMealSnapshot.weeklyPlan.days[0].plan.totalMacros.carbs, 19);
assert.equal(multiMealSnapshot.weeklyPlan.days[0].plan.totalMacros.fat, 14);
assert.equal(multiMealSnapshot.weeklyPlan.weeklyTotalMacros.calories, 370);

// integration-oriented check: persisted snapshot is canonical for locked plans
const persistedLockedSnapshot: PlanSnapshot = {
  status: 'LOCKED',
  metadata: {
    generatedAt: payload.generatedAt,
    lockedAt: payload.lockedAt!,
    snapshotCreatedAt: '2024-01-06T00:00:00.000Z',
    macroTargets: payload.macroTargets,
    likedIngredients: payload.likedIngredients,
    overridesApplied: [],
  },
  weeklyPlan: {
    ...baseWeeklyPlan,
    weeklyTotalMacros: { calories: 999, protein: 111, carbs: 222, fat: 33 },
    weeklyVariance: { calories: -1, protein: -2, carbs: -3, fat: -4 },
  },
};

let buildCalled = false;
const resolvedFromPersisted = resolveSnapshotWeeklyPlan(
  {
    activeClientId: 'client-1',
    isLocked: true,
    lockIsActive: true,
    weeklyPlan: baseWeeklyPlan,
    macroTargets: payload.macroTargets,
    likedIngredients: payload.likedIngredients,
    pendingOverrides: [override, { ...override, id: 'override-2' }],
    planId: 'plan-1',
    versionId: 'version-1',
    planCreatedAt: '2024-01-02T00:00:00.000Z',
    planGeneratedAt: payload.generatedAt,
    planLockedAt: payload.lockedAt!,
    snapshot: persistedLockedSnapshot,
  },
  () => {
    buildCalled = true;
    throw new Error('build should not be called when persisted snapshot exists');
  }
);

assert.equal(buildCalled, false);
assert.equal(resolvedFromPersisted?.weeklyTotalMacros.calories, 999);

const resolvedFromPersistedAgain = resolveSnapshotWeeklyPlan(
  {
    activeClientId: 'client-1',
    isLocked: true,
    lockIsActive: true,
    weeklyPlan: baseWeeklyPlan,
    macroTargets: payload.macroTargets,
    likedIngredients: payload.likedIngredients,
    pendingOverrides: [override],
    planId: 'plan-1',
    versionId: 'version-1',
    planCreatedAt: '2024-01-02T00:00:00.000Z',
    planGeneratedAt: payload.generatedAt,
    planLockedAt: payload.lockedAt!,
    snapshot: persistedLockedSnapshot,
  },
  () => {
    throw new Error('build should not be called when persisted snapshot exists');
  }
);

assert.deepEqual(resolvedFromPersisted, resolvedFromPersistedAgain);
