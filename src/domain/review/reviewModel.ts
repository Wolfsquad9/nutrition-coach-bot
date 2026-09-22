/**
 * Client Review Model (Phase 13A)
 *
 * A DETERMINISTIC, product-level coaching review state built from the existing
 * nutrition adaptation layer's output.
 *
 * This module is an orchestration / classification layer ONLY. It performs no
 * nutrition mathematics and never invents a calorie recommendation. Every
 * recommendation it exposes is forwarded verbatim from the canonical
 * `AdaptationDecision` produced by `../nutrition/adaptation`. It is an exact
 * translation of an existing engine decision into a coach-facing state.
 *
 * Hard rules:
 *  - Deterministic: identical input always yields identical output.
 *  - Immutable: never mutates the adaptation decision or any caller input.
 *  - Framework-independent: no React, no Supabase, no LLM, no network I/O.
 *  - No hidden nutrition logic: not a single BMR/TDEE/adjustment formula here.
 *
 * The mapping:
 *   AdaptationDecision.outcome / sufficientData
 *                     |
 *                     v
 *             ClientReviewStatus
 */

import type { AdaptationDecision } from '@/domain/nutrition/adaptation';

// ============================================================================
// TYPES
// ============================================================================

/**
 * The product-level coaching state for a client, derived from one adaptation
 * decision:
 *  - `maintain`                enough evidence; no adjustment required.
 *  - `adjustment_recommended`  enough evidence + sufficient adherence and the
 *                              engine produced an actionable adjustment.
 *  - `review_required`         coach attention needed; do NOT auto-interpret as
 *                              a prescription change (e.g. poor adherence,
 *                              patterns that need coach judgment).
 *  - `insufficient_data`       not enough valid evidence to evaluate.
 */
export type ClientReviewStatus =
  | 'maintain'
  | 'adjustment_recommended'
  | 'review_required'
  | 'insufficient_data';

/**
 * The deterministic review contract consumed by the future Coach Cockpit /
 * Client Review UI. Answers "what is the current coaching state for this
 * client?" without re-running any nutrition calculation.
 */
export interface ClientReview {
  readonly clientId: string;

  readonly status: ClientReviewStatus;

  /** The untouched engine decision this review interprets. */
  readonly adaptationDecision: AdaptationDecision;

  /** Current daily target of the active prescription (caller-provided). */
  readonly currentTargetCalories: number;

  /**
   * Future daily target ONLY when the engine produced an actionable adjustment
   * (`adjustment_recommended`). null otherwise — never invented here.
   */
  readonly proposedTargetCalories: number | null;

  readonly observedWeeklyRateKg: number | null;

  readonly targetWeeklyRateKg: number | null;

  /** Adherence evidence (0-100) forwarded verbatim; null when unavailable. */
  readonly adherenceScore: number | null;

  /** Concise, deterministic, UI-safe coaching guidance. */
  readonly summary: string;
}

/** Minimal, explicit typed input — never full React / Supabase objects. */
export interface ReviewModelInput {
  readonly clientId: string;
  readonly currentTargetCalories: number;
  readonly adaptationDecision: AdaptationDecision;
  readonly adherenceScore: number | null;
}

// ============================================================================
// MAPPING
// ============================================================================

/**
 * Translate an adaptation decision into a product-level coaching status.
 *
 * The classification is driven by the engine's OWN outcome label (which already
 * encodes the adherence gate, the evidence gates and the unexpected-trend
 * cases). Rule priority:
 *   1. insufficient data  -> 'insufficient_data'
 *   2. actionable adjustment -> 'adjustment_recommended'
 *   3. insufficient adherence -> 'review_required'
 *   4. no adjustment      -> 'maintain'
 */
export function clientReviewStatus(
  decision: AdaptationDecision,
): ClientReviewStatus {
  // Rule A: insufficient evidence dominates — never infer an adjustment.
  if (decision.outcome === 'insufficient_data' || !decision.sufficientData) {
    return 'insufficient_data';
  }

  switch (decision.outcome) {
    // Rule B: successful adherence + unexpected trend is the engine's ONLY
    // actionable-adjustment case.
    case 'adherent_unexpected':
      return 'adjustment_recommended';
    // Rule C: poor adherence is never read as metabolic failure — the coach
    // must review adherence/context first. This holds whether or not the
    // trend happened to fall in line with the prescription.
    case 'non_adherent_expected':
    case 'non_adherent_unexpected':
      return 'review_required';
    // Rule D: everything else with sufficient evidence is a maintain.
    case 'adherent_expected':
    default:
      return 'maintain';
  }
}

/** Deterministic UI-safe summaries, one per status (generated from state). */
const SUMMARY_BY_STATUS: Readonly<Record<ClientReviewStatus, string>> = {
  maintain: 'Maintain current prescription.',
  adjustment_recommended:
    'Adjustment recommended based on sufficient adherence and observed trend.',
  review_required:
    'Review adherence and client context before changing the prescription.',
  insufficient_data: 'More data is required before making an adaptation decision.',
};

/**
 * Build the deterministic client review from an adaptation decision.
 * Pure: reads its input, mutates nothing.
 */
export function buildClientReview(input: ReviewModelInput): ClientReview {
  const decision = input.adaptationDecision;
  const status = clientReviewStatus(decision);

  // A proposed future target exists ONLY when the engine explicitly issued an
  // actionable adjustment. Every other state exposes null — we never invent or
  // independently calculate a calorie recommendation.
  const proposedTargetCalories =
    status === 'adjustment_recommended' ? decision.futureTargetCalories : null;

  return {
    clientId: input.clientId,
    status,
    adaptationDecision: decision,
    currentTargetCalories: input.currentTargetCalories,
    proposedTargetCalories,
    observedWeeklyRateKg: decision.observedWeeklyRateKg,
    targetWeeklyRateKg: decision.targetWeeklyRateKg,
    adherenceScore: input.adherenceScore,
    summary: SUMMARY_BY_STATUS[status],
  };
}