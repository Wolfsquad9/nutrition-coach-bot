/**
 * useCoachingDecision (Phase 13C)
 *
 * React wiring for recording a coaching decision. Owns the submission lifecycle
 * only (it performs NO nutrition work and NO prescription mutation):
 *  - submits a validated decision via the persistence service;
 *  - exposes isSaving / error / recorded (last persisted decision);
 *  - prevents accidental duplicate submission (busy guard on top of the
 *    service's one-decision-per-day invariant);
 *  - provides success/error feedback via the existing toast convention;
 *  - never reports success before persistence succeeds.
 */

import { useCallback, useRef, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import {
  createCoachingDecision,
  type CreateCoachingDecisionInput,
} from '@/services/review/coachingDecisionService';
import type { CoachingDecision } from '@/domain/coaching/coachingDecision';

/** A callback capable of persisting a decision (matches the service signature). */
export type PersistCoachingDecision = (
  input: CreateCoachingDecisionInput,
) => Promise<{ data: CoachingDecision | null; error: string | null }>;

export interface UseCoachingDecisionOptions {
  /** Injectable persistence (defaults to the Supabase service) — used by tests. */
  persist?: PersistCoachingDecision;
  /** Injectable clock for today's date — used by tests. */
  now?: () => Date;
}

export interface CoachingDecisionRecordState {
  readonly isSaving: boolean;
  readonly error: string | null;
  /** The last successfully persisted decision, once one exists. */
  readonly recorded: CoachingDecision | null;
  /**
   * The client this submission lifecycle belongs to (from the submitted
   * input's clientId). The hook is page-scoped, not per-client, so consumers
   * MUST scope this state to the active client before rendering it —
   * otherwise a decision recorded for client A would leak into client B's
   * review after an active-client switch.
   */
  readonly clientId: string | null;
}

/** A neutral recording lifecycle (nothing in flight, nothing recorded). */
export function idleCoachingDecisionState(): CoachingDecisionRecordState {
  return { isSaving: false, error: null, recorded: null, clientId: null };
}

/**
 * Scope a recording lifecycle to the client being viewed. The recording hook
 * is page-scoped (not per-client); without this scoping, a decision recorded
 * for client A would leak into client B's review after an active-client
 * switch. Returns the lifecycle unchanged when it belongs to the active
 * client (same-client save/retry/error behavior is fully preserved), and a
 * neutral lifecycle otherwise — in which case the consumer falls back to the
 * client's own persisted current decision.
 */
export function scopeCoachingDecisionToClient(
  state: CoachingDecisionRecordState,
  activeClientId: string | null,
): CoachingDecisionRecordState {
  return state.clientId === activeClientId ? state : idleCoachingDecisionState();
}

/** Today's date as YYYY-MM-DD (local time). */
export function todayIso(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const currentTodayIso = (): Date => new Date();

export function useCoachingDecision(
  options?: UseCoachingDecisionOptions,
): CoachingDecisionRecordState & {
  recordDecision: (input: CreateCoachingDecisionInput) => Promise<void>;
  resetDecision: () => void;
} {
  const { toast } = useToast();
  const persist = options?.persist ?? createCoachingDecision;
  const now = options?.now ?? currentTodayIso;

  const [state, setState] = useState<CoachingDecisionRecordState>(idleCoachingDecisionState());
  const busyRef = useRef(false);

  const recordDecision = useCallback(
    async (rawInput: CreateCoachingDecisionInput) => {
      // Prevent accidental double-submission from a single UI action.
      if (busyRef.current) {
        setState((prev) => ({
          ...prev,
          error: 'A decision is already being saved. Please wait for it to finish.',
        }));
        return;
      }

      busyRef.current = true;
      // The lifecycle is scoped to the client the input was recorded FOR so
      // consumers can ignore it when viewing a different client.
      setState({ isSaving: true, error: null, recorded: null, clientId: rawInput.clientId });

      const payload: CreateCoachingDecisionInput = {
        ...rawInput,
        decisionDate: rawInput.decisionDate || todayIso(now()),
      };

      try {
        const result = await persist(payload);
        if (result.error) {
          setState({ isSaving: false, error: result.error, recorded: null, clientId: payload.clientId });
          toast({
            title: 'Decision not recorded',
            description: result.error,
            variant: 'destructive',
          });
          return;
        }
        setState({ isSaving: false, error: null, recorded: result.data, clientId: payload.clientId });
        toast({
          title: 'Decision recorded',
          description:
            'The coaching decision was saved. No prescription or new plan was created.',
        });
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Unknown error recording the decision';
        setState({ isSaving: false, error: message, recorded: null, clientId: payload.clientId });
        toast({ title: 'Decision not recorded', description: message, variant: 'destructive' });
      } finally {
        busyRef.current = false;
      }
    },
    [persist, now, toast],
  );

  const resetDecision = useCallback(() => {
    setState(idleCoachingDecisionState());
  }, []);

  return { ...state, recordDecision, resetDecision };
}