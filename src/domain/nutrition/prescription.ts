/**
 * Active Nutrition Prescription (Phase 8)
 *
 * Domain model for the client's CURRENT authoritative nutrition prescription.
 *
 * Three distinct concepts — never blurred:
 *   1. HISTORICAL PLAN SNAPSHOT  immutable; exactly what was locked; never rewritten
 *   2. ACTIVE PRESCRIPTION       the current target baseline used for future
 *                                adaptation/generation; replaced ONLY when a new
 *                                plan version is explicitly locked
 *   3. DRAFT PLAN                temporary; never authoritative on its own
 *
 * The prescription stores exactly what cannot be deterministically derived from
 * canonical inputs: the EFFECTIVE weekly rate currently being prescribed (which
 * diverges from the client's static profile request after an adaptation cycle),
 * plus provenance. Every nutrition VALUE is always recomputed by the canonical
 * engine (`resolveNutritionDecision` / `calculateProfile`) — this module
 * performs no nutrition mathematics itself.
 */

import {
  resolveNutritionDecision,
  buildNutritionProfileInput,
  calculateProfile,
  MAX_WEEKLY_CHANGE_KG,
} from './engine';
import type { Client, NutritionMetrics } from '@/types';

// ============================================================================
// ERRORS
// ============================================================================

/**
 * Raised when an active prescription cannot deterministically produce canonical
 * metrics. Never silently mix values from the prescription with values from
 * another basis.
 */
export class PrescriptionIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PrescriptionIntegrityError';
  }
}

// ============================================================================
// TYPES
// ============================================================================

/**
 * The prescription record persisted inside a locked plan version's JSONB
 * payload (`plan_versions.plan_payload.nutritionPrescription`). Written only
 * by the existing atomic lock RPC path; historical payloads simply lack the
 * field (optional) and are never rewritten.
 */
export interface NutritionPrescriptionRecord {
  /** Effective signed weekly weight-change rate (kg/week) of this prescription. */
  weeklyRateKg: number;
  /** ISO timestamp of the lock that established this prescription. */
  establishedAt: string;
  /** Plan version that established this prescription (provenance). */
  sourceVersionId: string;
}

/** Where the currently active prescription came from. */
export type PrescriptionSource =
  | 'locked_plan' // established by an explicit plan lock
  | 'initial_profile'; // deterministic lazy initialization from the profile

/**
 * The client's ACTIVE PRESCRIPTION: the baseline adaptation compares observed
 * behavior against, and the starting point for future plan generation.
 */
export interface ActiveNutritionPrescription {
  /** Daily calorie target of the current prescription (kcal). */
  readonly targetCalories: number;
  /** Effective signed weekly rate (kg/week) of the current prescription. */
  readonly weeklyRateKg: number;
  readonly source: PrescriptionSource;
  /** Provenance — null for the initial profile-derived prescription. */
  readonly versionId: string | null;
  readonly versionNumber: number | null;
  readonly establishedAt: string | null;
}

// ============================================================================
// CONSTRUCTORS
// ============================================================================

/** Build an ActiveNutritionPrescription from an explicitly locked plan. */
export function prescriptionFromLockedPlan(args: {
  weeklyRateKg: number;
  targetCalories: number;
  versionId: string;
  versionNumber: number | null;
  establishedAt: string;
}): ActiveNutritionPrescription {
  return {
    targetCalories: args.targetCalories,
    weeklyRateKg: args.weeklyRateKg,
    source: 'locked_plan',
    versionId: args.versionId,
    versionNumber: args.versionNumber,
    establishedAt: args.establishedAt,
  };
}

/**
 * Deterministic lazy initialization for clients with no persisted
 * prescription (legacy plans / first-ever plan): derive it from the canonical
 * engine using the existing profile data. No special fallback formula, no
 * invented history.
 */
export function deriveInitialPrescription(client: Client): ActiveNutritionPrescription {
  const decision = resolveNutritionDecision(buildNutritionProfileInput(client));
  return {
    targetCalories: decision.energy.targetCalories,
    weeklyRateKg: decision.rate.weeklyRateKg,
    source: 'initial_profile',
    versionId: null,
    versionNumber: null,
    establishedAt: null,
  };
}

/**
 * Build the persisted payload record at lock time. Validates the rate so no
 * garbage ever enters the payload: it must be a finite number within the
 * canonical permitted weekly-change domain (+/-MAX_WEEKLY_CHANGE_KG).
 */
export function buildPrescriptionRecord(args: {
  weeklyRateKg: number;
  lockedAt: Date;
  versionId: string;
}): NutritionPrescriptionRecord {
  const { weeklyRateKg } = args;
  if (!Number.isFinite(weeklyRateKg)) {
    throw new Error(
      `Invalid nutrition prescription: weeklyRateKg must be a finite number (got ${weeklyRateKg})`,
    );
  }
  if (Math.abs(weeklyRateKg) > MAX_WEEKLY_CHANGE_KG) {
    throw new Error(
      `Invalid nutrition prescription: |weeklyRateKg| may not exceed ` +
        `${MAX_WEEKLY_CHANGE_KG} kg/week (got ${weeklyRateKg})`,
    );
  }
  return {
    weeklyRateKg,
    establishedAt: args.lockedAt.toISOString(),
    sourceVersionId: args.versionId,
  };
}

/** Parseable ISO timestamp (structure check only — never a domain choice). */
const isIsoTimestampLike = (value: string): boolean => !Number.isNaN(Date.parse(value));

/** Loose provenance shape check: non-empty alphanumeric/hyphen identifier. */
const isVersionIdLike = (value: string): boolean => {
  if (typeof value !== 'string') return false;
  if (value.trim().length === 0) return false;
  if (value.length > 64) return false;
  // Reject control characters / leading+trailing whitespace normalization.
  return /^[\x21-\x7E]+$/.test(value);
};

/**
 * Rehydrate + SEMANTICALLY VALIDATE a fetched plan payload's prescription
 * record. Returns null when absent/malformed (legacy plans) so callers can fall
 * back to `deriveInitialPrescription`. Validation is structural AND semantic:
 * - weeklyRateKg must be finite AND within the canonical permitted range
 * - establishedAt must parse as a timestamp
 * - sourceVersionId must have a valid identifier shape
 * Malformed records never become authoritative.
 */
export function readPrescriptionRecord(
  payload: unknown,
): NutritionPrescriptionRecord | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = (payload as { nutritionPrescription?: unknown }).nutritionPrescription;
  if (!record || typeof record !== 'object') return null;
  const r = record as Partial<NutritionPrescriptionRecord>;
  if (
    typeof r.weeklyRateKg !== 'number' ||
    !Number.isFinite(r.weeklyRateKg) ||
    Math.abs(r.weeklyRateKg) > MAX_WEEKLY_CHANGE_KG ||
    typeof r.establishedAt !== 'string' ||
    !isIsoTimestampLike(r.establishedAt) ||
    typeof r.sourceVersionId !== 'string' ||
    !isVersionIdLike(r.sourceVersionId)
  ) {
    return null;
  }
  return { weeklyRateKg: r.weeklyRateKg, establishedAt: r.establishedAt, sourceVersionId: r.sourceVersionId };
}

/**
 * Deterministic canonical reconstruction of the active prescription's metrics.
 *
 * An active prescription is ALWAYS the effective weekly rate + provenance;
 * every nutrition value is recomputed by the canonical engine at that rate.
 * This is the ONLY allowed source of `effectiveMetrics` when an active
 * prescription exists — never `calculateNutritionMetrics(client)` (which would
 * describe the raw profile request instead of the prescription).
 *
 * Fails deterministically (PrescriptionIntegrityError) when the record cannot
 * be reconstructed safely rather than silently returning mixed values.
 */
export function reconstructMetricsFromPrescription(
  client: Client,
  rx: ActiveNutritionPrescription,
): NutritionMetrics {
  if (!Number.isFinite(rx.weeklyRateKg) || Math.abs(rx.weeklyRateKg) > MAX_WEEKLY_CHANGE_KG) {
    throw new PrescriptionIntegrityError(
      `Cannot reconstruct active prescription: weeklyRateKg ${rx.weeklyRateKg} ` +
        `is outside the canonical permitted range +/-${MAX_WEEKLY_CHANGE_KG} kg/week`,
    );
  }
  // Single canonical path: prescription rate -> profile input -> engine.
  const input = buildNutritionProfileInput(client);
  return calculateProfile({ ...input, weeklyWeightChange: rx.weeklyRateKg });
}
