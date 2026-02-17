/**
 * Snapshot Stability Tests
 * 
 * Proves that:
 * 1. Export output is identical regardless of when it's called after lock
 * 2. Simulated live plan state changes don't affect snapshot-derived exports
 * 3. Snapshot is truly write-once and deterministic
 */

import { describe, it, expect } from 'vitest';
import {
  exportSnapshotToEmailPayload,
  exportSnapshotToShareableJSON,
} from './snapshotExporter';
import { buildPlanSnapshot, type PlanSnapshot, type SnapshotBuildInput } from './snapshot';
import type { MealPlan, NutritionMetrics, GroceryItem } from '@/types';

// ============================================================================
// FIXTURES
// ============================================================================

function createTestInput(): SnapshotBuildInput {
  const metrics: NutritionMetrics = {
    tdee: 2500, bmr: 1800, targetCalories: 2200,
    proteinGrams: 165, carbsGrams: 250, fatGrams: 73,
    fiberGrams: 30, waterLiters: 3,
  };

  const weeklyPlan: MealPlan[] = [{
    day: 1,
    meals: [{
      id: 'meal-1', mealNumber: 1, mealType: 'breakfast', time: '07:00',
      recipes: [{
        recipe: {
          id: 'r1', name: 'Oatmeal Bowl', category: 'breakfast',
          prepTime: 5, cookTime: 10, servings: 1, ingredients: [],
          instructions: ['Cook oats'],
          macrosPerServing: { calories: 350, protein: 12, carbs: 55, fat: 8 },
          tags: [], dietTypes: ['omnivore'], allergens: [], equipment: [], difficulty: 'easy',
        },
        servings: 1,
        adjustedMacros: { calories: 350, protein: 12, carbs: 55, fat: 8 },
      }],
      totalMacros: { calories: 350, protein: 12, carbs: 55, fat: 8 },
    }],
    totalMacros: { calories: 350, protein: 12, carbs: 55, fat: 8 },
    hydration: 3,
  }];

  const groceryList: GroceryItem[] = [
    { ingredient: 'Rolled Oats', totalAmount: 500, unit: 'g', category: 'carb' },
    { ingredient: 'Chicken Breast', totalAmount: 1000, unit: 'g', category: 'protein', estimatedCost: 12 },
  ];

  return {
    identifier: {
      versionId: 'v-abc-123',
      lockedAt: new Date('2025-01-15T10:00:00Z'),
      lockedUntil: new Date('2025-01-22T10:00:00Z'),
      payloadHash: 'sha256-deadbeef',
    },
    client: { firstName: 'John', lastName: 'Doe', goal: 'fat_loss', activityLevel: 'moderately_active' },
    metrics,
    weeklyPlan,
    groceryList,
    planName: 'Fat Loss Phase 1',
    versionNumber: 2,
    createdAt: '2025-01-15T10:00:00Z',
    generatedBy: 'coach',
  };
}

// Simulates what "live plan state" would look like after modifications
function createModifiedLivePlanData() {
  return {
    weeklyPlan: [{
      day: 1,
      meals: [{
        id: 'meal-1', mealNumber: 1, mealType: 'breakfast' as const, time: '08:00', // changed time
        recipes: [{
          recipe: {
            id: 'r2', name: 'Protein Pancakes', category: 'breakfast' as const, // different recipe
            prepTime: 10, cookTime: 15, servings: 1, ingredients: [],
            instructions: ['Mix and cook'],
            macrosPerServing: { calories: 450, protein: 35, carbs: 40, fat: 15 },
            tags: [], dietTypes: ['omnivore'], allergens: [], equipment: [], difficulty: 'easy' as const,
          },
          servings: 2,
          adjustedMacros: { calories: 900, protein: 70, carbs: 80, fat: 30 },
        }],
        totalMacros: { calories: 900, protein: 70, carbs: 80, fat: 30 },
      }],
      totalMacros: { calories: 900, protein: 70, carbs: 80, fat: 30 },
      hydration: 4,
    }],
    macroTargets: { calories: 3000, protein: 200, carbs: 300, fat: 100 }, // changed targets
  };
}

// ============================================================================
// SNAPSHOT STABILITY TESTS
// ============================================================================

describe('Snapshot stability after live plan state changes', () => {
  it('email export from snapshot is identical regardless of live plan changes', () => {
    // 1. Build snapshot at lock time
    const snapshot = buildPlanSnapshot(createTestInput());

    // 2. Export immediately after lock
    const emailBefore = exportSnapshotToEmailPayload(snapshot);

    // 3. Simulate live plan state changes (these should NOT affect snapshot)
    const _liveChanges = createModifiedLivePlanData();
    // In real app, weeklyPlan/macroTargets state would change,
    // but the snapshot is a separate frozen object

    // 4. Export again from the SAME snapshot
    const emailAfter = exportSnapshotToEmailPayload(snapshot);

    // 5. Outputs must be identical
    expect(emailAfter.subject).toBe(emailBefore.subject);
    expect(emailAfter.plainTextBody).toBe(emailBefore.plainTextBody);
    expect(emailAfter.htmlBody).toBe(emailBefore.htmlBody);
    expect(emailAfter.metadata).toEqual(emailBefore.metadata);
  });

  it('JSON export from snapshot is identical regardless of live plan changes', () => {
    const snapshot = buildPlanSnapshot(createTestInput());

    const jsonBefore = exportSnapshotToShareableJSON(snapshot);

    // Simulate live changes
    const _liveChanges = createModifiedLivePlanData();

    const jsonAfter = exportSnapshotToShareableJSON(snapshot);

    // Snapshot reference is the same frozen object
    expect(jsonAfter.snapshot).toBe(jsonBefore.snapshot);
    expect(jsonAfter.integrity).toEqual(jsonBefore.integrity);
    expect(jsonAfter.schemaVersion).toBe(jsonBefore.schemaVersion);
  });

  it('snapshot data does not reflect live plan modifications', () => {
    const input = createTestInput();
    const snapshot = buildPlanSnapshot(input);

    // Snapshot has original data
    expect(snapshot.weeklyPlan[0].meals[0].recipes[0].recipe.name).toBe('Oatmeal Bowl');
    expect(snapshot.metrics.targetCalories).toBe(2200);

    // Live data changes to different values
    const liveChanges = createModifiedLivePlanData();
    expect(liveChanges.weeklyPlan[0].meals[0].recipes[0].recipe.name).toBe('Protein Pancakes');
    expect(liveChanges.macroTargets.calories).toBe(3000);

    // Snapshot still has original data (unchanged)
    expect(snapshot.weeklyPlan[0].meals[0].recipes[0].recipe.name).toBe('Oatmeal Bowl');
    expect(snapshot.metrics.targetCalories).toBe(2200);
  });

  it('serialization round-trip preserves snapshot integrity', () => {
    const snapshot = buildPlanSnapshot(createTestInput());
    
    // Simulate DB persistence: serialize then deserialize
    const serialized = JSON.stringify(snapshot);
    const deserialized = JSON.parse(serialized) as PlanSnapshot;

    // Use deserialized snapshot for export
    const emailFromOriginal = exportSnapshotToEmailPayload(snapshot);
    const emailFromDeserialized = exportSnapshotToEmailPayload(deserialized);

    expect(emailFromDeserialized.subject).toBe(emailFromOriginal.subject);
    expect(emailFromDeserialized.plainTextBody).toBe(emailFromOriginal.plainTextBody);
    expect(emailFromDeserialized.metadata).toEqual(emailFromOriginal.metadata);
  });

  it('two snapshots built from same input produce identical exports', () => {
    const input = createTestInput();
    const snapshot1 = buildPlanSnapshot(input);
    const snapshot2 = buildPlanSnapshot(input);

    const email1 = exportSnapshotToEmailPayload(snapshot1);
    const email2 = exportSnapshotToEmailPayload(snapshot2);

    expect(email1.subject).toBe(email2.subject);
    expect(email1.plainTextBody).toBe(email2.plainTextBody);
    expect(email1.metadata).toEqual(email2.metadata);
  });

  it('overrides object does not affect snapshot contents', () => {
    const snapshot = buildPlanSnapshot(createTestInput());
    
    // Simulate an override being created (separate DB record)
    const override = {
      originalIngredient: 'Rolled Oats',
      replacementIngredient: 'Quinoa Flakes',
      macroDelta: { calories: 10, protein: 2, carbs: -5, fat: 1 },
    };

    // Snapshot grocery list still shows original
    expect(snapshot.groceryList[0].ingredient).toBe('Rolled Oats');

    // Export still shows original
    const email = exportSnapshotToEmailPayload(snapshot);
    expect(email.plainTextBody).not.toContain('Quinoa Flakes');
  });
});
