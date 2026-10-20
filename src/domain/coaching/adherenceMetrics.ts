/**
 * Adherence / compliance metrics (canonical computation)
 *
 * SINGLE SOURCE OF TRUTH for every adherence and compliance number shown in
 * the app (client check-in dashboard, client detail view, coach dashboard).
 *
 * Definitions (P0-2 — every displayed metric cites its source + formula):
 *
 *  - EVIDENCE DAILY  : `daily_checkins.meal_adherence` (0–100, one row per
 *                      client per calendar day).
 *  - EVIDENCE WEEKLY : `weekly_reviews.adherence_score` (0–100, one row per
 *                      client per ISO week) — a self-reported weekly score.
 *
 *  - PRECEDENCE      : daily evidence wins per ISO week. A weekly review is
 *                      only used for a week in which the client recorded NO
 *                      daily check-in. This prevents double-counting the same
 *                      days and keeps the daily signal authoritative.
 *
 *  - SCORE           : mean of all selected evidence scores in the window,
 *                      rounded and clamped to 0–100. `null` when the window
 *                      contains no evidence at all — a missing value is never
 *                      fabricated as 0%.
 *
 *  - COVERAGE        : distinct check-in days ÷ expected days in the window.
 *                      `null` when the window has no expected days.
 *
 *  - TREND           : daily check-in scores split in half by date order; the
 *                      second half must beat the first by more than
 *                      TREND_DELTA_THRESHOLD points to read as "improving"
 *                      (and vice-versa). Fewer than TREND_MIN_SAMPLES daily
 *                      points cannot establish a direction.
 *
 * This module is PURE: no I/O, no React, no persistence.
 */

import type { DailyCheckinLike, WeeklyReviewLike } from '@/domain/nutrition/adaptation';

export type AdherenceSource = 'daily_checkin' | 'weekly_review' | 'mixed' | 'none';

export type AdherenceTrendDirection =
  | 'improving'
  | 'stable'
  | 'declining'
  | 'insufficient_data';

export interface AdherenceSample {
  /** YYYY-MM-DD (daily check-in date, or the ISO Monday of a weekly review). */
  readonly date: string;
  /** 0–100. */
  readonly score: number;
  readonly source: 'daily_checkin' | 'weekly_review';
}

export interface AdherenceMetrics {
  /** Canonical 0–100 compliance score, or null when there is no evidence. */
  readonly score: number | null;
  /** Number of evidence scores that produced `score`. */
  readonly sampleCount: number;
  /** Number of daily check-in scores used. */
  readonly dailySampleCount: number;
  /** Number of weekly review scores used. */
  readonly weeklySampleCount: number;
  /** Distinct days with a daily check-in inside the window. */
  readonly checkinDays: number;
  /** Expected days in the window (window length). */
  readonly expectedDays: number;
  /** checkinDays ÷ expectedDays (0–1), or null when expectedDays <= 0. */
  readonly coverage: number | null;
  readonly trend: AdherenceTrendDirection;
  readonly source: AdherenceSource;
  /** Every selected evidence score, ascending by date. */
  readonly samples: readonly AdherenceSample[];
  /** Daily-only samples, ascending by date (the trend input). */
  readonly dailySamples: readonly AdherenceSample[];
}

/** Minimum daily points required to establish a trend direction. */
export const TREND_MIN_SAMPLES = 4;

/** Score points a half-window must gain/lose to read as improving/declining. */
export const TREND_DELTA_THRESHOLD = 5;

export interface AdherenceWindow {
  /** Inclusive YYYY-MM-DD. */
  readonly startDate: string;
  /** Inclusive YYYY-MM-DD. */
  readonly endDate: string;
}

export interface AdherenceMetricsInput {
  readonly dailyCheckins: ReadonlyArray<DailyCheckinLike>;
  readonly weeklyReviews: ReadonlyArray<WeeklyReviewLike>;
  readonly window: AdherenceWindow;
}

// ============================================================================
// HELPERS
// ============================================================================

const DAY_MS = 86_400_000;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isDateString(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** Milliseconds since epoch for a YYYY-MM-DD date (UTC). */
export function utcMsForDate(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, (m ?? 1) - 1, d ?? 1);
}

function toUtcMs(date: string): number {
  return utcMsForDate(date);
}

/** ISO Monday of the week containing `date` (YYYY-MM-DD). */
export function isoWeekStartOf(date: string): string {
  const ms = toUtcMs(date);
  const dow = new Date(ms).getUTCDay(); // 0 = Sunday
  const offset = dow === 0 ? -6 : 1 - dow;
  return new Date(ms + offset * DAY_MS).toISOString().slice(0, 10);
}

/**
 * True when the ISO week starting at `weekStartDate` overlaps the window.
 * A week that starts before the window but ends inside it still counts as
 * evidence for the overlapping days.
 */
export function weekIntersectsWindow(
  weekStartDate: string,
  window: AdherenceWindow,
): boolean {
  const weekEnd = new Date(toUtcMs(weekStartDate) + 6 * DAY_MS)
    .toISOString()
    .slice(0, 10);
  return weekStartDate <= window.endDate && weekEnd >= window.startDate;
}

/** Inclusive number of days between two YYYY-MM-DD dates. */
export function daysBetween(startDate: string, endDate: string): number {
  return Math.floor((toUtcMs(endDate) - toUtcMs(startDate)) / DAY_MS) + 1;
}

function inWindow(date: string, window: AdherenceWindow): boolean {
  return date >= window.startDate && date <= window.endDate;
}

// ============================================================================
// SELECTION (precedence: daily wins per ISO week)
// ============================================================================

function selectEvidence(input: AdherenceMetricsInput): {
  daily: AdherenceSample[];
  weekly: AdherenceSample[];
} {
  // All daily rows (any date) decide which ISO weeks are "covered" by daily
  // evidence — this prevents a weekly review from double-counting days that
  // were already reported day by day, even outside the window.
  const allDaily = input.dailyCheckins.filter(
    (c) => isDateString(c.checkin_date) && isFiniteNumber(c.meal_adherence),
  );
  const coveredWeeks = new Set(allDaily.map((c) => isoWeekStartOf(c.checkin_date)));

  const daily = allDaily
    .filter((c) => inWindow(c.checkin_date, input.window))
    .map<AdherenceSample>((c) => ({
      date: c.checkin_date,
      score: clampScore(c.meal_adherence as number),
      source: 'daily_checkin',
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const weekly = input.weeklyReviews
    .filter(
      (r) =>
        isDateString(r.week_start_date) &&
        isFiniteNumber(r.adherence_score) &&
        weekIntersectsWindow(r.week_start_date, input.window),
    )
    // A weekly review is only used when that ISO week has no daily evidence.
    .filter((r) => !coveredWeeks.has(isoWeekStartOf(r.week_start_date)))
    .map<AdherenceSample>((r) => ({
      date: r.week_start_date,
      score: clampScore(r.adherence_score as number),
      source: 'weekly_review',
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return { daily, weekly };
}

// ============================================================================
// TREND
// ============================================================================

/**
 * Direction of the daily check-in scores inside the window.
 * Requires at least `TREND_MIN_SAMPLES` daily points; otherwise
 * "insufficient_data".
 */
export function computeAdherenceTrend(
  dailySamples: ReadonlyArray<AdherenceSample>,
): AdherenceTrendDirection {
  if (dailySamples.length < TREND_MIN_SAMPLES) {
    return 'insufficient_data';
  }
  const sorted = [...dailySamples].sort((a, b) => a.date.localeCompare(b.date));
  const mid = Math.floor(sorted.length / 2);
  const firstHalf = sorted.slice(0, mid);
  const secondHalf = sorted.slice(mid);
  if (firstHalf.length === 0 || secondHalf.length === 0) {
    return 'insufficient_data';
  }
  const mean = (xs: ReadonlyArray<AdherenceSample>) =>
    xs.reduce((sum, x) => sum + x.score, 0) / xs.length;
  const first = mean(firstHalf);
  const second = mean(secondHalf);
  if (second - first > TREND_DELTA_THRESHOLD) return 'improving';
  if (first - second > TREND_DELTA_THRESHOLD) return 'declining';
  return 'stable';
}

// ============================================================================
// MAIN COMPUTATION
// ============================================================================

/**
 * Compute the canonical adherence metrics for a window.
 *
 * Missing data is NEVER fabricated: with no evidence the score is `null`,
 * the coverage is `null` and the trend is "insufficient_data".
 */
export function computeAdherenceMetrics(
  input: AdherenceMetricsInput,
): AdherenceMetrics {
  const { daily, weekly } = selectEvidence(input);
  const samples = [...daily, ...weekly].sort((a, b) => a.date.localeCompare(b.date));

  const score =
    samples.length > 0
      ? clampScore(samples.reduce((sum, s) => sum + s.score, 0) / samples.length)
      : null;

  const expectedDays = Math.max(
    0,
    daysBetween(input.window.startDate, input.window.endDate),
  );
  const checkinDays = new Set(daily.map((s) => s.date)).size;
  const coverage =
    expectedDays > 0 ? Math.max(0, Math.min(1, checkinDays / expectedDays)) : null;

  const source: AdherenceSource =
    daily.length > 0 && weekly.length > 0
      ? 'mixed'
      : daily.length > 0
        ? 'daily_checkin'
        : weekly.length > 0
          ? 'weekly_review'
          : 'none';

  return {
    score,
    sampleCount: samples.length,
    dailySampleCount: daily.length,
    weeklySampleCount: weekly.length,
    checkinDays,
    expectedDays,
    coverage,
    trend: computeAdherenceTrend(daily),
    source,
    samples,
    dailySamples: daily,
  };
}

/**
 * Build a window of the last `days` days ending on `endDate` (inclusive).
 */
export function adherenceWindowEndingOn(
  endDate: string,
  days: number,
): AdherenceWindow {
  const safeDays = Math.max(1, Math.floor(days));
  const end = toUtcMs(endDate);
  const start = new Date(end - (safeDays - 1) * DAY_MS).toISOString().slice(0, 10);
  return { startDate: start, endDate };
}

