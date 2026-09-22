/**
 * Client Review state builder (Phase 13B)
 *
 * Turns persisted evidence + the active prescription into the Phase 13A
 * `ClientReview` together with the current prescription's canonical metrics.
 *
 * This module is READ-ONLY and performs NO new nutrition mathematics:
 *  - the adaptation decision comes from the existing adaptive layer
 *    (`resolveAdaptedTarget`), which already encapsulates the engine's gates,
 *    adherence classification, trend analysis and future-target computation;
 *  - the current prescription macros come from the existing canonical
 *    `reconstructMetricsFromPrescription` — never recomputed here;
 *  - the review itself is built by the Phase 13A `buildClientReview` mapping;
 *  - adherence is surfaced as a display-only mean of the SAME persisted
 *    evidence the engine already consumes (`collectAdherenceScores`). It feeds
 *    the UI's "What happened" panel only — the decision is never re-derived
 *    from it here.
 */

import type { ActiveNutritionPrescription } from '@/domain/nutrition/prescription';
import { reconstructMetricsFromPrescription } from '@/domain/nutrition/prescription';
import {
  collectAdherenceScores,
  weightObservationsFromDailyCheckins,
} from '@/domain/nutrition/adaptation';
import { buildClientReview, type ClientReview } from '@/domain/review/reviewModel';
import {
  resolveAdaptedTarget,
  type AdaptationEvidence,
} from '@/services/nutrition/adaptiveTargetService';
import type { Client, NutritionMetrics } from '@/types';

// ============================================================================
// TYPES
// ============================================================================

export interface ReviewBuildInput {
  readonly client: Client;
  /** The client's ACTIVE PRESCRIPTION, or null when none is persisted yet. */
  readonly activePrescription: ActiveNutritionPrescription | null;
  /** Real persisted check-in / weekly-review evidence for the client. */
  readonly evidence: AdaptationEvidence;
}

export interface ReviewBuildResult {
  /** The deterministic Phase 13A review of this client's situation. */
  readonly review: ClientReview;
  /**
   * Canonical metrics of the CURRENT prescription (target + macros). This is
   * what the "Current prescription" panel displays.
   */
  readonly currentMetrics: NutritionMetrics;
  /** Baseline prescription actually used (explicit or canonical initial). */
  readonly baseline: ActiveNutritionPrescription;
  /** Display-only mean adherence (0-100) from the same evidence the engine uses. */
  readonly adherenceScore: number | null;
  /** High-level counts of the evidence actually seen. */
  readonly evidence: ReviewEvidenceSummary;
}

/** Lightweight shape of the persisted evidence, for the review panels. */
export interface ReviewEvidenceSummary {
  readonly checkinCount: number;
  readonly weeklyReviewCount: number;
  readonly weightObservationCount: number;
  readonly latestCheckinDate: string | null;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Display-only mean adherence across the persisted evidence. Exactly mirrors
 * the engine's own summary metric; it never influences the (already computed)
 * adaptation decision.
 */
export function meanAdherenceScore(evidence: AdaptationEvidence): number | null {
  const scores = collectAdherenceScores(evidence.dailyCheckins, evidence.weeklyReviews);
  if (scores.length === 0) {
    return null;
  }
  const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  return Math.max(0, Math.min(100, Math.round(mean)));
}

/** Count/summarize the persisted evidence actually evaluated for the review. */
export function summarizeEvidence(evidence: AdaptationEvidence): ReviewEvidenceSummary {
  const weights = weightObservationsFromDailyCheckins(evidence.dailyCheckins);
  const dates = evidence.dailyCheckins
    .map((c) => c.checkin_date)
    .filter((d) => typeof d === 'string' && d.length > 0)
    .sort();
  const latest = dates.length > 0 ? dates[dates.length - 1] : null;

  return {
    checkinCount: evidence.dailyCheckins.length,
    weeklyReviewCount: evidence.weeklyReviews.length,
    weightObservationCount: weights.length,
    latestCheckinDate: latest,
  };
}

// ============================================================================
// BUILDER (pure — no React, no I/O, no persistence)
// ============================================================================

export function buildReviewState(input: ReviewBuildInput): ReviewBuildResult {
  const adapted = resolveAdaptedTarget(
    input.client,
    input.activePrescription,
    input.evidence,
  );

  const adherenceScore = meanAdherenceScore(input.evidence);

  const review = buildClientReview({
    clientId: input.client.id,
    currentTargetCalories: adapted.baseline.targetCalories,
    adaptationDecision: adapted.decision,
    adherenceScore,
  });

  const currentMetrics = reconstructMetricsFromPrescription(input.client, adapted.baseline);

  return {
    review,
    currentMetrics,
    baseline: adapted.baseline,
    adherenceScore,
    evidence: summarizeEvidence(input.evidence),
  };
}