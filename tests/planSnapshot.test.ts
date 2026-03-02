/**
 * Standalone snapshot fidelity test.
 * Compiled with: npx tsc -p tsconfig.tests.json
 * Run with: node .tmp-tests/tests/planSnapshot.test.js
 */
import assert from 'node:assert';
import { buildPlanSnapshot } from '../src/domain/nutrition/snapshot';
import type { SnapshotBuildInput } from '../src/domain/nutrition/snapshot';
import type { MealPlan, GroceryItem, Macros, NutritionMetrics } from '../src/types/index';

function makeMacros(cals: number, p: number, c: number, f: number): Macros {
  return { calories: cals, protein: p, carbs: c, fat: f };
}

function makeWeeklyPlan(): MealPlan[] {
  return [
    {
      day: 1,
      meals: [
        {
          id: 'meal-1',
          mealNumber: 1,
          mealType: 'breakfast',
          time: '07:00',
          recipes: [
            {
              recipe: {
                id: 'r-1',
                name: 'Oatmeal Bowl',
                category: 'breakfast',
                prepTime: 5,
                cookTime: 10,
                servings: 1,
                ingredients: [
                  {
                    id: 'i-1',
                    name: 'Oats',
                    amount: 80,
                    unit: 'g',
                    category: 'carb',
                    macrosPer100g: makeMacros(389, 17, 66, 7),
                  },
                  {
                    id: 'i-2',
                    name: 'Banana',
                    amount: 1,
                    unit: 'piece',
                    category: 'fruit',
                    macrosPer100g: makeMacros(89, 1, 23, 0),
                  },
                ],
                instructions: ['Cook oats', 'Slice banana'],
                macrosPerServing: makeMacros(350, 12, 60, 8),
                tags: ['quick'],
                dietTypes: ['omnivore'],
                allergens: ['gluten'],
                equipment: [],
                difficulty: 'easy',
              },
              servings: 1,
              adjustedMacros: makeMacros(350, 12, 60, 8),
            },
          ],
          totalMacros: makeMacros(350, 12, 60, 8),
        },
      ],
      totalMacros: makeMacros(350, 12, 60, 8),
      hydration: 2.5,
    },
  ];
}

function makeGroceryList(): GroceryItem[] {
  return [
    { ingredient: 'Oats', totalAmount: 80, unit: 'g', category: 'grains' },
    { ingredient: 'Banana', totalAmount: 1, unit: 'piece', category: 'fruit' },
  ];
}

function run(): void {
  const now = new Date();
  const lockedUntil = new Date(now);
  lockedUntil.setDate(lockedUntil.getDate() + 14);

  const metrics: NutritionMetrics = {
    tdee: 2500,
    bmr: 1800,
    targetCalories: 2000,
    proteinGrams: 150,
    carbsGrams: 250,
    fatGrams: 70,
    fiberGrams: 30,
    waterLiters: 3,
  };

  const input: SnapshotBuildInput = {
    identifier: {
      versionId: 'v-001',
      lockedAt: now,
      lockedUntil,
      payloadHash: 'abc123',
    },
    client: {
      firstName: 'Test',
      lastName: 'Client',
      goal: 'muscle_gain',
      activityLevel: 'moderate',
    },
    metrics,
    weeklyPlan: makeWeeklyPlan(),
    groceryList: makeGroceryList(),
    planName: 'Test Plan',
    versionNumber: 1,
    createdAt: '2025-01-01T00:00:00Z',
    generatedBy: 'coach',
  };

  const snap = buildPlanSnapshot(input);

  // Structure
  assert.strictEqual(snap.meta.versionNumber, 1, 'version must match');
  assert.strictEqual(snap.client.firstName, 'Test');
  assert.strictEqual(snap.client.lastName, 'Client');
  assert.ok(snap.meta.createdAt, 'createdAt must exist');

  // Meals preserved
  assert.strictEqual(snap.weeklyPlan.length, 1, 'must have 1 day');
  assert.strictEqual(snap.weeklyPlan[0].meals.length, 1, 'must have 1 meal');
  assert.strictEqual(snap.weeklyPlan[0].meals[0].recipes[0].recipe.name, 'Oatmeal Bowl');
  assert.strictEqual(snap.weeklyPlan[0].meals[0].recipes[0].recipe.ingredients.length, 2);

  // Ingredient quantities preserved
  const oats = snap.weeklyPlan[0].meals[0].recipes[0].recipe.ingredients[0];
  assert.strictEqual(oats.name, 'Oats');
  assert.strictEqual(oats.amount, 80);
  assert.strictEqual(oats.unit, 'g');

  // Macros preserved
  assert.strictEqual(snap.weeklyPlan[0].totalMacros.calories, 350);
  assert.strictEqual(snap.metrics.proteinGrams, 150);

  // Hydration preserved
  assert.strictEqual(snap.weeklyPlan[0].hydration, 2.5);

  // Grocery list preserved
  assert.strictEqual(snap.groceryList.length, 2);
  assert.strictEqual(snap.groceryList[0].ingredient, 'Oats');

  // Identifier preserved
  assert.strictEqual(snap.identifier.versionId, 'v-001');
  assert.strictEqual(snap.identifier.payloadHash, 'abc123');

  console.log('✅ All snapshot fidelity assertions passed');
}

run();
