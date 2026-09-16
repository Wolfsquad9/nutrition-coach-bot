/**
 * useCurrentCoachingDecision (Phase 13F)
 *
 * Hydrates the CURRENT decision state for a client from PERSISTENCE so the
 * Review page reconstructs the correct workflow state after navigation or a
 * hard refresh. Strictly read-only (it performs NO nutrition work and NO
 * prescription mutation):
 *  - reads the client's latest persisted decision via the existing Phase 13C
 *    read path (`fetchLatestCoachingDecision`);
 *  - exposes it as the CURRENT decision ONLY when its persisted
 *    `decision_date` equals today's date (the same Phase 13C
 *    one-decision-per-client-per-day semantics) — a historical decision NEVER
 *    satisfies the current review;
 *  - accepts a `refreshKey` so a freshly persisted decision can trigger a
 *    re-read of the authoritative database state (no optimistic completion);
 *  - preserves stale-response protection when the client changes.
 */

import { useEffect, useRef, useState } from 'react';
import { fetchLatestCoachingDecision } from '@/services/review/coachingDecisionService';
import { todayIso } from '@/hooks/useCoachingDecision';
import type { CoachingDecision } from '@/domain/coaching/coachingDecision';

/** Injectable reader (defaults to the Supabase service) — used by tests. */
export type FetchLatestCoachingDecision = (
  clientId: string,
) => Promise<{ data: CoachingDecision | null; error: string | null }>;

export interface UseCurrentCoachingDecisionOptions {
  fetchLatest?: FetchLatestCoachingDecision;
  /** Injectable clock for today's date — used by tests. */
  now?: () => Date;
  /**
   * When this changes (e.g. a decision was just persisted), the persisted
   * state is re-read. Pass null/undefined when nothing changed.
   */
  refreshKey?: string | null;
}

export interface CurrentCoachingDecisionState {
  readonly isLoading: boolean;
  readonly error: string | null;
  /**
   * The persisted decision for the CURRENT decision date, or null when no
   * decision has been persisted for today (or while loading / on error).
   */
  readonly currentDecision: CoachingDecision | null;
}

export function useCurrentCoachingDecision(
  clientId: string | null,
  options?: UseCurrentCoachingDecisionOptions,
): CurrentCoachingDecisionState {
  const fetchLatest = options?.fetchLatest ?? fetchLatestCoachingDecision;
  const now = options?.now ?? (() => new Date());
  const refreshKey = options?.refreshKey ?? null;

  const [state, setState] = useState<CurrentCoachingDecisionState>({
    isLoading: true,
    error: null,
    currentDecision: null,
  });

  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!clientId) {
      setState({ isLoading: false, error: null, currentDecision: null });
      return;
    }

    const requestId = ++requestIdRef.current;
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    fetchLatest(clientId)
      .then((result) => {
        // A stale response for a previous client/refresh must never be shown.
        if (requestId !== requestIdRef.current) return;
        if (result.error) {
          setState({ isLoading: false, error: result.error, currentDecision: null });
          return;
        }
        const persisted = result.data;
        const isCurrent =
          persisted !== null && persisted.decisionDate === todayIso(now());
        setState({
          isLoading: false,
          error: null,
          currentDecision: isCurrent ? persisted : null,
        });
      })
      .catch((err: unknown) => {
        if (requestId !== requestIdRef.current) return;
        const message =
          err instanceof Error ? err.message : 'Unknown error loading the current decision';
        setState({ isLoading: false, error: message, currentDecision: null });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, refreshKey]);

  return state;
}
