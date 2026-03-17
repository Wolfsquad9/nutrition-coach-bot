/**
 * Standalone snapshot fidelity test.
 * Compile: npx tsc -p tsconfig.tests.json
 * Run: node .tmp-tests/tests/planSnapshot.test.js
 */

import * as assert from 'node:assert';
import { buildPlanSnapshot } from "../src/domain/nutrition/snapshot";
import type { SnapshotBuildInput } from "../src/domain/nutrition/snapshot";
import type { MealPlan, GroceryItem, Macros, NutritionMetrics } from "../src/types";

function macros(cal: number, p: number, c: number, f: number): Macros {
  return { calories: cal, protein: p, carbs: c, fat: f };
}

function buildWeeklyPlan(): MealPlan[] {
  return [
    {
      day: 1,
      meals: [
        {
          id: "meal-1",
          mealNumber: 1,
          mealType: "breakfast",
          time: "07:00",
          recipes: [
            {
              recipe: {
                id: "recipe-1",
                name: "Oatmeal Bowl",
                category: "breakfast",
                prepTime: 5,
                cookTime: 10,
                servings: 1,
                ingredients: [
                  {
                    id: "i-oats",
                    name: "Oats",
                    amount: 80,
                    unit: "g",
                    category: "carb",
                    macrosPer100g: macros(389, 17, 66, 7),
                  },
                  {
                    id: "i-banana",
                    name: "Banana",
                    amount: 1,
                    unit: "piece",
                    category: "fruit",
                    macrosPer100g: macros(89, 1, 23, 0),
                  },
                ],
                instructions: ["Cook oats", "Slice banana"],
                macrosPerServing: macros(350, 12, 60, 8),
                tags: ["quick"],
                dietTypes: ["omnivore"],
                allergens: ["gluten"],
                equipment: [],
                difficulty: "easy",
              },
              servings: 1,
              adjustedMacros: macros(350, 12, 60, 8),
            },
          ],
          totalMacros: macros(350, 12, 60, 8),
        },
      ],
      totalMacros: macros(350, 12, 60, 8),
      hydration: 2.5,
    },
  ];
}

function buildGroceryList(): GroceryItem[] {
  return [
    { ingredient: "Oats", totalAmount: 80, unit: "g", category: "carb" },
    { ingredient: "Banana", totalAmount: 1, unit: "piece", category: "fruit" },
  ];
}

function run() {

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
      versionId: "version-1",
      lockedAt: now,
      lockedUntil,
      payloadHash: "payload-hash-test",
    },
    client: {
      firstName: "Test",
      lastName: "Client",
      goal: "muscle_gain",
      activityLevel: "moderate",
    },
    metrics,
    weeklyPlan: buildWeeklyPlan(),
    groceryList: buildGroceryList(),
    planName: "Test Plan",
    versionNumber: 1,
    createdAt: "2025-01-01T00:00:00Z",
    generatedBy: "coach",
  };

  const snapshot = buildPlanSnapshot(input);

  /* -------------------------------------------------------
     STRUCTURE
  ------------------------------------------------------- */

  assert.strictEqual(snapshot.meta.versionNumber, 1);
  assert.strictEqual(snapshot.client.firstName, "Test");
  assert.strictEqual(snapshot.client.lastName, "Client");

  assert.ok(snapshot.meta.createdAt);

  /* -------------------------------------------------------
     WEEKLY PLAN INTEGRITY
  ------------------------------------------------------- */

  assert.strictEqual(snapshot.weeklyPlan.length, 1);
  assert.strictEqual(snapshot.weeklyPlan[0].meals.length, 1);

  const recipe =
    snapshot.weeklyPlan[0].meals[0].recipes[0].recipe;

  assert.strictEqual(recipe.name, "Oatmeal Bowl");
  assert.strictEqual(recipe.ingredients.length, 2);

  /* -------------------------------------------------------
     INGREDIENT FIDELITY
  ------------------------------------------------------- */

  const oats = recipe.ingredients[0];

  assert.strictEqual(oats.name, "Oats");
  assert.strictEqual(oats.amount, 80);
  assert.strictEqual(oats.unit, "g");

  /* -------------------------------------------------------
     MACROS PRESERVED
  ------------------------------------------------------- */

  assert.strictEqual(snapshot.weeklyPlan[0].totalMacros.calories, 350);
  assert.strictEqual(snapshot.metrics.proteinGrams, 150);

  /* -------------------------------------------------------
     HYDRATION PRESERVED
  ------------------------------------------------------- */

  assert.strictEqual(snapshot.weeklyPlan[0].hydration, 2.5);

  /* -------------------------------------------------------
     GROCERY LIST
  ------------------------------------------------------- */

  assert.strictEqual(snapshot.groceryList.length, 2);
  assert.strictEqual(snapshot.groceryList[0].ingredient, "Oats");

  /* -------------------------------------------------------
     IDENTIFIER
  ------------------------------------------------------- */

  assert.strictEqual(snapshot.identifier.versionId, "version-1");
  assert.strictEqual(snapshot.identifier.payloadHash, "payload-hash-test");

  console.log("✅ Snapshot fidelity tests passed");

}

run();
