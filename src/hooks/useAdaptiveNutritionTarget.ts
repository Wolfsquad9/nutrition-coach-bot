/**
 * useAdaptiveNutritionTarget (Phases 7-8)
 *
 * Thin React wiring for the adaptive nutrition layer. Owns NO nutrition math:
 *  - the canonical profile target comes from the engine
 *    (`calculateNutritionMetrics`);
 *  - the adaptation baseline is the client's ACTIVE PRESCRIPTION (Phase 8) —
 *    hydrated from the current locked plan version and NOT affected by draft
 *    generation; when no prescription exists yet, the service derives the
 *    deterministic canonical initial prescription from the profile;
 *  - an adapted FUTURE target appears ONLY when the adaptation layer is
 *    eligible (sufficient evidence + adherent_unexpected);
 *  - `effectiveMetrics` / `effectiveWeeklyRateKg` are what plan generation
 *    consumes: the adapted future target when eligible, otherwise the active
 *    prescription basis, otherwise the canonical profile decision.
 *
 * This hook never renders anything and never mutates plans or prescriptions.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  defaultAdaptiveFetchers,
  loadAdaptiveTargetState,
  type AdaptedTargetResult,
  type AdaptiveTargetFetchers,
} from '@/services/nutrition/adaptiveTargetService';
import { calculateNutritionMetrics } from '@/domain/nutrition/engine';
import type { AdaptationDecision } from '@/domain/nutrition/adaptation';
import {
  reconstructMetricsFromPrescription,
  type ActiveNutritionPrescription,
} from '@/domain/nutrition/prescription';
import type { Client, NutritionMetrics } from '@/types';

export type AdaptiveTargetStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface AdaptiveTargetState {
  status: AdaptiveTargetStatus;
  /** The deterministic adaptation decision, when one was evaluated. */
  decision: AdaptationDecision | null;
  /** The ACTIVE PRESCRIPTION baseline used (explicit or initial). */
  baseline: ActiveNutritionPrescription | null;
  /** Adapted FUTURE metrics — non-null only when adaptation is eligible. */
  futureMetrics: NutritionMetrics | null;
  /**
   * What plan generation should use right now: the adapted future target when
   * eligible, otherwise the canonical profile target for this client.
   */
  effectiveMetrics: NutritionMetrics | null;
  /**
   * The weekly rate plan generation should prescribe: the adjusted rate when
   * adaptation is eligible, otherwise the baseline prescription's rate.
   */
  effectiveWeeklyRateKg: number | null;
  error: string | null;
}

interface HookState {
  status: AdaptiveTargetStatus;
  result: AdaptedTargetResult | null;
  error: string | null;
}

export function useAdaptiveNutritionTarget(
  client: Client | null,
  activePrescription: ActiveNutritionPrescription | null,
  fetchers: AdaptiveTargetFetchers = defaultAdaptiveFetchers,
): AdaptiveTargetState {
  const [state, setState] = useState<HookState>({
    status: 'idle',
    result: null,
    error: null,
  });

  // Refs keep the effect stable across parent re-renders (object identities
  // change, but the keys below gate re-evaluation).
  const clientRef = useRef(client);
  clientRef.current = client;
  const prescriptionRef = useRef(activePrescription);
  prescriptionRef.current = activePrescription;
  const fetchersRef = useRef(fetchers);
  fetchersRef.current = fetchers;

  const clientKey = client?.id ?? null;
  const prescriptionKey = activePrescription?.versionId ?? 'initial';

  useEffect(() => {
    const currentClient = clientRef.current;
    if (!currentClient) {
      setState({ status: 'idle', result: null, error: null });
      return;
    }

    let cancelled = false;
    setState((prev) => ({ ...prev, status: 'loading', error: null }));

    loadAdaptiveTargetState(currentClient, prescriptionRef.current, fetchersRef.current)
      .then((result: AdaptedTargetResult) => {
        if (cancelled) return;
        setState({ status: 'ready', result, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // Fetch failures never fabricate evidence: fall back to canonical.
        setState({
          status: 'error',
          result: null,
          error:
            err instanceof Error
              ? err.message
              : 'Failed to evaluate adaptation evidence',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [clientKey, prescriptionKey]);

  // Canonical fallback: the effective metrics ALWAYS describe the SAME basis as
  // `effectiveWeeklyRateKg`. When a prescription basis exists, the fallback is a
  // canonical RECONSTRUCTION from that prescription (never the raw client
  // profile, which would mix two different values). Without any prescription the
  // canonical profile decision is the basis — identical to the deterministic
  // initial prescription the service derives, so the invariant still holds.
  return useMemo(() => {
    const basis = state.result?.baseline ?? activePrescription ?? null;

    // P0 invariant: effectiveMetrics ↔ effectiveWeeklyRateKg MUST describe the
    // same prescription. Reconstruction is the ONLY path once a prescription
    // exists. If it cannot be performed safely, fail deterministically instead
    // of silently combining values from two different sources.
    let fallbackMetrics: NutritionMetrics | null = null;
    if (client) {
      if (basis) {
        try {
          fallbackMetrics = reconstructMetricsFromPrescription(client, basis);
        } catch (err: unknown) {
          return {
            status: 'error',
            decision: null,
            baseline: state.result?.baseline ?? activePrescription ?? null,
            futureMetrics: null,
            effectiveMetrics: null,
            effectiveWeeklyRateKg: null,
            error:
              err instanceof Error
                ? err.message
                : 'Active prescription cannot be reconstructed through the canonical engine',
          };
        }
      } else {
        fallbackMetrics = calculateNutritionMetrics(client);
      }
    }
    const fallbackRate = basis ? basis.weeklyRateKg : null;

    if (state.status !== 'ready' || !state.result || !client) {
      return {
        status: state.status,
        decision: null,
        baseline: state.result?.baseline ?? activePrescription ?? null,
        futureMetrics: null,
        effectiveMetrics: fallbackMetrics,
        effectiveWeeklyRateKg: fallbackRate,
        error: state.error,
      };
    }

    const { decision, futureMetrics, baseline } = state.result;
    const eligible = !!futureMetrics && decision.calorieAdjustmentKcal !== 0;
    return {
      status: 'ready',
      decision,
      baseline,
      futureMetrics,
      // 1) eligible: adapted future metrics whose target corresponds to the
      //    effective future weekly rate (canonical engine output);
      // 2) otherwise: canonical reconstruction of the same prescription whose
      //    rate `effectiveWeeklyRateKg` describes.
      effectiveMetrics: futureMetrics ?? fallbackMetrics,
      effectiveWeeklyRateKg: eligible ? decision.effectiveFutureWeeklyRateKg : baseline.weeklyRateKg,
      error: null,
    };
  }, [state, client, activePrescription]);
}
