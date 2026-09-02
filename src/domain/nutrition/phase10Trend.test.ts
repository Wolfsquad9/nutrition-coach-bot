/**
 * Phase 10 — P1: adaptation trend stays exact under IRREGULAR sampling.
 *
 * The observed weekly rate is a least-squares slope over smoothed weigh-ins.
 * Each rolling mean is associated with the TIME-CENTROID of the observations
 * that formed it, so irregular spacing, missing days, duplicate dates and
 * sparse windows must NOT bias the slope away from a perfectly linear trend.
 */

import { describe, it, expect } from 'vitest';
import { observedWeeklyRateKg, type WeightObservation } from './adaptation';

// ============================================================================
// HELPERS
// ============================================================================

function isoAddDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Exact linear trend: weight = start + perDay * dayNumber. */
function linearAtDay(days: number[], perDayKg: number, start = 80): WeightObservation[] {
  return days.map((d, i) => ({
    date: isoAddDays('2026-01-01', d),
    weightKg: start + perDayKg * d,
  }));
}

const DAILY = { days: Array.from({ length: 28 }, (_, i) => i) };

describe('P1 · irregular sampling does not corrupt the trend', () => {
  it('evenly spaced linear trend is recovered exactly (sanity)', () => {
    // -0.05 kg/day == -0.35 kg/week
    const obs = linearAtDay(DAILY.days, -0.05);
    expect(observedWeeklyRateKg(obs)).toBeCloseTo(-0.35, 9);
  });

  it('irregularly spaced linear trend is recovered exactly', () => {
    // Gaps vary: 0,1,3,6,10,15,21,28,36.
    const days = [0, 1, 3, 6, 10, 15, 21, 28, 36];
    const obs = linearAtDay(days, -0.05);
    expect(observedWeeklyRateKg(obs)).toBeCloseTo(-0.35, 9);
  });

  it('missing days within a long window are recovered exactly', () => {
    // 60 points, then drop ~half — still >=7 points spanning >=14 days.
    const all = Array.from({ length: 60 }, (_, i) => i);
    const missing = all.filter((d) => d % 2 === 0); // every other day
    const obs = linearAtDay(missing, 0.02);
    expect(observedWeeklyRateKg(obs)).toBeCloseTo(0.14, 9);
  });

  it('duplicate dates are handled deterministically and stay exact', () => {
    const obs: WeightObservation[] = [
      ...linearAtDay([0, 1, 3, 6, 10, 15, 21, 28], -0.04),
      // duplicate dates at day 10 and 21 with the SAME on-line weight
      { date: isoAddDays('2026-01-01', 10), weightKg: 80 - 0.04 * 10 },
      { date: isoAddDays('2026-01-01', 21), weightKg: 80 - 0.04 * 21 },
    ];
    expect(observedWeeklyRateKg(obs)).toBeCloseTo(-0.28, 9);
    expect(observedWeeklyRateKg(obs)).toBe(observedWeeklyRateKg(obs));
  });

  it('sparse observations (long gaps) still recover the linear slope', () => {
    const days = [0, 5, 10, 15, 20, 25, 30];
    const obs = linearAtDay(days, -0.1);
    expect(observedWeeklyRateKg(obs)).toBeCloseTo(-0.7, 9);
  });

  it('flat trend is zero', () => {
    const obs = Array.from({ length: 30 }, (_, i) => ({
      date: isoAddDays('2026-01-01', i),
      weightKg: 80,
    }));
    expect(observedWeeklyRateKg(obs)).toBeCloseTo(0, 9);
  });

  it('deterministic across repeated calls for irregular sampling', () => {
    const obs = linearAtDay([0, 1, 3, 6, 10, 15, 21, 28, 36], -0.05);
    expect(observedWeeklyRateKg(obs)).toBe(observedWeeklyRateKg(obs));
  });
});