/**
 * Client schema — unit tests.
 *
 * Goal: lock in the safety properties the schema is supposed to enforce.
 * If any of these fail, the schema is letting bad data through and we are
 * back to "edge functions get garbage and silently produce wrong plans".
 */

import { describe, it, expect } from 'vitest';
import {
  ClientSchema,
  validateClient,
  isClient,
  flattenZodErrors,
} from './clientSchema';
import type { Client } from '@/types';

// Minimal valid client fixture — every required field set to a safe default.
const baseClient: Client = {
  id: 'c-1',
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  phone: '+15555550100',
  birthDate: '1990-12-10',
  gender: 'female',
  age: 35,
  height: 165,
  weight: 60,
  activityLevel: 'moderately_active',
  primaryGoal: 'maintenance',
  trainingExperience: 'intermediate',
  trainingDaysPerWeek: 4,
  sessionDuration: 60,
  preferredTrainingStyle: 'strength',
  equipment: ['dumbbells', 'barbell'],
  dietType: 'omnivore',
  mealsPerDay: 4,
  intolerances: [],
  allergies: [],
  dislikedFoods: [],
  medicalConditions: [],
  medications: [],
  injuries: [],
  hasRedFlags: false,
  createdAt: '2026-06-17T00:00:00.000Z',
  updatedAt: '2026-06-17T00:00:00.000Z',
};

describe('ClientSchema', () => {
  it('accepts a fully valid client', () => {
    expect(validateClient(baseClient).ok).toBe(true);
  });

  it('rejects an invalid email', () => {
    const result = validateClient({ ...baseClient, email: 'not-an-email' });
    expect(result.ok).toBe(false);
    if ('errors' in result) {
      expect(result.errors.email).toMatch(/invalid email/i);
    }
  });

  it('rejects weight outside the safe range', () => {
    const tooLow = validateClient({ ...baseClient, weight: 5 });
    expect(tooLow.ok).toBe(false);

    const tooHigh = validateClient({ ...baseClient, weight: 500 });
    expect(tooHigh.ok).toBe(false);
  });

  it('rejects an unknown primaryGoal value', () => {
    const result = validateClient({ ...baseClient, primaryGoal: 'become_immortal' });
    expect(result.ok).toBe(false);
  });

  it('rejects mealsPerDay outside {3,4,5,6}', () => {
    const result = validateClient({ ...baseClient, mealsPerDay: 7 as unknown as 3 });
    expect(result.ok).toBe(false);
  });

  it('rejects birthDate that is not YYYY-MM-DD', () => {
    const result = validateClient({ ...baseClient, birthDate: '17/12/1990' });
    expect(result.ok).toBe(false);
  });

  it('rejects extreme BMI (height/weight combo) via the BMI refine', () => {
    // height 150cm + weight 25kg = BMI ~11 — should be refused.
    const result = validateClient({ ...baseClient, height: 150, weight: 25 });
    expect(result.ok).toBe(false);
  });

  it('rejects |weeklyWeightChange| > 1.5', () => {
    const result = validateClient({ ...baseClient, weeklyWeightChange: 2.5 });
    expect(result.ok).toBe(false);
  });

  it('isClient is a type guard that narrows', () => {
    const input: unknown = baseClient;
    if (isClient(input)) {
      // If this compiles, the narrowing works.
      const _id: string = input.id;
      expect(_id).toBe('c-1');
    } else {
      throw new Error('isClient should have returned true for baseClient');
    }
  });

  it('isClient returns false for garbage', () => {
    expect(isClient({ id: 'x' })).toBe(false);
    expect(isClient(null)).toBe(false);
    expect(isClient(42)).toBe(false);
    expect(isClient('not a client')).toBe(false);
  });

  it('parses the raw schema successfully', () => {
    const result = ClientSchema.safeParse(baseClient);
    expect(result.success).toBe(true);
  });

  it('flattenZodErrors returns first error per field', () => {
    const result = ClientSchema.safeParse({ ...baseClient, email: 'bad', weight: -1 });
    if (result.success) throw new Error('expected failure');
    const flat = flattenZodErrors(result.error);
    expect(typeof flat.email).toBe('string');
    expect(typeof flat.weight).toBe('string');
  });
});
