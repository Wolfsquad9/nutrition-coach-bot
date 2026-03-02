/**
 * Standalone snapshot fidelity test.
 * Can be compiled with: npx tsc -p tsconfig.tests.json
 * Then run with: node .tmp-tests/tests/planSnapshot.test.js
 */
import assert from 'node:assert';
import { buildPlanSnapshot } from '../src/domain/nutrition/snapshot';
import type { PlanSnapshotInput } from '../src/domain/nutrition/snapshot';

function makeMealPlan() {
  return [
    {
      day: 1,
      meals: [
        {
          name: 'Breakfast',
          recipes: [
            {
              name: 'Oatmeal Bowl',
              ingredients: [
                { name: 'Oats', quantity: 80, unit: 'g' },
                { name: 'Banana', quantity: 1, unit: 'unit' },
              ],
              macros: { calories: 350, protein: 12, carbs: 60, fats: 8 },
            },
          ],
          macros: { calories: 350, protein: 12, carbs: 60, fats: 8 },
        },
      ],
      totalMacros: { calories: 350, protein: 12, carbs: 60, fats: 8 },
      hydration: 0,
    },
  ];
}

function run() {
  const input: PlanSnapshotInput = {
    versionNumber: 1,
    createdAt: '2025-01-01T00:00:00Z',
    clientName: 'Test Client',
    clientGoal: 'muscle_gain',
    activityLevel: 'moderate',
    meals: makeMealPlan(),
    macroTargets: { calories: 2000, protein: 150, carbs: 250, fats: 70 },
    likedIngredients: ['Oats'],
    groceryList: [{ name: 'Oats', quantity: 80, unit: 'g', category: 'grains' }],
  };

  const snap = buildPlanSnapshot(input);

  // Structure
  assert.strictEqual(snap.version, 1, 'version must match');
  assert.strictEqual(snap.clientName, 'Test Client');
  assert.ok(snap.createdAt, 'createdAt must exist');

  // Meals preserved
  assert.strictEqual(snap.meals.length, 1, 'must have 1 day');
  assert.strictEqual(snap.meals[0].meals.length, 1, 'must have 1 meal');
  assert.strictEqual(snap.meals[0].meals[0].recipes[0].name, 'Oatmeal Bowl');
  assert.strictEqual(snap.meals[0].meals[0].recipes[0].ingredients.length, 2);

  // Macros preserved
  assert.strictEqual(snap.meals[0].totalMacros.calories, 350);
  assert.strictEqual(snap.macroTargets.protein, 150);

  // Grocery list preserved
  assert.strictEqual(snap.groceryList.length, 1);
  assert.strictEqual(snap.groceryList[0].name, 'Oats');

  console.log('✅ All snapshot fidelity assertions passed');
}

run();
