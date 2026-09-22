/**
 * Coaching Decision domain model (Phase 13C)
 *
 * Records what a coach ACTUALLY decided after reviewing the Phase 13A/13B
 * system recommendation. It is a pure, framework-free model:
 *  - no React, no Supabase, no network I/O;
 *  - no nutrition mathematics: the only canonical validation it reuses is the
 *    engine's `reconcileTarget` feasibility mechanism (for a MODIFIED target);
 *  - it never mutates a prescription and never implies plan generation/locking;
 *  - the system recommendation is carried as a SNAPSHOT (observed/target rates,
 *    adherence, recommended adjustment/target) so a future reader can always
 *    distinguish "what the system recommended" from "what the coach decided".
 *
 * Invariants (unit-tested):
 *  - `accepted` / `modified` are only legal for an `adjustment_recommended`
 *    status, and both require a `finalTargetCalories`;
 *  - `maintained` / `deferred` never carry a final target;
 *  - a modified final target is validated through the canonical reconciliation
 *    (macro-floor feasibility), never through a second calorie-bound algorithm;
 *  - the decision never creates/generates/locks a nutrition plan.
 */

import type { ClientReviewStatus } from '@/domain/review/reviewModel';
import { reconcileTarget } from '@/domain/nutrition/engine';

// ============================================================================
// TYPES
// ============================================================================

/** The four supported coach actions (section 10 of the Phase 13C spec). */
export type CoachAction = 'accepted' | 'modified' | 'maintained' | 'deferred';

export const COACH_ACTIONS: readonly CoachAction[] = [
  'accepted',
  'modified',
  'maintained',
  'deferred',
];

/** Which coach actions are meaningful for each review status. */
export const ALLOWED_ACTIONS_BY_STATUS: Readonly<
  Record<ClientReviewStatus, readonly CoachAction[]>
> = {
  // The engine recommended an adjustment: the coach may accept it, modify the
  // proposed value, keep the current prescription, or defer.
  adjustment_recommended: ['accepted', 'modified', 'maintained', 'deferred'],
  // System says "maintain": the coach confirms keeping current, or defers.
  maintain: ['maintained', 'deferred'],
  // Needs coach judgment / insufficient evidence: the coach must NOT invent an
  // adjustment; recording a deferral is the legal outcome.
  review_required: ['deferred'],
  insufficient_data: ['deferred'],
};

const REVIEW_STATUSES: readonly ClientReviewStatus[] = [
  'maintain',
  'adjustment_recommended',
  'review_required',
  'insufficient_data',
];

/** Maximum coach-note length (plain text; no rich text / AI rewriting). */
export const COACH_NOTE_MAX_LENGTH = 2000;

/**
 * A validated decision payload — the complete, self-contained snapshot a coach
 * records. This is the exact shape handed to the persistence boundary.
 */
export interface CoachingDecisionInput {
  readonly clientId: string;
  readonly recommendationStatus: ClientReviewStatus;
  readonly coachAction: CoachAction;
  /** Provenance: the plan version the decision was based on (null when the
   *  baseline was the canonical initial profile). */
  readonly baselinePrescriptionVersionId: string | null;
  // ---- System recommendation SNAPSHOT (verbatim; never recomputed) ----
  readonly observedWeeklyRateKg: number | null;
  readonly targetWeeklyRateKg: number | null;
  readonly adherenceScore: number | null;
  readonly recommendedCalorieAdjustment: number | null;
  readonly recommendedTargetCalories: number | null;
  // ---- Coach decision (independent of the recommendation) ----
  /** Present only for `accepted` / `modified`. */
  readonly finalTargetCalories: number | null;
  readonly coachNote: string | null;
  /** Decision date, YYYY-MM-DD. */
  readonly decisionDate: string;
}

/** A persisted coaching decision (mirrors a `coaching_decisions` row). */
export interface CoachingDecision extends CoachingDecisionInput {
  readonly id: string;
  readonly coachId: string;
  readonly createdAt: string;
}

/** Extra data the validator needs (client body weight for feasibility). */
export interface ValidationContext {
  readonly weightKg: number;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

// ============================================================================
// VALIDATION
// ============================================================================

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isoDateValid(iso: string): boolean {
  if (!DATE_RE.test(iso)) return false;
  const t = Date.parse(iso);
  return !Number.isNaN(t);
}

/**
 * Domain-boundary validation. Rejects invalid actions, missing required
 * fields and impossible final targets WITHOUT performing any new nutrition
 * math. A `modified` final target is verified through the CANONICAL
 * `reconcileTarget` feasibility mechanism.
 */
export function validateCoachingDecisionInput(
  input: CoachingDecisionInput,
  context: ValidationContext,
): ValidationResult {
  const errors: string[] = [];

  if (!input.clientId || input.clientId.trim().length === 0) {
    errors.push('clientId is required');
  }

  if (!REVIEW_STATUSES.includes(input.recommendationStatus)) {
    errors.push(`unknown recommendation status: ${String(input.recommendationStatus)}`);
  }

  if (!COACH_ACTIONS.includes(input.coachAction)) {
    errors.push(`unknown coach action: ${String(input.coachAction)}`);
  } else if (
    REVIEW_STATUSES.includes(input.recommendationStatus) &&
    !ALLOWED_ACTIONS_BY_STATUS[input.recommendationStatus].includes(input.coachAction)
  ) {
    errors.push(
      `coach action '${input.coachAction}' is not valid for status ` +
        `'${input.recommendationStatus}'`,
    );
  }

  if (!isoDateValid(input.decisionDate)) {
    errors.push(`decisionDate must be a valid YYYY-MM-DD date (got ${String(input.decisionDate)})`);
  }

  const choosesTarget = input.coachAction === 'accepted' || input.coachAction === 'modified';

  if (choosesTarget) {
    if (!isFiniteNumber(input.finalTargetCalories)) {
      errors.push('finalTargetCalories is required for accepted/modified decisions');
    } else if (input.finalTargetCalories <= 0) {
      errors.push('finalTargetCalories must be positive');
    } else if (input.coachAction === 'modified') {
      // Reuse the canonical macro-floor feasibility check (single mechanism —
      // no second calorie-bound algorithm). The engine reconciles protein + the
      // fat floor against the target and flags a target that cannot cover them.
      const reconciled = reconcileTarget(
        input.finalTargetCalories,
        context.weightKg,
        'normal',
      );
      if (!reconciled.isFeasible) {
        errors.push(
          `modified final target ${input.finalTargetCalories} kcal is not feasible ` +
            `for this client (cannot cover the prescribed protein and fat floor)`,
        );
      }
    }
  } else if (input.finalTargetCalories !== null) {
    errors.push('finalTargetCalories must be null for maintained/deferred decisions');
  }

  if (
    input.coachNote !== null &&
    input.coachNote !== undefined &&
    input.coachNote.trim().length > COACH_NOTE_MAX_LENGTH
  ) {
    errors.push(`coachNote may not exceed ${COACH_NOTE_MAX_LENGTH} characters`);
  }

  return { valid: errors.length === 0, errors };
}