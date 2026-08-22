/**
 * Adaptive Target Service (Phases 7-8)
 *
 * Production wiring between the application data flow and the domain layer.
 * This module contains NO nutrition mathematics:
 *  - the CURRENT target always comes from the canonical engine
 *    (`resolveNutritionDecision` / `calculateNutritionMetrics`)
 *  - the adaptation baseline is the client's ACTIVE PRESCRIPTION (Phase 8);
 *    when none exists yet, the canonical initial prescription is derived
 *    deterministically from the profile
 *  - the FUTURE adapted target is produced ONLY when the adaptation layer is
 *    eligible, and it is resolved by calling the canonical engine again with
 *    the adjusted weekly rate
 *  - evidence comes exclusively from real persisted check-in rows
 *    (`daily_checkins`, `weekly_reviews`) — nothing is fabricated
 *  - locked plans/snapshots are read-only; results only PROPOSE a future target
 */

import {
  calculateProfile,
  resolveNutritionDecision,
  buildNutritionProfileInput,
  type NutritionDecision,
  type NutritionProfileInput,
} from '@/domain/nutrition/engine';
import {
  collectAdherenceScores,
  decideAdaptation,
  weightObservationsFromDailyCheckins,
  type AdaptationDecision,
} from '@/domain/nutrition/adaptation';
import {
  deriveInitialPrescription,
  type ActiveNutritionPrescription,
} from '@/domain/nutrition/prescription';
import type { Client, NutritionMetrics } from '@/types';
import type { DailyCheckin, WeeklyReview } from '@/types/checkin';
import { getCheckinHistory } from '@/services/checkin/dailyCheckinService';
import { getReviewHistory } from '@/services/checkin/weeklyReviewService';

// Canonical input mapping lives in the engine; re-exported for callers.
export { buildNutritionProfileInput };

// ============================================================================
// TYPES
// ============================================================================

/** Real persisted evidence for one adaptation evaluation. */
export interface AdaptationEvidence {
  readonly dailyCheckins: ReadonlyArray<DailyCheckin>;
  readonly weeklyReviews: ReadonlyArray<WeeklyReview>;
}

export interface AdaptedTargetResult {
  /** Deterministic interpretation of the observed period (spec section M). */
  readonly decision: AdaptationDecision;
  /**
   * Canonical metrics for the NEXT planning period — non-null ONLY when the
   * decision outcome is 'adherent_unexpected' with a non-zero adjustment.
   * Resolved through `calculateProfile` (the canonical engine).
   */
  readonly futureMetrics: NutritionMetrics | null;
  /**
   * The ACTIVE PRESCRIPTION used as the baseline: the explicit prescription
   * when provided, otherwise the canonical initial prescription.
   */
  readonly baseline: ActiveNutritionPrescription;
  /** Canonical profile input used (echoed for traceability/tests). */
  readonly profileInput: NutritionProfileInput;
  /** The canonical current-profile decision (before any adaptation). */
  readonly currentDecision: NutritionDecision;
}

/** Injectable persistence access so the resolution stays deterministic in tests. */
export interface AdaptiveTargetFetchers {
  fetchCheckins: (
    clientId: string,
  ) => Promise<{ checkins: DailyCheckin[]; error: string | null }>;
  fetchReviews: (
    clientId: string,
  ) => Promise<{ reviews: WeeklyReview[]; error: string | null }>;
}

/** Real persisted data sources (existing services — no new schema). */
export const defaultAdaptiveFetchers: AdaptiveTargetFetchers = {
  fetchCheckins: (clientId) => getCheckinHistory(clientId, { days: 60, limit: 120 }),
  fetchReviews: (clientId) => getReviewHistory(clientId, { limit: 12 }),
};

// ============================================================================
// PURE RESOLUTION (no I/O — fully deterministic)
// ============================================================================

/**
 * Resolve the adapted FUTURE target from real evidence, using the client's
 * ACTIVE PRESCRIPTION as the baseline.
 *
 * Eligibility contract:
 *  - the baseline is the explicit active prescription when one exists;
 *    otherwise the canonical INITIAL prescription derived deterministically
 *    from the profile (lazy initialization — never invented history);
 *  - the adaptation layer itself requires >=7 weigh-ins over >=14 days and
 *    >=5 adherence samples, otherwise the outcome is 'insufficient_data';
 *  - only 'adherent_unexpected' may adjust; poor adherence never does.
 *
 * The future metrics are resolved by calling the CANONICAL engine with the
 * adjusted weekly rate, so every feasibility clamp applies identically.
 */
export function resolveAdaptedTarget(
  client: Client,
  activePrescription: ActiveNutritionPrescription | null | undefined,
  evidence: AdaptationEvidence,
): AdaptedTargetResult {
  const profileInput = buildNutritionProfileInput(client);

  // Canonical CURRENT profile decision for this client (single source of truth).
  const currentDecision = resolveNutritionDecision(profileInput);

  // Baseline = ACTIVE PRESCRIPTION (explicit) or canonical initial prescription.
  const baseline = activePrescription ?? deriveInitialPrescription(client);

  const decision = decideAdaptation({
    referenceWeightKg: client.weight,
    tdee: currentDecision.energy.tdee,
    primaryGoal: client.primaryGoal,
    activityLevel: client.activityLevel,
    prescribedWeeklyRateKg: baseline.weeklyRateKg,
    currentTargetCalories: baseline.targetCalories,
    observations: weightObservationsFromDailyCheckins(evidence.dailyCheckins),
    adherenceScores: collectAdherenceScores(evidence.dailyCheckins, evidence.weeklyReviews),
  });

  const eligible =
    decision.outcome === 'adherent_unexpected' && decision.calorieAdjustmentKcal !== 0;

  // FUTURE target: recomputed THROUGH THE CANONICAL ENGINE for the adjusted
  // weekly rate. Same pipeline as any initial plan.
  const futureMetrics = eligible
    ? calculateProfile({ ...profileInput, weeklyWeightChange: decision.futureWeeklyRateKg })
    : null;

  return { decision, futureMetrics, baseline, profileInput, currentDecision };
}

// ============================================================================
// PERSISTED-DATA LOADER (thin async wrapper)
// ============================================================================

/**
 * Load real persisted evidence for a client and resolve the adapted state
 * against the ACTIVE PRESCRIPTION. Fetch failures are PROPAGATED (never
 * swallowed into fake data), so callers can fall back to the canonical
 * profile target.
 */
export async function loadAdaptiveTargetState(
  client: Client,
  activePrescription: ActiveNutritionPrescription | null | undefined,
  fetchers: AdaptiveTargetFetchers = defaultAdaptiveFetchers,
): Promise<AdaptedTargetResult> {
  const [checkinResult, reviewResult] = await Promise.all([
    fetchers.fetchCheckins(client.id),
    fetchers.fetchReviews(client.id),
  ]);

  if (checkinResult.error) {
    throw new Error(`Failed to load check-in history: ${checkinResult.error}`);
  }
  if (reviewResult.error) {
    throw new Error(`Failed to load weekly reviews: ${reviewResult.error}`);
  }

  return resolveAdaptedTarget(client, activePrescription, {
    dailyCheckins: checkinResult.checkins,
    weeklyReviews: reviewResult.reviews,
  });
}

