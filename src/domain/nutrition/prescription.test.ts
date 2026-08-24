/**
 * Active Nutrition Prescription — domain tests (Phase 8)
 *
 * Locks down the three-concept separation:
 *   1. historical plan snapshot  — immutable, never rewritten
 *   2. ACTIVE PRESCRIPTION       — current authoritative target baseline;
 *                                  replaced only by an explicit lock
 *   3. draft plan                — temporary, never authoritative
 *
 * The prescription carries exactly the values that CANNOT be deterministically
 * derived from canonical inputs (the effective weekly rate after an adaptation
 * cycle) plus provenance. All nutrition values are always recomputed by the
 * canonical engine.
 */

import { describe, it, expect } from 'vitest';
import {
  prescriptionFromLockedPlan,
  deriveInitialPrescription,
  buildPrescriptionRecord,
  type NutritionPrescriptionRecord,
} from './prescription';
import { resolveNutritionDecision } from './engine';
import type { Client } from '@/types';

const buildClient = (overrides: Partial<Client> = {}): Client =>
  ({
    id: 'c-rx',
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'j@doe.com',
    phone: '',
    birthDate: '1995-06-15',
    age: 30,
    gender: 'male',
    height: 180,
    weight: 80,
    activityLevel: 'moderately_active',
    primaryGoal: 'fat_loss',
    weeklyWeightChange: -0.5,
    dietType: 'omnivore',
    mealsPerDay: 3,
    intolerances: [],
    allergies: [],
    dislikedFoods: [],
    medicalConditions: [],
    medications: [],
    injuries: [],
    hasRedFlags: false,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }) as Client;

describe('deriveInitialPrescription (lazy canonical initialization)', () => {
  it('derives the initial prescription from the canonical profile decision', () => {
    const client = buildClient();
    const rx = deriveInitialPrescription(client);
    const decision = resolveNutritionDecision({
      weightKg: client.weight,
      heightCm: client.height,
      age: client.age!,
      gender: client.gender,
      activityLevel: client.activityLevel,
      primaryGoal: client.primaryGoal,
      weeklyWeightChange: client.weeklyWeightChange,
    });

    expect(rx.targetCalories).toBe(decision.energy.targetCalories);
    expect(rx.weeklyRateKg).toBe(decision.rate.weeklyRateKg);
    expect(rx.source).toBe('initial_profile');
    expect(rx.versionId).toBeNull();
    expect(rx.versionNumber).toBeNull();
    expect(rx.establishedAt).toBeNull();
  });

  it('is deterministic for identical clients', () => {
    expect(deriveInitialPrescription(buildClient())).toEqual(
      deriveInitialPrescription(buildClient()),
    );
  });

  it('differs when the profile basis differs (belongs to the right client basis)', () => {
    const leaner = deriveInitialPrescription(buildClient({ weight: 70 }));
    const heavier = deriveInitialPrescription(buildClient({ weight: 90 }));
    expect(leaner.targetCalories).not.toBe(heavier.targetCalories);
    expect(leaner.weeklyRateKg).toBe(heavier.weeklyRateKg); // same requested rate
  });
});

describe('prescriptionFromLockedPlan (explicit lock provenance)', () => {
  it('maps the locked prescription with version provenance', () => {
    const rx = prescriptionFromLockedPlan({
      weeklyRateKg: -0.6363636363636364,
      targetCalories: 2059,
      versionId: 'v-2',
      versionNumber: 2,
      establishedAt: '2026-02-01T10:00:00.000Z',
    });
    expect(rx).toEqual({
      targetCalories: 2059,
      weeklyRateKg: -0.6363636363636364,
      source: 'locked_plan',
      versionId: 'v-2',
      versionNumber: 2,
      establishedAt: '2026-02-01T10:00:00.000Z',
    });
  });

  it('is a distinct concept from a historical snapshot (no snapshot fields)', () => {
    const rx = prescriptionFromLockedPlan({
      weeklyRateKg: -0.5,
      targetCalories: 2209,
      versionId: 'v-1',
      versionNumber: 1,
      establishedAt: '2026-01-01T10:00:00.000Z',
    });
    const keys = Object.keys(rx).sort();
    expect(keys).toEqual(
      ['establishedAt', 'source', 'targetCalories', 'versionId', 'versionNumber', 'weeklyRateKg'].sort(),
    );
    // It never carries plan payload data (weeklyPlan/groceryList/etc.).
    expect('weeklyPlan' in rx).toBe(false);
    expect('groceryList' in rx).toBe(false);
  });
});

describe('buildPrescriptionRecord (persisted payload record)', () => {
  it('records the effective rate, establishment time, and source version', () => {
    const record: NutritionPrescriptionRecord = buildPrescriptionRecord({
      weeklyRateKg: -0.6363636363636364,
      lockedAt: new Date('2026-02-01T10:00:00Z'),
      versionId: 'v-2',
    });
    expect(record).toEqual({
      weeklyRateKg: -0.6363636363636364,
      establishedAt: '2026-02-01T10:00:00.000Z',
      sourceVersionId: 'v-2',
    });
  });

  it('rejects non-finite or missing rates (never persists garbage)', () => {
    expect(() =>
      buildPrescriptionRecord({
        weeklyRateKg: Number.NaN,
        lockedAt: new Date('2026-02-01T10:00:00Z'),
        versionId: 'v-x',
      }),
    ).toThrow(/weeklyRateKg/);
    expect(() =>
      buildPrescriptionRecord({
        weeklyRateKg: Number.POSITIVE_INFINITY,
        lockedAt: new Date('2026-02-01T10:00:00Z'),
        versionId: 'v-x',
      }),
    ).toThrow(/weeklyRateKg/);
  });
});
