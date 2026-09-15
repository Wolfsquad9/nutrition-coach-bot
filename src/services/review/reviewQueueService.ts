/**
 * Review Queue service (Phase 13E)
 *
 * Coach-level, READ-ONLY projection of the existing per-client Review model:
 *
 *   accessible clients (existing useSupabaseClients / AppLayout context)
 *        +
 *   existing review model (buildReviewState — the SAME deterministic pipeline
 *   the Client Review page uses, delegated per client)
 *        +
 *   current decision state (persisted coaching_decisions for TODAY, per the
 *   Phase 13C one-decision-per-client-per-day semantics)
 *        ↓
 *   typed, deterministically ordered Review Queue projection
 *
 * Hard rules:
 *  - Strictly read-only: no insert/update/delete/upsert, no RPC invocation,
 *    no prescription mutation, no plan generation/activation/locking.
 *  - The queue reuses the existing review status vocabulary verbatim; it never
 *    invents a parallel status enum or reinterprets the review model.
 *  - Decision completeness comes ONLY from a persisted coaching_decisions row
 *    whose decision_date equals the CURRENT decision date (the same semantics
 *    the Phase 13C recording workflow enforces). Arbitrary historical
 *    decisions NEVER mark a review as resolved.
 *  - The projection carries no nutrition values: no targets, no adjustments,
 *    no adherence scores — just status/date/identity, so the queue can never
 *    become a second coaching engine.
 */

import { supabase } from '@/integrations/supabase/client';
import {
  defaultAdaptiveFetchers,
  type AdaptiveTargetFetchers,
} from '@/services/nutrition/adaptiveTargetService';
import { buildReviewState } from '@/services/review/buildReviewState';
import { fetchCurrentPlan } from '@/services/supabasePlanService';
import { fetchPersistedSnapshot } from '@/services/snapshotPersistence';
import {
  prescriptionFromLockedPlan,
  readPrescriptionRecord,
  type ActiveNutritionPrescription,
} from '@/domain/nutrition/prescription';
import { todayIso } from '@/hooks/useCoachingDecision';
import { getClientLabel } from '@/utils/clientHelpers';
import type { ClientReviewStatus } from '@/domain/review/reviewModel';
import type { CoachAction } from '@/domain/coaching/coachingDecision';
import type { Client } from '@/types';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Whether the coach has already recorded a decision for this client's CURRENT
 * review date (`recorded`) or not (`needed`). Derived exclusively from the
 * persisted Phase 13C decision rows — never from arbitrary history.
 */
export type QueueDecisionStatus = 'needed' | 'recorded';

/** The minimal queue projection for one client (a view, not a source of truth). */
export interface ReviewQueueItem {
  readonly clientId: string;
  /** Existing client display convention (`getClientLabel`). */
  readonly clientName: string;
  /** The client's current Phase 13A review status, verbatim. */
  readonly reviewStatus: ClientReviewStatus;
  readonly decisionStatus: QueueDecisionStatus;
  /** The coach action recorded for the current date, when one exists. */
  readonly decisionAction: CoachAction | null;
  /**
   * The most relevant existing review date: the recorded decision's date when
   * one exists, otherwise the latest persisted evidence date. Always a
   * persisted date — never derived from created_at or the clock.
   */
  readonly reviewDate: string | null;
}

export interface ReviewQueue {
  /** Clients with an outstanding decision for the current review date. */
  readonly needsDecision: ReviewQueueItem[];
  /** Clients already reviewed (a decision exists for the current date). */
  readonly resolved: ReviewQueueItem[];
}

export interface ReviewQueueResult {
  readonly data: ReviewQueue | null;
  readonly error: string | null;
}

// ============================================================================
// PROJECTION (pure — no React, no I/O)
// ============================================================================

/** Within the needs-decision group: the review model's own status priority. */
const REVIEW_STATUS_PRIORITY: Readonly<Record<ClientReviewStatus, number>> = {
  adjustment_recommended: 0,
  review_required: 1,
  insufficient_data: 2,
  maintain: 3,
};

/** Input the projection needs per client (all values already determined). */
export interface ReviewQueueProjectionInput {
  readonly clientId: string;
  readonly clientName: string;
  readonly reviewStatus: ClientReviewStatus;
  readonly reviewDate: string | null;
  /** The decision recorded for the current date, if any (Phase 13C semantics). */
  readonly decisionToday: { readonly coachAction: CoachAction; readonly decisionDate: string } | null;
}

/** Project one client into a queue item. Pure translation — no reinterpretation. */
export function projectReviewQueueItem(input: ReviewQueueProjectionInput): ReviewQueueItem {
  const decisionToday = input.decisionToday;
  return {
    clientId: input.clientId,
    clientName: input.clientName,
    reviewStatus: input.reviewStatus,
    decisionStatus: decisionToday ? 'recorded' : 'needed',
    decisionAction: decisionToday?.coachAction ?? null,
    // A recorded decision dates the entry by ITS persisted date; an outstanding
    // one by the latest persisted evidence date. Never the wall clock alone.
    reviewDate: decisionToday ? decisionToday.decisionDate : input.reviewDate,
  };
}

/** Stable, explainable ordering: date desc, then client name, then client id. */
function compareByDateThenIdentity(a: ReviewQueueItem, b: ReviewQueueItem): number {
  const dateDiff = (b.reviewDate ?? '').localeCompare(a.reviewDate ?? '');
  if (dateDiff !== 0) return dateDiff;
  if (a.clientName !== b.clientName) return a.clientName.localeCompare(b.clientName);
  return a.clientId.localeCompare(b.clientId);
}

/**
 * Deterministically order the queue:
 *  1. outstanding decisions first (needsDecision group);
 *  2. within that group, the review model's own status priority
 *     (adjustment_recommended -> review_required -> insufficient_data ->
 *     maintain);
 *  3. within the same status, the most relevant review date descending;
 *  4. a stable client-identity tiebreak (no scoring of any kind).
 * Resolved reviews (decision recorded for the current date) follow in their
 * own group, newest first.
 */
export function orderReviewQueue(items: readonly ReviewQueueItem[]): ReviewQueue {
  const byPriority = (a: ReviewQueueItem, b: ReviewQueueItem): number => {
    const statusDiff =
      REVIEW_STATUS_PRIORITY[a.reviewStatus] - REVIEW_STATUS_PRIORITY[b.reviewStatus];
    if (statusDiff !== 0) return statusDiff;
    return compareByDateThenIdentity(a, b);
  };

  return {
    needsDecision: items.filter((item) => item.decisionStatus === 'needed').sort(byPriority),
    resolved: items
      .filter((item) => item.decisionStatus === 'recorded')
      .sort(compareByDateThenIdentity),
  };
}

// ============================================================================
// READ PATHS (all read-only, existing RLS-scoped services)
// ============================================================================

interface CurrentDecisionRow {
  client_id: string;
  coach_action: CoachAction;
}

/**
 * The persisted decisions for the CURRENT decision date, in ONE RLS-scoped
 * query. Because Phase 13C enforces one decision per client per day, this is
 * exactly the current decision state for every accessible client — no client's
 * decision history is loaded.
 */
export async function fetchCurrentDayDecisions(
  decisionDate: string,
): Promise<{ data: Map<string, CoachAction> | null; error: string | null }> {
  try {
    if (!decisionDate) {
      return { data: null, error: 'decisionDate is required' };
    }
    const { data, error } = await supabase
      .from('coaching_decisions' as never)
      .select('client_id, coach_action')
      .eq('decision_date', decisionDate);

    if (error) {
      console.error('[fetchCurrentDayDecisions] select failed:', error);
      return { data: null, error: error.message };
    }

    const rows = (data ?? []) as unknown as CurrentDecisionRow[];
    const byClient = new Map<string, CoachAction>();
    for (const row of rows) {
      byClient.set(row.client_id, row.coach_action);
    }
    return { data: byClient, error: null };
  } catch (err: unknown) {
    console.error('[fetchCurrentDayDecisions] unexpected error:', err);
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Unknown error loading decision state',
    };
  }
}

/**
 * Read-only active-prescription lookup for the queue. Mirrors the read half of
 * the existing plan hydration (usePlanFetch) — the SAME persisted sources —
 * without any of its write-capable state machinery. Legacy payloads without a
 * prescription record yield null and the review model lazily derives the
 * canonical initial prescription (never invented history).
 */
export async function fetchActivePrescriptionForReview(
  clientId: string,
): Promise<{ data: ActiveNutritionPrescription | null; error: string | null }> {
  try {
    const planResult = await fetchCurrentPlan(clientId);
    if (planResult.error) {
      return { data: null, error: planResult.error };
    }
    const payload = planResult.plan;
    if (!payload || !planResult.versionId) {
      return { data: null, error: null };
    }
    const rxRecord = readPrescriptionRecord(payload);
    if (!rxRecord) {
      return { data: null, error: null };
    }
    let snapshot = planResult.snapshot;
    if (!snapshot) {
      const snapshotResult = await fetchPersistedSnapshot(planResult.versionId);
      if (snapshotResult.error) {
        return { data: null, error: snapshotResult.error };
      }
      snapshot = snapshotResult.snapshot;
    }
    return {
      data: prescriptionFromLockedPlan({
        weeklyRateKg: rxRecord.weeklyRateKg,
        targetCalories: snapshot?.metrics.targetCalories ?? payload.macroTargets.calories,
        versionId: planResult.versionId,
        versionNumber: planResult.versionNumber ?? null,
        establishedAt: rxRecord.establishedAt,
      }),
      error: null,
    };
  } catch (err: unknown) {
    console.error('[fetchActivePrescriptionForReview] unexpected error:', err);
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Unknown error loading the prescription',
    };
  }
}

/** Injectable dependencies (defaults to the existing services) — used by tests. */
export interface ReviewQueueFetchOptions {
  /** The current date (used only for the CURRENT decision date lookup). */
  now?: () => Date;
  fetchers?: AdaptiveTargetFetchers;
  fetchPrescription?: (
    clientId: string,
  ) => Promise<{ data: ActiveNutritionPrescription | null; error: string | null }>;
  fetchDecisions?: (
    decisionDate: string,
  ) => Promise<{ data: Map<string, CoachAction> | null; error: string | null }>;
}

/**
 * Build the review queue for the given (already authorized) clients. Every
 * client's review status comes from the SAME deterministic pipeline the
 * individual Review page uses (`buildReviewState`). Read-only end to end.
 */
export async function fetchReviewQueue(
  clients: readonly Client[],
  options?: ReviewQueueFetchOptions,
): Promise<ReviewQueueResult> {
  const fetchers = options?.fetchers ?? defaultAdaptiveFetchers;
  const fetchPrescription = options?.fetchPrescription ?? fetchActivePrescriptionForReview;
  const fetchDecisions = options?.fetchDecisions ?? fetchCurrentDayDecisions;
  const today = todayIso((options?.now ?? (() => new Date()))());

  if (clients.length === 0) {
    return { data: { needsDecision: [], resolved: [] }, error: null };
  }

  try {
    const decisionsResult = await fetchDecisions(today);
    if (decisionsResult.error || !decisionsResult.data) {
      return {
        data: null,
        error: decisionsResult.error ?? 'Failed to load the current decision state',
      };
    }
    const decisionsByClient = decisionsResult.data;

    const items = await Promise.all(
      clients.map(async (client) => {
        const [checkinResult, reviewResult, prescriptionResult] = await Promise.all([
          fetchers.fetchCheckins(client.id),
          fetchers.fetchReviews(client.id),
          fetchPrescription(client.id),
        ]);
        if (checkinResult.error) {
          throw new Error(`Failed to load check-in history: ${checkinResult.error}`);
        }
        if (reviewResult.error) {
          throw new Error(`Failed to load weekly reviews: ${reviewResult.error}`);
        }
        if (prescriptionResult.error) {
          throw new Error(`Failed to load the prescription: ${prescriptionResult.error}`);
        }

        const build = buildReviewState({
          client,
          activePrescription: prescriptionResult.data,
          evidence: {
            dailyCheckins: checkinResult.checkins,
            weeklyReviews: reviewResult.reviews,
          },
        });

        return projectReviewQueueItem({
          clientId: client.id,
          clientName: getClientLabel(client),
          reviewStatus: build.review.status,
          reviewDate: build.evidence.latestCheckinDate,
          decisionToday: decisionsByClient.has(client.id)
            ? { coachAction: decisionsByClient.get(client.id)!, decisionDate: today }
            : null,
        });
      }),
    );

    return { data: orderReviewQueue(items), error: null };
  } catch (err: unknown) {
    console.error('[fetchReviewQueue] failed:', err);
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Unknown error building the review queue',
    };
  }
}
