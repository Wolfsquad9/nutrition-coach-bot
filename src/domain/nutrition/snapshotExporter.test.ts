/**
 * Snapshot Distribution Layer Tests
 *
 * Proves that:
 *  1. Snapshot is unchanged after every export operation
 *  2. Export outputs contain correct data
 *  3. SnapshotExporter abstraction works
 */

import { describe, it, expect } from 'vitest';
import {
  exportSnapshotToPDF,
  exportSnapshotToEmailPayload,
  exportSnapshotToShareableJSON,
  pdfExporter,
  jsonExporter,
  emailExporter,
} from './snapshotExporter';
import { buildPlanSnapshot, type PlanSnapshot, type SnapshotBuildInput } from './snapshot';
import type { MealPlan, NutritionMetrics, GroceryItem } from '@/types';

// ============================================================================
// TEST FIXTURES
// ============================================================================

function createTestInput(): SnapshotBuildInput {
  const metrics: NutritionMetrics = {
    tdee: 2500,
    bmr: 1800,
    targetCalories: 2200,
    proteinGrams: 165,
    carbsGrams: 250,
    fatGrams: 73,
    fiberGrams: 30,
    waterLiters: 3,
  };

  const weeklyPlan: MealPlan[] = [
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
                id: 'r1',
                name: 'Oatmeal Bowl',
                category: 'breakfast',
                prepTime: 5,
                cookTime: 10,
                servings: 1,
                ingredients: [],
                instructions: ['Cook oats'],
                macrosPerServing: { calories: 350, protein: 12, carbs: 55, fat: 8 },
                tags: [],
                dietTypes: ['omnivore'],
                allergens: [],
                equipment: [],
                difficulty: 'easy',
              },
              servings: 1,
              adjustedMacros: { calories: 350, protein: 12, carbs: 55, fat: 8 },
            },
          ],
          totalMacros: { calories: 350, protein: 12, carbs: 55, fat: 8 },
        },
      ],
      totalMacros: { calories: 350, protein: 12, carbs: 55, fat: 8 },
      hydration: 3,
    },
  ];

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
    client: {
      firstName: 'John',
      lastName: 'Doe',
      goal: 'fat_loss',
      activityLevel: 'moderately_active',
    },
    metrics,
    weeklyPlan,
    groceryList,
    planName: 'Fat Loss Phase 1',
    versionNumber: 2,
    createdAt: '2025-01-15T10:00:00Z',
    generatedBy: 'coach',
  };
}

function deepCloneSnapshot(s: PlanSnapshot): any {
  return JSON.parse(JSON.stringify(s));
}

// ============================================================================
// SNAPSHOT BUILDER
// ============================================================================

describe('buildPlanSnapshot', () => {
  it('produces a frozen object', () => {
    const snapshot = buildPlanSnapshot(createTestInput());
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.identifier)).toBe(true);
    expect(Object.isFrozen(snapshot.client)).toBe(true);
    expect(Object.isFrozen(snapshot.metrics)).toBe(true);
    expect(Object.isFrozen(snapshot.meta)).toBe(true);
  });

  it('maps all fields correctly', () => {
    const input = createTestInput();
    const snapshot = buildPlanSnapshot(input);

    expect(snapshot.client.firstName).toBe('John');
    expect(snapshot.meta.versionNumber).toBe(2);
    expect(snapshot.metrics.targetCalories).toBe(2200);
    expect(snapshot.weeklyPlan).toHaveLength(1);
    expect(snapshot.groceryList).toHaveLength(2);
    expect(snapshot.identifier.payloadHash).toBe('sha256-deadbeef');
  });
});

// ============================================================================
// IMMUTABILITY AFTER EXPORT
// ============================================================================

describe('Snapshot immutability after export', () => {
  let snapshot: PlanSnapshot;
  let snapshotBefore: any;

  function freshSnapshot() {
    const s = buildPlanSnapshot(createTestInput());
    return { snapshot: s, before: deepCloneSnapshot(s) };
  }

  it('PDF export does not mutate snapshot', () => {
    const { snapshot, before } = freshSnapshot();
    exportSnapshotToPDF(snapshot);
    expect(deepCloneSnapshot(snapshot)).toEqual(before);
  });

  it('Email export does not mutate snapshot', () => {
    const { snapshot, before } = freshSnapshot();
    exportSnapshotToEmailPayload(snapshot);
    expect(deepCloneSnapshot(snapshot)).toEqual(before);
  });

  it('JSON export does not mutate snapshot', () => {
    const { snapshot, before } = freshSnapshot();
    exportSnapshotToShareableJSON(snapshot);
    expect(deepCloneSnapshot(snapshot)).toEqual(before);
  });

  it('multiple sequential exports do not mutate snapshot', () => {
    const { snapshot, before } = freshSnapshot();
    exportSnapshotToPDF(snapshot);
    exportSnapshotToEmailPayload(snapshot);
    exportSnapshotToShareableJSON(snapshot);
    exportSnapshotToPDF(snapshot);
    expect(deepCloneSnapshot(snapshot)).toEqual(before);
  });
});

// ============================================================================
// PDF EXPORTER OUTPUT
// ============================================================================

describe('exportSnapshotToPDF', () => {
  it('returns a jsPDF instance', () => {
    const snapshot = buildPlanSnapshot(createTestInput());
    const doc = exportSnapshotToPDF(snapshot);
    expect(doc).toBeDefined();
    expect(typeof doc.save).toBe('function');
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================================
// EMAIL EXPORTER OUTPUT
// ============================================================================

describe('exportSnapshotToEmailPayload', () => {
  it('builds a correct subject line', () => {
    const snapshot = buildPlanSnapshot(createTestInput());
    const payload = exportSnapshotToEmailPayload(snapshot);
    expect(payload.subject).toContain('John Doe');
    expect(payload.subject).toContain('v2');
  });

  it('includes daily targets in plain text body', () => {
    const snapshot = buildPlanSnapshot(createTestInput());
    const payload = exportSnapshotToEmailPayload(snapshot);
    expect(payload.plainTextBody).toContain('2200');
    expect(payload.plainTextBody).toContain('165');
  });

  it('includes integrity metadata', () => {
    const snapshot = buildPlanSnapshot(createTestInput());
    const payload = exportSnapshotToEmailPayload(snapshot);
    expect(payload.metadata.versionId).toBe('v-abc-123');
    expect(payload.metadata.payloadHash).toBe('sha256-deadbeef');
  });
});

// ============================================================================
// JSON EXPORTER OUTPUT
// ============================================================================

describe('exportSnapshotToShareableJSON', () => {
  it('wraps snapshot in an envelope with schema version', () => {
    const snapshot = buildPlanSnapshot(createTestInput());
    const json = exportSnapshotToShareableJSON(snapshot);
    expect(json.schemaVersion).toBe(1);
    expect(json.snapshot).toBe(snapshot);
  });

  it('includes integrity block', () => {
    const snapshot = buildPlanSnapshot(createTestInput());
    const json = exportSnapshotToShareableJSON(snapshot);
    expect(json.integrity.payloadHash).toBe('sha256-deadbeef');
    expect(json.integrity.versionId).toBe('v-abc-123');
  });

  it('sets exportedAt timestamp', () => {
    const snapshot = buildPlanSnapshot(createTestInput());
    const json = exportSnapshotToShareableJSON(snapshot);
    expect(json.exportedAt).toBeDefined();
    expect(() => new Date(json.exportedAt)).not.toThrow();
  });
});

// ============================================================================
// SNAPSHOTEXPORTER ABSTRACTION
// ============================================================================

describe('SnapshotExporter abstraction', () => {
  it('pdfExporter.export returns jsPDF', () => {
    const snapshot = buildPlanSnapshot(createTestInput());
    const doc = pdfExporter.export(snapshot);
    expect(typeof doc.save).toBe('function');
  });

  it('jsonExporter.export returns ShareableJSON', () => {
    const snapshot = buildPlanSnapshot(createTestInput());
    const result = jsonExporter.export(snapshot);
    expect(result.schemaVersion).toBe(1);
  });

  it('emailExporter.export returns EmailPayload', () => {
    const snapshot = buildPlanSnapshot(createTestInput());
    const result = emailExporter.export(snapshot);
    expect(result.subject).toBeDefined();
    expect(result.plainTextBody).toBeDefined();
  });

  it('all exporters have distinct names', () => {
    const names = [pdfExporter.name, jsonExporter.name, emailExporter.name];
    expect(new Set(names).size).toBe(3);
  });
});
