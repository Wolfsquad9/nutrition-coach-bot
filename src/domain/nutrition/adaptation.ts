/**
 * Adaptive Nutrition Layer (Phase 6, sections K/L/M/N)
 *
 * SUBORDINATE to the canonical nutrition engine (`./engine.ts`). This module
 * NEVER re-implements BMR/TDEE/macro math: every future target is recomputed
 * by calling `calculateTargetCalories` from the canonical engine, so all
 * feasibility clamps apply identically.
 *
 * Purpose:
 *   prescribed target + observed body-weight trend + adherence evidence
 *     -> a FUTURE daily target for the next planning period.
 *
 * Hard rules:
 *  - Deterministic and explainable. No ML, no hidden correction factors,
 *    no Date.now()/Math.random() anywhere in the decision path.
 *  - Daily weight is noisy: decisions use a SMOOTHED rolling trend over a
 *    multi-week window, never a single weigh-in.
 *  - ADHERENCE GATE: poor adherence is never interpreted as metabolic
 *    adaptation. Only "successful adherence + unexpected trend" justifies an
 *    automatic calorie adjustment.
 *  - Adjustments are SMALL and clamped (see MAX_ADAPTATION_STEP_KCAL).
 *  - Locked plans are immutable: adaptation only ever PRODUCES a future
 *    target as data. It performs no persistence and mutates nothing.
 */

import {
  calculateTargetCalories,
  DAYS_PER_WEEK,
  effectiveWeeklyRateForTarget,
  KCAL_PER_KG_BODYWEIGHT,
  MAX_WEEKLY_CHANGE_KG,
  weeklyRateAsPercentBodyweight,
  roundKcal,
  type ActivityLevel,
  type PrimaryGoal,
} from './engine';

// ============================================================================
// TYPES
// ============================================================================

/** A single dated body-weight observation (maps from check-in data). */
export interface WeightObservation {
  /** ISO date or full ISO timestamp of the weigh-in. */
  readonly date: string;
  readonly weightKg: number;
}

/**
 * Everything the adaptive layer needs to interpret one planning period.
 * All fields come from data that already exists in the application:
 *  - observations: dated weigh-ins (e.g. DailyCheckin.current_weight_kg)
 *  - adherenceScores: 0-100 adherence values over the SAME period
 *    (e.g. DailyCheckin.meal_adherence / WeeklyReview.adherence_score)
 *  - prescribedWeeklyRateKg: the EFFECTIVE signed weekly rate behind the
 *    current prescription (NutritionDecision.rate.weeklyRateKg from the
 *    canonical engine), not the raw client wish.
 */
export interface AdaptiveTargetingInput {
  readonly referenceWeightKg: number;
  /** Canonical TDEE estimate for the client (from the engine). */
  readonly tdee: number;
  readonly primaryGoal: PrimaryGoal;
  readonly activityLevel: ActivityLevel;
  readonly prescribedWeeklyRateKg: number;
  /**
   * The currently prescribed daily intake. Read-only reference point:
   * locked plans are NEVER mutated — adaptation yields a FUTURE target only.
   */
  readonly currentTargetCalories: number;
  readonly observations: ReadonlyArray<WeightObservation>;
  readonly adherenceScores: ReadonlyArray<number>;
}

/**
 * Outcome classification (spec section M):
 *  - adherent_expected        (1) successful adherence + expected outcome
 *  - adherent_unexpected      (2) successful adherence + unexpected outcome
 *  - non_adherent_unexpected  (3) poor adherence + unexpected outcome
 *  - insufficient_data        (4) not enough evidence to classify
 * plus the benign mirror case non_adherent_expected (maintain, never adjust).
 */
export type AdaptationOutcome =
  | 'adherent_expected'
  | 'adherent_unexpected'
  | 'non_adherent_expected'
  | 'non_adherent_unexpected'
  | 'insufficient_data';

/** Deterministic, fully explainable adaptation decision. */
export interface AdaptationDecision {
  readonly outcome: AdaptationOutcome;
  /** True only when BOTH the weight trend AND adherence evidence suffice. */
  readonly sufficientData: boolean;
  /** null when adherence evidence is insufficient. */
  readonly adherent: boolean | null;
  readonly observedWeeklyRateKg: number | null;
  readonly observedWeeklyRatePercentBodyweight: number | null;
  readonly targetWeeklyRateKg: number;
  readonly targetWeeklyRatePercentBodyweight: number;
  /** Acceptance band around the target rate (kg/week). */
  readonly rateToleranceKgPerWeek: number;
  /** Signed small-step adjustment; always 0 unless outcome is adherent_unexpected. */
  readonly calorieAdjustmentKcal: number;
  /**
   * Requested next-cycle weekly rate (kg/week, signed): `prescribed + shift`
   * clamped to the canonical +/-MAX kg/week domain. Pre-clamp-view only.
   */
  readonly futureWeeklyRateKg: number;
  /**
   * The EFFECTIVE next-cycle weekly rate (kg/week, signed) actually implied by
   * `futureTargetCalories` after every canonical energy/feasibility clamp. The
   * active prescription must persist THIS value, never the raw pre-clamp
   * `futureWeeklyRateKg`.
   */
  readonly effectiveFutureWeeklyRateKg: number;
  /** Recomputed THROUGH THE CANONICAL ENGINE (same clamps as any plan). */
  readonly futureTargetCalories: number;
  /** Always true: adaptation proposes a future target and never rewrites the locked plan. */
  readonly lockedPlanUntouched: true;
  readonly rationale: readonly string[];
}

// ============================================================================
// POLICY CONSTANTS (deterministic thresholds — no hidden factors)
// ============================================================================

/** Rolling-mean smoothing window (in observations) used before trending. */
export const ADAPTATION_SMOOTHING_WINDOW = 7;
/** Minimum number of valid weigh-ins required before adapting. */
export const MIN_ADAPTATION_OBSERVATIONS = 7;
/** Minimum span (days) of the observation window required before adapting. */
export const MIN_ADAPTATION_WINDOW_DAYS = 14;
/** Minimum number of adherence entries required to judge adherence. */
export const MIN_ADHERENCE_SAMPLES = 5;
/** Mean adherence at or above this value counts as successful adherence. */
export const ADHERENT_THRESHOLD = 85;
/** Absolute "approximately as intended" band around the target rate. */
export const RATE_TOLERANCE_ABS_KG_PER_WEEK = 0.1;
/** Relative tolerance component (fraction of the requested rate magnitude). */
export const RATE_TOLERANCE_RELATIVE = 0.25;
/**
 * SMALL controlled adjustments only: the maximum absolute calorie change a
 * single adaptation cycle may prescribe. The system never makes large
 * automatic changes and never chases individual fluctuations.
 */
export const MAX_ADAPTATION_STEP_KCAL = 150;

const MS_PER_DAY = 86_400_000;

// ============================================================================
// TREND ANALYSIS (deterministic smoothing + slope)
// ============================================================================

function timestampOf(date: string): number {
  const parsed = Date.parse(date);
  return Number.isNaN(parsed) ? NaN : parsed;
}

/** Drop invalid entries and sort chronologically (stable, deterministic). */
function sanitizeObservations(
  observations: ReadonlyArray<WeightObservation>,
): WeightObservation[] {
  return observations
    .filter(
      (o) =>
        Number.isFinite(o.weightKg) && o.weightKg > 0 && !Number.isNaN(timestampOf(o.date)),
    )
    .map((o) => ({ date: o.date, weightKg: o.weightKg }))
    .sort((a, b) => timestampOf(a.date) - timestampOf(b.date));
}

/** Trailing rolling mean; partial windows at the start of the series. */
function rollingMean(values: number[], window: number): number[] {
  return values.map((_, i) => {
    const start = Math.max(0, i - window + 1);
    let sum = 0;
    for (let j = start; j <= i; j += 1) sum += values[j];
    return sum / (i - start + 1);
  });
}

/** Round to 6 decimals for stable, comparable outputs. */
function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

interface TrendAnalysis {
  rateKgPerWeek: number;
  sampleCount: number;
  spanDays: number;
}

/**
 * Smooth the observations and estimate the observed weekly weight trend via
 * ordinary least squares over the smoothed values. Returns null when there is
 * insufficient evidence (too few observations or too short a window) — daily
 * noise alone must never drive a calorie change.
 */
function analyzeTrend(observations: ReadonlyArray<WeightObservation>): TrendAnalysis | null {
  const sorted = sanitizeObservations(observations);
  const n = sorted.length;
  if (n < MIN_ADAPTATION_OBSERVATIONS) return null;

  const firstTs = timestampOf(sorted[0].date);
  const lastTs = timestampOf(sorted[n - 1].date);
  const spanDays = (lastTs - firstTs) / MS_PER_DAY;
  if (!(spanDays >= MIN_ADAPTATION_WINDOW_DAYS)) return null;

  const smoothed = rollingMean(
    sorted.map((o) => o.weightKg),
    ADAPTATION_SMOOTHING_WINDOW,
  );

  // Regress each rolling mean at the TIME-CENTROID of the observations that
  // formed it: the mean of a linear series across ARBITRARILY spaced x values
  // equals the line's value at the mean (centroid) of those x's, not at the
  // arithmetic midpoint (min+max)/2. Midpoint alignment is only exact for
  // evenly spaced weigh-ins; use the true centroid so irregular sampling,
  // missing days and duplicates keep the slope unbiased and deterministic.
  const xs = sorted.map((o) => (timestampOf(o.date) - firstTs) / MS_PER_DAY);
  const pairs: Array<{ x: number; y: number }> = sorted.map((_, i) => {
    const start = Math.max(0, i - ADAPTATION_SMOOTHING_WINDOW + 1);
    let xSum = 0;
    for (let j = start; j <= i; j += 1) xSum += xs[j];
    return { x: xSum / (i - start + 1), y: smoothed[i] };
  });

  // Ordinary least squares slope over (midpointOffset, smoothedWeight).
  const n2 = pairs.length;
  const meanX = pairs.reduce((s, p) => s + p.x, 0) / n2;
  const meanY = pairs.reduce((s, p) => s + p.y, 0) / n2;
  let cov = 0;
  let varX = 0;
  for (let i = 0; i < n2; i += 1) {
    cov += (pairs[i].x - meanX) * (pairs[i].y - meanY);
    varX += (pairs[i].x - meanX) ** 2;
  }
  if (varX === 0) return null;

  const slopeKgPerDay = cov / varX;
  return { rateKgPerWeek: slopeKgPerDay * DAYS_PER_WEEK, sampleCount: n, spanDays };
}

/**
 * Observed weekly weight trend (kg/week, signed) from smoothed weigh-ins.
 * Returns null when the evidence is insufficient for a decision.
 */
export function observedWeeklyRateKg(
  observations: ReadonlyArray<WeightObservation>,
): number | null {
  const trend = analyzeTrend(observations);
  return trend ? round6(trend.rateKgPerWeek) : null;
}

// ============================================================================
// ADHERENCE GATE (section M)
// ============================================================================

/** Clamp adherence entries into [0, 100], dropping non-finite values. */
function sanitizeScores(scores: ReadonlyArray<number>): number[] {
  return scores
    .filter((s) => Number.isFinite(s))
    .map((s) => Math.max(0, Math.min(100, s)));
}

function meanOf(values: ReadonlyArray<number>): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/**
 * Whether the recorded adherence demonstrates the prescribed intake was
 * actually followed. Requires enough samples; anything below the threshold
 * means the trend CANNOT be interpreted as metabolic adaptation.
 */
export function isAdherent(scores: ReadonlyArray<number>): boolean {
  const clean = sanitizeScores(scores);
  if (clean.length < MIN_ADHERENCE_SAMPLES) return false;
  return meanOf(clean) >= ADHERENT_THRESHOLD;
}

/** Acceptance band around the prescribed weekly rate (kg/week). */
export function weeklyRateToleranceKgPerWeek(prescribedWeeklyRateKg: number): number {
  return Math.max(
    RATE_TOLERANCE_ABS_KG_PER_WEEK,
    Math.abs(prescribedWeeklyRateKg) * RATE_TOLERANCE_RELATIVE,
  );
}

function clampWeeklyRate(rateKg: number): number {
  return Math.max(-MAX_WEEKLY_CHANGE_KG, Math.min(MAX_WEEKLY_CHANGE_KG, rateKg));
}

// ============================================================================
// DECISION (deterministic classification -> future target via canonical engine)
// ============================================================================

/**
 * Interpret one planning period and produce a FUTURE daily target.
 *
 * Flow: sanitize evidence -> gates (enough weights? enough adherence?) ->
 * classify outcome -> adjust ONLY for successful-adherence + unexpected-trend
 * -> recompute the future target through the canonical engine.
 *
 * Pure function: reads its input, writes nothing, persists nothing, and never
 * touches locked plans (the current prescription is referenced read-only).
 */
export function decideAdaptation(input: AdaptiveTargetingInput): AdaptationDecision {
  const prescribed = input.prescribedWeeklyRateKg;
  const tolerance = weeklyRateToleranceKgPerWeek(prescribed);
  const targetPct = weeklyRateAsPercentBodyweight(prescribed, input.referenceWeightKg);

  // Gate 1+2: sufficient weight evidence (count + window span).
  const trend = analyzeTrend(input.observations);
  if (!trend) {
    return {
      outcome: 'insufficient_data',
      sufficientData: false,
      adherent: null,
      observedWeeklyRateKg: null,
      observedWeeklyRatePercentBodyweight: null,
      targetWeeklyRateKg: prescribed,
      targetWeeklyRatePercentBodyweight: targetPct,
      rateToleranceKgPerWeek: tolerance,
      calorieAdjustmentKcal: 0,
      futureWeeklyRateKg: prescribed,
      effectiveFutureWeeklyRateKg: prescribed,
      futureTargetCalories: input.currentTargetCalories,
      lockedPlanUntouched: true,
      rationale: [
        `insufficient weight evidence: adaptation requires at least ` +
          `${MIN_ADAPTATION_OBSERVATIONS} valid weigh-ins spanning at least ` +
          `${MIN_ADAPTATION_WINDOW_DAYS} days`,
        'daily weight is noisy; no calorie adjustment is made without a smoothed trend',
        'the current prescription stands for the next planning period',
      ],
    };
  }

  const observed = round6(trend.rateKgPerWeek);
  const observedPct = weeklyRateAsPercentBodyweight(observed, input.referenceWeightKg);

  // Gate 3: adherence evidence (section M — never misread poor adherence).
  const scores = sanitizeScores(input.adherenceScores);
  if (scores.length < MIN_ADHERENCE_SAMPLES) {
    return {
      outcome: 'insufficient_data',
      sufficientData: false,
      adherent: null,
      observedWeeklyRateKg: observed,
      observedWeeklyRatePercentBodyweight: observedPct,
      targetWeeklyRateKg: prescribed,
      targetWeeklyRatePercentBodyweight: targetPct,
      rateToleranceKgPerWeek: tolerance,
      calorieAdjustmentKcal: 0,
      futureWeeklyRateKg: prescribed,
      effectiveFutureWeeklyRateKg: prescribed,
      futureTargetCalories: input.currentTargetCalories,
      lockedPlanUntouched: true,
      rationale: [
        `observed trend ${observed} kg/week over ${trend.sampleCount} weigh-ins ` +
          `(${Math.round(trend.spanDays)} days)`,
        `adherence evidence insufficient (${scores.length} of ` +
          `${MIN_ADHERENCE_SAMPLES} required entries)`,
        'without evidence the prescribed intake was followed, the trend cannot be ' +
          'interpreted as metabolic adaptation',
        'no calorie adjustment made; the current prescription stands',
      ],
    };
  }

  const meanScore = Math.round(meanOf(scores));
  const adherent = meanScore >= ADHERENT_THRESHOLD;
  const rateError = observed - prescribed;
  const onTrack = Math.abs(rateError) <= tolerance;

  const rationale: string[] = [
    `analyzed ${trend.sampleCount} weigh-ins spanning ${Math.round(trend.spanDays)} days ` +
      `(rolling ${ADAPTATION_SMOOTHING_WINDOW}-observation smoothing)`,
    `smoothed observed trend ${observed} kg/week vs prescribed ${prescribed} kg/week ` +
      `(tolerance +/-${tolerance} kg/week)`,
    `mean adherence ${meanScore}/100 across ${scores.length} entries ` +
      `(successful-adherence threshold ${ADHERENT_THRESHOLD})`,
  ];

  let outcome: AdaptationOutcome;
  let calorieAdjustmentKcal = 0;

  if (onTrack && adherent) {
    outcome = 'adherent_expected';
    rationale.push(
      'progressing approximately as intended with successful adherence -> maintain calories',
    );
  } else if (!onTrack && adherent) {
    outcome = 'adherent_unexpected';
    rationale.push(
      'unexpected trend WITH demonstrated adherence -> small controlled adjustment justified',
    );
    // Feedback correction: shift calories against the rate error, then clamp to
    // the small-step policy. Sign convention: losing slower than planned
    // (error > 0) => further deficit (negative shift), and vice versa.
    const desiredShiftKcal = (-rateError * KCAL_PER_KG_BODYWEIGHT) / DAYS_PER_WEEK;
    calorieAdjustmentKcal = Math.max(
      -MAX_ADAPTATION_STEP_KCAL,
      Math.min(MAX_ADAPTATION_STEP_KCAL, Math.round(desiredShiftKcal)),
    );
  } else if (onTrack && !adherent) {
    outcome = 'non_adherent_expected';
    rationale.push('trend matches the prescription despite poor adherence -> maintain calories');
  } else {
    outcome = 'non_adherent_unexpected';
    rationale.push(
      'unexpected trend but adherence was poor: this is NOT evidence of metabolic ' +
        'adaptation -> no automatic calorie adjustment',
    );
  }

  // Convert the (possibly zero) adjustment back into a weekly-rate correction
  // and recompute the FUTURE target through the canonical engine so every
  // feasibility clamp applies identically to initial and adapted targets.
  // `futureWeeklyRateKg` is the REQUESTED next-cycle rate; the effective rate
  // actually delivered by `futureTargetCalories` is what a prescription stores.
  const shiftKg = (calorieAdjustmentKcal * DAYS_PER_WEEK) / KCAL_PER_KG_BODYWEIGHT;
  const futureWeeklyRateKg = clampWeeklyRate(prescribed + shiftKg);
  // F-03: on maintain outcomes (no adjustment) echo the standing prescription's
  // rate+target verbatim. Recomputing them through the engine against the
  // *current* TDEE would diverge from the prescription that actually stands once
  // the client's bodyweight has drifted since lock, making the reported future
  // target/rate disagree with the "current prescription remains immutable"
  // rationale — and with each other. Only an adjusted outcome recomputes a NEW
  // future target through the canonical engine (same pattern as the
  // insufficient-evidence paths, which also echo the standing basis).
  const adjusting = calorieAdjustmentKcal !== 0;
  const futureTargetCalories = adjusting
    ? roundKcal(
        calculateTargetCalories(input.tdee, input.primaryGoal, futureWeeklyRateKg),
      )
    : input.currentTargetCalories;
  const effectiveFutureWeeklyRateKg = adjusting
    ? effectiveWeeklyRateForTarget(input.tdee, futureTargetCalories)
    : prescribed;

  if (calorieAdjustmentKcal !== 0) {
    rationale.push(
      `small adjustment of ${calorieAdjustmentKcal} kcal/day applied ` +
        `(maximum step +/-${MAX_ADAPTATION_STEP_KCAL} kcal)`,
    );
  }
  const futureBasisLine = adjusting
    ? `-> future target ${futureTargetCalories} kcal recomputed by the canonical engine`
    : `-> future target ${futureTargetCalories} kcal carried forward from the standing prescription`;
  rationale.push(
    `future weekly rate ${effectiveFutureWeeklyRateKg} kg/week (effective, ` +
      `requested ${futureWeeklyRateKg} kg/week before energy clamps) ` +
      `(${weeklyRateAsPercentBodyweight(futureWeeklyRateKg, input.referenceWeightKg)}% of bodyweight) ` +
      futureBasisLine,
  );
  rationale.push(
    `locked/current prescription of ${input.currentTargetCalories} kcal remains immutable; ` +
      `this decision only proposes the next planning period's target`,
  );

  return {
    outcome,
    sufficientData: true,
    adherent,
    observedWeeklyRateKg: observed,
    observedWeeklyRatePercentBodyweight: observedPct,
    targetWeeklyRateKg: prescribed,
    targetWeeklyRatePercentBodyweight: targetPct,
    rateToleranceKgPerWeek: tolerance,
    calorieAdjustmentKcal,
    futureWeeklyRateKg,
    effectiveFutureWeeklyRateKg,
    futureTargetCalories,
    lockedPlanUntouched: true,
    rationale,
  };
}

// ============================================================================
// PERSISTED-EVIDENCE MAPPERS (Phase 7 integration plumbing)
// ============================================================================
// Pure data-shape adapters from the application's existing check-in rows to
// the adaptive input. They contain NO nutrition mathematics — every value is
// forwarded verbatim (or dropped when null/non-finite) and all interpretation
// happens inside decideAdaptation.

/** Minimal structural shape of a persisted daily check-in row. */
export interface DailyCheckinLike {
  readonly checkin_date: string;
  readonly current_weight_kg: number | null;
  readonly meal_adherence?: number | null;
}

/** Minimal structural shape of a persisted weekly review row. */
export interface WeeklyReviewLike {
  readonly week_start_date: string;
  readonly bodyweight_kg: number | null;
  readonly adherence_score?: number | null;
}

/**
 * Map persisted daily check-ins to dated weight observations.
 * Rows without a usable weight are skipped (never fabricated).
 */
export function weightObservationsFromDailyCheckins(
  checkins: ReadonlyArray<DailyCheckinLike>,
): WeightObservation[] {
  return checkins
    .filter(
      (c) =>
        typeof c.checkin_date === 'string' &&
        c.checkin_date.length > 0 &&
        c.current_weight_kg !== null &&
        Number.isFinite(c.current_weight_kg),
    )
    .map((c) => ({ date: c.checkin_date, weightKg: c.current_weight_kg as number }));
}

/**
 * Collect the adherence evidence (0-100 values) recorded over the period,
 * from daily check-ins and weekly reviews. Null/non-finite entries are
 * skipped; values are forwarded verbatim (decideAdaptation clamps).
 */
export function collectAdherenceScores(
  dailyCheckins: ReadonlyArray<DailyCheckinLike>,
  weeklyReviews: ReadonlyArray<WeeklyReviewLike>,
): number[] {
  const isScore = (v: unknown): v is number =>
    typeof v === 'number' && Number.isFinite(v);
  return [
    ...dailyCheckins.map((c) => c.meal_adherence).filter(isScore),
    ...weeklyReviews.map((r) => r.adherence_score).filter(isScore),
  ];
}




