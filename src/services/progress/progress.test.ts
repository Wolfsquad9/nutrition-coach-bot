import { describe, it, expect } from 'vitest';
import {
  latestWeightDelta,
  averageAdherence,
  todayIso,
  type ProgressEntryView,
} from './index';

const entry = (date: string, weight: number, adherence: number, bodyFat?: number): ProgressEntryView => ({
  id: `id-${date}`,
  date,
  weight,
  bodyFat,
  nutritionAdherence: adherence,
});

describe('latestWeightDelta', () => {
  it('returns 0 for empty list', () => {
    expect(latestWeightDelta([])).toBe(0);
  });

  it('returns 0 for single entry', () => {
    expect(latestWeightDelta([entry('2026-06-10', 80, 90)])).toBe(0);
  });

  it('returns positive delta when weight increased', () => {
    const entries = [
      entry('2026-06-01', 80, 90),
      entry('2026-06-08', 79.5, 90),
      entry('2026-06-10', 80.3, 90),
    ];
    expect(latestWeightDelta(entries)).toBeCloseTo(0.8, 5);
  });

  it('returns negative delta when weight decreased', () => {
    const entries = [
      entry('2026-06-01', 82, 90),
      entry('2026-06-10', 80.5, 90),
    ];
    expect(latestWeightDelta(entries)).toBeCloseTo(-1.5, 5);
  });
});

describe('averageAdherence', () => {
  it('returns 0 for empty list', () => {
    expect(averageAdherence([])).toBe(0);
  });

  it('rounds to nearest integer', () => {
    const entries = [
      entry('2026-06-01', 80, 80),
      entry('2026-06-02', 80, 90),
      entry('2026-06-03', 80, 95),
    ];
    // (80 + 90 + 95) / 3 = 88.33 → 88
    expect(averageAdherence(entries)).toBe(88);
  });

  it('handles single entry', () => {
    expect(averageAdherence([entry('2026-06-01', 80, 75)])).toBe(75);
  });
});

describe('todayIso', () => {
  it('returns YYYY-MM-DD format', () => {
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('pads month and day with leading zeros', () => {
    // Mock the date to 2026-01-05
    const RealDate = Date;
    const mockDate = new RealDate('2026-01-05T10:00:00Z');
    // @ts-expect-error — overriding for test
    global.Date = class extends RealDate { constructor(...args: unknown[]) { return args.length ? new RealDate(args[0] as string) : mockDate; } };
    try {
      expect(todayIso()).toBe('2026-01-05');
    } finally {
      global.Date = RealDate;
    }
  });
});
