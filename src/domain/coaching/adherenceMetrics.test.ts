/**
 * Unit tests for the canonical adherence/compliance computation.
 *
 * These pin the P0-2 contract: every displayed adherence metric is derived
 * from REAL persisted evidence (daily_checkins.meal_adherence and
 * weekly_reviews.adherence_score), daily evidence takes precedence over
 * weekly reviews per ISO week, and missing data is NEVER fabricated as 0%.
 */
import { describe, it, expect } from 'vitest';
import {
  computeAdherenceMetrics,
  computeAdherenceTrend,
  adherenceWindowEndingOn,
  daysBetween,
  isoWeekStartOf,
  weekIntersectsWindow,
  TREND_MIN_SAMPLES,
  type AdherenceSample,
} from './adherenceMetrics';
import type {
  DailyCheckinLike,
  WeeklyReviewLike,
} from '@/domain/nutrition/adaptation';

function daily(date: string, meal_adherence: number | null): DailyCheckinLike {
  return { checkin_date: date, current_weight_kg: null, meal_adherence };
}

function weekly(week_start_date: string, adherence_score: number | null): WeeklyReviewLike {
  return { week_start_date, bodyweight_kg: null, adherence_score };
}

const WINDOW = { startDate: '2026-10-13', endDate: '2026-10-19' };

describe('adherenceMetrics', () => {
  describe('computeAdherenceMetrics', () => {
    it('averages real daily check-in adherence inside the window', () => {
      const metrics = computeAdherenceMetrics({
        dailyCheckins: [
          daily('2026-10-13', 80),
          daily('2026-10-15', 60),
          daily('2026-10-19', 100),
        ],
        weeklyReviews: [],
        window: WINDOW,
      });

      expect(metrics.score).toBe(80);
      expect(metrics.dailySampleCount).toBe(3);
      expect(metrics.weeklySampleCount).toBe(0);
      expect(metrics.source).toBe('daily_checkin');
      expect(metrics.checkinDays).toBe(3);
      expect(metrics.expectedDays).toBe(7);
      expect(metrics.coverage).toBeCloseTo(3 / 7);
    });

    it('ignores check-ins outside the window', () => {
      const metrics = computeAdherenceMetrics({
        dailyCheckins: [daily('2026-10-01', 10), daily('2026-10-15', 90)],
        weeklyReviews: [],
        window: WINDOW,
      });

      expect(metrics.score).toBe(90);
      expect(metrics.sampleCount).toBe(1);
    });

    it('returns null score (not 0%) when there is no evidence at all', () => {
      const metrics = computeAdherenceMetrics({
        dailyCheckins: [],
        weeklyReviews: [],
        window: WINDOW,
      });

      expect(metrics.score).toBeNull();
      expect(metrics.source).toBe('none');
      expect(metrics.trend).toBe('insufficient_data');
      expect(metrics.coverage).toBe(0);
      expect(metrics.sampleCount).toBe(0);
    });

    it('treats null adherence values as missing, not as zero', () => {
      const metrics = computeAdherenceMetrics({
        dailyCheckins: [daily('2026-10-13', null), daily('2026-10-14', 70)],
        weeklyReviews: [],
        window: WINDOW,
      });

      expect(metrics.score).toBe(70);
      expect(metrics.sampleCount).toBe(1);
    });

    it('uses a weekly review only when that ISO week has no daily evidence', () => {
      // 2026-10-12 is a Monday; the week 2026-10-12..2026-10-18 is covered
      // by daily evidence, so its weekly review must be ignored.
      const metrics = computeAdherenceMetrics({
        dailyCheckins: [daily('2026-10-13', 80), daily('2026-10-14', 80)],
        weeklyReviews: [weekly('2026-10-12', 10)],
        window: WINDOW,
      });

      expect(metrics.score).toBe(80);
      expect(metrics.weeklySampleCount).toBe(0);
      expect(metrics.source).toBe('daily_checkin');
    });

    it('falls back to the weekly review for a week without daily check-ins', () => {
      const metrics = computeAdherenceMetrics({
        dailyCheckins: [daily('2026-10-19', 40)],
        weeklyReviews: [weekly('2026-10-12', 90)],
        window: WINDOW,
      });

      expect(metrics.score).toBe(65);
      expect(metrics.dailySampleCount).toBe(1);
      expect(metrics.weeklySampleCount).toBe(1);
      expect(metrics.source).toBe('mixed');
    });

    it('does not double-count a week that has daily evidence outside the window', () => {
      // Daily evidence on 2026-10-12 (before the window) still covers the
      // ISO week 2026-10-12, so the weekly review must not be used.
      const metrics = computeAdherenceMetrics({
        dailyCheckins: [daily('2026-10-12', 50)],
        weeklyReviews: [weekly('2026-10-12', 90)],
        window: WINDOW,
      });

      expect(metrics.weeklySampleCount).toBe(0);
      expect(metrics.score).toBeNull();
    });

    it('clamps out-of-range scores into 0-100', () => {
      const metrics = computeAdherenceMetrics({
        dailyCheckins: [daily('2026-10-13', 150), daily('2026-10-14', -20)],
        weeklyReviews: [],
        window: WINDOW,
      });

      expect(metrics.score).toBe(50);
      expect(metrics.samples.map((s) => s.score)).toEqual([100, 0]);
    });

    it('rounds the mean score', () => {
      const metrics = computeAdherenceMetrics({
        dailyCheckins: [
          daily('2026-10-13', 70),
          daily('2026-10-14', 71),
          daily('2026-10-15', 74),
        ],
        weeklyReviews: [],
        window: WINDOW,
      });

      expect(metrics.score).toBe(72);
    });

    it('exposes every selected sample sorted by date', () => {
      const metrics = computeAdherenceMetrics({
        dailyCheckins: [daily('2026-10-16', 60), daily('2026-10-13', 90)],
        weeklyReviews: [weekly('2026-10-19', 30)],
        window: WINDOW,
      });

      expect(metrics.samples.map((s) => s.date)).toEqual([
        '2026-10-13',
        '2026-10-16',
        '2026-10-19',
      ]);
    });
  });

  describe('computeAdherenceTrend', () => {
    const sample = (date: string, score: number): AdherenceSample => ({
      date,
      score,
      source: 'daily_checkin',
    });

    it('reports insufficient data below the minimum sample count', () => {
      const samples = Array.from({ length: TREND_MIN_SAMPLES - 1 }, (_, i) =>
        sample(`2026-10-1${i}`, 50),
      );
      expect(computeAdherenceTrend(samples)).toBe('insufficient_data');
    });

    it('reports improving when the second half beats the first half', () => {
      const samples = [
        sample('2026-10-13', 40),
        sample('2026-10-14', 40),
        sample('2026-10-15', 80),
        sample('2026-10-16', 80),
      ];
      expect(computeAdherenceTrend(samples)).toBe('improving');
    });

    it('reports declining when the second half lags the first half', () => {
      const samples = [
        sample('2026-10-13', 90),
        sample('2026-10-14', 90),
        sample('2026-10-15', 50),
        sample('2026-10-16', 50),
      ];
      expect(computeAdherenceTrend(samples)).toBe('declining');
    });

    it('reports stable when the halves are within the threshold', () => {
      const samples = [
        sample('2026-10-13', 70),
        sample('2026-10-14', 70),
        sample('2026-10-15', 72),
        sample('2026-10-16', 72),
      ];
      expect(computeAdherenceTrend(samples)).toBe('stable');
    });

    it('ignores input order', () => {
      const ascending = [
        sample('2026-10-13', 40),
        sample('2026-10-14', 40),
        sample('2026-10-15', 80),
        sample('2026-10-16', 80),
      ];
      const descending = [...ascending].reverse();
      expect(computeAdherenceTrend(descending)).toBe(
        computeAdherenceTrend(ascending),
      );
    });
  });

  describe('window helpers', () => {
    it('builds an inclusive window ending on the given date', () => {
      expect(adherenceWindowEndingOn('2026-10-19', 7)).toEqual({
        startDate: '2026-10-13',
        endDate: '2026-10-19',
      });
    });

    it('never builds an empty window', () => {
      expect(adherenceWindowEndingOn('2026-10-19', 0)).toEqual({
        startDate: '2026-10-19',
        endDate: '2026-10-19',
      });
    });

    it('counts inclusive days between two dates', () => {
      expect(daysBetween('2026-10-13', '2026-10-19')).toBe(7);
      expect(daysBetween('2026-10-13', '2026-10-13')).toBe(1);
    });

    it('resolves the ISO Monday of a week', () => {
      expect(isoWeekStartOf('2026-10-14')).toBe('2026-10-12');
      expect(isoWeekStartOf('2026-10-18')).toBe('2026-10-12');
      expect(isoWeekStartOf('2026-10-19')).toBe('2026-10-19');
    });

    it('detects weeks that overlap the window', () => {
      expect(weekIntersectsWindow('2026-10-12', WINDOW)).toBe(true);
      expect(weekIntersectsWindow('2026-10-19', WINDOW)).toBe(true);
      expect(weekIntersectsWindow('2026-10-05', WINDOW)).toBe(false);
    });
  });
});

