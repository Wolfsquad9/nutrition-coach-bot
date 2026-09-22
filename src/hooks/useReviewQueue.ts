/**
 * useReviewQueue (Phase 13E)
 *
 * React wiring for the coach Review Queue. Strictly read-only (it performs NO
 * nutrition work and NO prescription/decision mutation):
 *  - takes the ALREADY-AUTHORIZED client list (the existing AppLayout context,
 *    which is RLS-scoped — no client-id-based access bypass is possible);
 *  - builds the queue via the read-only reviewQueueService;
 *  - exposes an idle / loading / ready / error lifecycle with stale-response
 *    protection when the client list changes.
 */

import { useEffect, useRef, useState } from 'react';
import {
  fetchReviewQueue,
  type ReviewQueue,
  type ReviewQueueResult,
} from '@/services/review/reviewQueueService';
import type { Client } from '@/types';

export type ReviewQueueStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface ReviewQueueState {
  readonly status: ReviewQueueStatus;
  readonly queue: ReviewQueue | null;
  readonly error: string | null;
}

/** Injectable reader (defaults to the Supabase-backed service) — used by tests. */
export type FetchReviewQueue = (
  clients: readonly Client[],
) => Promise<ReviewQueueResult>;

export interface UseReviewQueueOptions {
  fetchQueue?: FetchReviewQueue;
}

export function useReviewQueue(
  clients: readonly Client[],
  options?: UseReviewQueueOptions,
): ReviewQueueState {
  const fetchQueue = options?.fetchQueue ?? fetchReviewQueue;

  const [state, setState] = useState<ReviewQueueState>({
    status: 'idle',
    queue: null,
    error: null,
  });

  // Guards against out-of-order responses when the client list changes.
  const requestIdRef = useRef(0);

  // Stable dependency: the client identity list, not the array object identity.
  const clientKey = clients.map((c) => c.id).join('|');
  const clientsRef = useRef(clients);
  clientsRef.current = clients;

  useEffect(() => {
    const currentClients = clientsRef.current;
    if (currentClients.length === 0) {
      // With no clients, the service can return an empty queue instantly, but
      // keep 'idle' semantics only when the coach context has no clients yet —
      // the caller distinguishes "no clients" from "still loading".
      setState({ status: 'ready', queue: { needsDecision: [], resolved: [] }, error: null });
      return;
    }

    const requestId = ++requestIdRef.current;
    setState({ status: 'loading', queue: null, error: null });

    fetchQueue(currentClients)
      .then((result) => {
        if (requestId !== requestIdRef.current) return; // stale response
        if (result.error) {
          setState({ status: 'error', queue: null, error: result.error });
          return;
        }
        setState({ status: 'ready', queue: result.data, error: null });
      })
      .catch((err: unknown) => {
        if (requestId !== requestIdRef.current) return;
        const message =
          err instanceof Error ? err.message : 'Unknown error loading the review queue';
        setState({ status: 'error', queue: null, error: message });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientKey]);

  return state;
}
