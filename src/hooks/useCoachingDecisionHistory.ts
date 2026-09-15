/**
 * useCoachingDecisionHistory (Phase 13D)
 *
 * React wiring for reading a client's PERSISTED decision history. Strictly
 * read-only (it performs NO nutrition work and NO prescription mutation):
 *  - loads the client's decision history via the read service;
 *  - exposes an idle / loading / ready / error lifecycle;
 *  - reloads when the client identity changes;
 *  - never reconstructs history from current review / prescription state.
 */

import { useEffect, useRef, useState } from 'react';
import {
  fetchCoachingDecisionHistory,
  type CoachingDecisionHistoryResult,
} from '@/services/review/coachingDecisionService';
import type { CoachingDecision } from '@/domain/coaching/coachingDecision';

/** A callback capable of reading decision history (matches the service signature). */
export type FetchCoachingDecisionHistory = (
  clientId: string,
) => Promise<CoachingDecisionHistoryResult>;

export interface UseCoachingDecisionHistoryOptions {
  /** Injectable reader (defaults to the Supabase service) — used by tests. */
  fetchHistory?: FetchCoachingDecisionHistory;
}

export type DecisionHistoryStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface CoachingDecisionHistoryState {
  readonly status: DecisionHistoryStatus;
  /** Newest-first persisted decisions (populated only when status is 'ready'). */
  readonly decisions: CoachingDecision[];
  readonly error: string | null;
}

const defaultFetchHistory = fetchCoachingDecisionHistory;

export function useCoachingDecisionHistory(
  clientId: string | null,
  options?: UseCoachingDecisionHistoryOptions,
): CoachingDecisionHistoryState {
  const fetchHistory = options?.fetchHistory ?? defaultFetchHistory;

  const [state, setState] = useState<CoachingDecisionHistoryState>({
    status: 'idle',
    decisions: [],
    error: null,
  });

  // Guards against out-of-order responses when the client switches quickly.
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!clientId) {
      setState({ status: 'idle', decisions: [], error: null });
      return;
    }

    const requestId = ++requestIdRef.current;
    setState({ status: 'loading', decisions: [], error: null });

    fetchHistory(clientId)
      .then((result) => {
        // A stale response for a previous client must never be shown.
        if (requestId !== requestIdRef.current) return;
        if (result.error) {
          setState({ status: 'error', decisions: [], error: result.error });
          return;
        }
        setState({ status: 'ready', decisions: result.data ?? [], error: null });
      })
      .catch((err: unknown) => {
        if (requestId !== requestIdRef.current) return;
        const message =
          err instanceof Error ? err.message : 'Unknown error loading the decision history';
        setState({ status: 'error', decisions: [], error: message });
      });
  }, [clientId, fetchHistory]);

  return state;
}
