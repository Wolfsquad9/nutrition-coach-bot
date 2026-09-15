/**
 * useClientReview (Phase 13B)
 *
 * Thin, READ-ONLY React wiring for the Client Review UI. Owns no nutrition
 * logic and performs no writes:
 *  - the active prescription / plan-lock state comes from the existing
 *    `useNutritionPlanState` (load path only);
 *  - the persisted evidence comes from the existing `defaultAdaptiveFetchers`;
 *  - the deterministic review is built by `buildReviewState`, which delegates
 *    to the existing adaptive layer + the Phase 13A review model.
 *
 * Every effect here triggers only read-only fetches. No insert / update /
 * delete / lock / plan-generation call is ever made.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  defaultAdaptiveFetchers,
  type AdaptiveTargetFetchers,
} from '@/services/nutrition/adaptiveTargetService';
import {
  buildReviewState,
  type ReviewBuildResult,
} from '@/services/review/buildReviewState';
import {
  useNutritionPlanState,
  type PlanState,
} from '@/hooks/useNutritionPlanState';
import type { ActiveNutritionPrescription } from '@/domain/nutrition/prescription';
import type { Client } from '@/types';
import type {
  ClientReviewView,
  ClientReviewViewStatus,
  ReviewPrescriptionInfo,
} from '@/components/review/reviewView';

interface HookState {
  status: ClientReviewViewStatus;
  result: ReviewBuildResult | null;
  error: string | null;
}

function toPrescriptionInfo(
  planState: {
    activePrescription: ActiveNutritionPrescription | null;
    state: PlanState;
    isLocked: boolean;
    lockStatus: { isLocked: boolean; daysRemaining: number } | null;
  },
  baseline: ActiveNutritionPrescription | null,
): ReviewPrescriptionInfo {
  const rx = planState.activePrescription;
  return {
    hasActivePrescription: rx !== null,
    state: planState.state,
    isLocked: planState.isLocked,
    daysRemaining: planState.lockStatus ? planState.lockStatus.daysRemaining : null,
    versionNumber: rx ? rx.versionNumber : null,
    versionId: rx ? rx.versionId : null,
    lockEstablishedAt: rx ? rx.establishedAt : null,
    source: rx ? rx.source : (baseline ? baseline.source : null),
    weeklyRateKg: baseline ? baseline.weeklyRateKg : null,
  };
}

export function useClientReview(
  client: Client | null,
  fetchers: AdaptiveTargetFetchers = defaultAdaptiveFetchers,
): ClientReviewView {
  const planState = useNutritionPlanState();

  const [state, setState] = useState<HookState>({
    status: 'idle',
    result: null,
    error: null,
  });

  const clientRef = useRef(client);
  clientRef.current = client;
  const prescriptionRef = useRef<ActiveNutritionPrescription | null>(planState.activePrescription);
  prescriptionRef.current = planState.activePrescription;
  const fetchersRef = useRef(fetchers);
  fetchersRef.current = fetchers;

  const clientKey = client?.id ?? null;
  const prescriptionKey = planState.activePrescription?.versionId ?? 'initial';

  // Load the active prescription / plan-lock state (read-only).
  useEffect(() => {
    if (client) {
      planState.loadPlanForClient(client.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientKey]);

  // Fetch evidence + build the deterministic review whenever the client or the
  // active prescription changes.
  useEffect(() => {
    const currentClient = clientRef.current;
    if (!currentClient) {
      setState({ status: 'idle', result: null, error: null });
      return;
    }

    setState({ status: 'loading', result: null, error: null });
    let cancelled = false;

    Promise.all([
      fetchersRef.current.fetchCheckins(currentClient.id),
      fetchersRef.current.fetchReviews(currentClient.id),
    ])
      .then(([checkinResult, reviewResult]) => {
        if (cancelled) return;
        if (checkinResult.error) {
          throw new Error(`Failed to load check-in history: ${checkinResult.error}`);
        }
        if (reviewResult.error) {
          throw new Error(`Failed to load weekly reviews: ${reviewResult.error}`);
        }
        const result = buildReviewState({
          client: currentClient,
          activePrescription: prescriptionRef.current,
          evidence: {
            dailyCheckins: checkinResult.checkins,
            weeklyReviews: reviewResult.reviews,
          },
        });
        setState({ status: 'ready', result, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          status: 'error',
          result: null,
          error:
            err instanceof Error
              ? err.message
              : 'Failed to evaluate the client review',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [clientKey, prescriptionKey]);

  return useMemo(
    () => {
      const result = state.result;
      const prescription = toPrescriptionInfo(
        {
          activePrescription: planState.activePrescription,
          state: planState.state,
          isLocked: planState.isLocked,
          lockStatus: planState.lockStatus,
        },
        result ? result.baseline : null,
      );

      return {
        status: state.status,
        error: state.error,
        review: state.status === 'ready' && result ? result.review : null,
        currentMetrics:
          state.status === 'ready' && result ? result.currentMetrics : null,
        prescription,
        evidence: state.status === 'ready' && result ? result.evidence : null,
      };
    },
    [state, planState.activePrescription, planState.state, planState.isLocked, planState.lockStatus],
  );
}