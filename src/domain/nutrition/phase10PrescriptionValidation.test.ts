/**
 * Phase 10 — P2: strengthen ACTIVE PRESCRIPTION validation (semantic, not just
 * structural). Malformed/out-of-range records must not silently become
 * authoritative; legacy payloads fall back to the canonical initial prescription.
 */

import { describe, it, expect } from 'vitest';
import {
  readPrescriptionRecord,
  buildPrescriptionRecord,
  deriveInitialPrescription,
} from './prescription';
import { resolveNutritionDecision } from './engine';
import type { Client } from '@/types';

const buildClient = (overrides: Partial<Client> = {}): Client =>
  ({
    id: 'c-p2',
    firstName: 'Ada',
    lastName: 'C',
    email: 'a@c.co',
    phone: '',
    birthDate: '1990-06-15',
    age: 34,
    gender: 'female',
    height: 170,
    weight: 68,
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

const GOOD_RX: Record<string, unknown> = {
  weeklyRateKg: -0.5,
  establishedAt: '2026-01-01T10:00:00.000Z',
  sourceVersionId: 'v-9',
};

const payloadWith = (rx: Record<string, unknown>): unknown => ({ nutritionPrescription: rx });
const GOOD = payloadWith(GOOD_RX);

describe('readPrescriptionRecord — semantic validation', () => {
  it('accepts a well-formed record', () => {
    expect(readPrescriptionRecord(GOOD)).toEqual({
      weeklyRateKg: -0.5,
      establishedAt: '2026-01-01T10:00:00.000Z',
      sourceVersionId: 'v-9',
    });
  });

  it('rejects a weekly rate outside the canonical permitted range', () => {
    expect(
      readPrescriptionRecord(payloadWith({ ...GOOD_RX, weeklyRateKg: -2.5 })),
    ).toBeNull();
  });

  it('rejects a non-finite weekly rate', () => {
    expect(
      readPrescriptionRecord(payloadWith({ ...GOOD_RX, weeklyRateKg: Number.NaN })),
    ).toBeNull();
  });

  it('rejects a non-parseable establishedAt timestamp', () => {
    expect(
      readPrescriptionRecord(payloadWith({ ...GOOD_RX, establishedAt: 'not-a-date' })),
    ).toBeNull();
  });

  it('rejects a malformed sourceVersionId', () => {
    expect(readPrescriptionRecord(payloadWith({ ...GOOD_RX, sourceVersionId: '' }))).toBeNull();
    expect(readPrescriptionRecord(payloadWith({ ...GOOD_RX, sourceVersionId: '  ' }))).toBeNull();
  });

  it('rejects non-object sugar (null / garbage) and falls back lazily', () => {
    for (const payload of [{}, null]) {
      expect(readPrescriptionRecord(payload)).toBeNull();
    }
    // Deterministic fallback:
    const rx = deriveInitialPrescription(buildClient());
    expect(rx.source).toBe('initial_profile');
  });
});

describe('buildPrescriptionRecord — out-of-range rates never enter the payload', () => {
  it('throws for a weekly rate beyond the canonical range', () => {
    expect(() =>
      buildPrescriptionRecord({
        weeklyRateKg: -3,
        lockedAt: new Date('2026-01-01T00:00:00Z'),
        versionId: 'v-1',
      }),
    ).toThrow(/weeklyRateKg/);
    expect(() =>
      buildPrescriptionRecord({
        weeklyRateKg: 5,
        lockedAt: new Date('2026-01-01T00:00:00Z'),
        versionId: 'v-1',
      }),
    ).toThrow(/weeklyRateKg/);
  });
});