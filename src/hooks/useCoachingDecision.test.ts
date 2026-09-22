/**
 * useCoachingDecision — React hook tests (Phase 13C)
 *
 * Verifies the submission lifecycle: success only after persistence succeeds,
 * errors never render as success, a double-submission is blocked, and the
 * decision date is defaulted when omitted.
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { todayIso, scopeCoachingDecisionToClient, useCoachingDecision } from './useCoachingDecision';

const DECISION_DATE = '2026-09-15';

function input(overrides: Record<string, unknown> = {}): Parameters<ReturnType<typeof useCoachingDecision>['recordDecision']>[0] {
  return {
    clientWeightKg: 80,
    clientId: 'client-13c',
    recommendationStatus: 'adjustment_recommended',
    coachAction: 'accepted',
    baselinePrescriptionVersionId: null,
    observedWeeklyRateKg: null,
    targetWeeklyRateKg: null,
    adherenceScore: null,
    recommendedCalorieAdjustment: -150,
    recommendedTargetCalories: 2000,
    finalTargetCalories: 2000,
    coachNote: null,
    decisionDate: DECISION_DATE,
    ...overrides,
  } as Parameters<ReturnType<typeof useCoachingDecision>['recordDecision']>[0];
}

describe('todayIso', () => {
  it('formats a date as YYYY-MM-DD', () => {
    expect(todayIso(new Date('2026-09-05T12:00:00'))).toBe('2026-09-05');
  });
});

describe('useCoachingDecision — recordDecision', () => {
  it('records only after persistence succeeds, preserving the recommendation snapshot', async () => {
    const persist = vi.fn().mockResolvedValue({
      data: { id: 'd-1', ...input() },
      error: null,
    });

    const { result } = renderHook(() => useCoachingDecision({ persist }));

    expect(result.current.isSaving).toBe(false);
    expect(result.current.recorded).toBeNull();

    await act(async () => {
      await result.current.recordDecision(input());
    });

    expect(persist).toHaveBeenCalledTimes(1);
    expect(result.current.isSaving).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.recorded?.id).toBe('d-1');
    expect(result.current.recorded?.recommendedTargetCalories).toBe(2000);
    expect(result.current.recorded?.finalTargetCalories).toBe(2000);
  });

  it('defaults the decision date to today when omitted', async () => {
    const persist = vi.fn().mockResolvedValue({ data: null, error: null });
    const { result } = renderHook(() =>
      useCoachingDecision({ persist, now: () => new Date('2026-09-05T10:00:00') }),
    );

    // Remove the decisionDate so the hook supplies today.
    const { decisionDate: _drop, ...withoutDate } = input();
    void _drop;
    await act(async () => {
      await result.current.recordDecision(withoutDate as Parameters<typeof result.current.recordDecision>[0]);
    });

    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist.mock.calls[0][0].decisionDate).toBe('2026-09-05');
  });

  it('does not report success when persistence fails; exposes the error', async () => {
    const persist = vi.fn().mockResolvedValue({ data: null, error: 'network down' });
    const { result } = renderHook(() => useCoachingDecision({ persist }));

    await act(async () => {
      await result.current.recordDecision(input());
    });

    expect(result.current.recorded).toBeNull();
    expect(result.current.isSaving).toBe(false);
    expect(result.current.error).toBe('network down');
  });

  it('prevents a duplicate submission while one is in flight', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const persist = vi.fn().mockImplementation(async () => {
      await gate;
      return { data: { id: 'd-1', ...input() }, error: null };
    });

    const { result } = renderHook(() => useCoachingDecision({ persist }));

    await act(async () => {
      void result.current.recordDecision(input());
      void result.current.recordDecision(input()); // double-click
    });

    // Still in flight: the second call must not have opened a second request.
    expect(persist).toHaveBeenCalledTimes(1);

    await act(async () => {
      release();
    });
    await waitFor(() => {
      expect(result.current.recorded?.id).toBe('d-1');
    });
    expect(persist).toHaveBeenCalledTimes(1);
  });
});

/**
 * Client-switch scoping (regression): the recording hook is page-scoped, so
 * its lifecycle state must carry the clientId it was recorded FOR, and the
 * page must scope it to the ACTIVE client. Without this, a decision recorded
 * for client A would keep taking precedence over client B's own persisted
 * current decision after switching to B — hiding B's available actions.
 */
describe('useCoachingDecision — client-switch scoping (regression)', () => {
  it('tags the recording lifecycle with the clientId it was recorded for', async () => {
    const persist = vi.fn().mockResolvedValue({
      data: { id: 'd-a', ...input({ clientId: 'client-a' }) },
      error: null,
    });
    const { result } = renderHook(() => useCoachingDecision({ persist }));

    await act(async () => {
      await result.current.recordDecision(input({ clientId: 'client-a' }));
    });

    expect(result.current.recorded?.id).toBe('d-a');
    expect(result.current.clientId).toBe('client-a');
  });

  it('scopes a previous client\u2019s recording OUT of a newly active client', async () => {
    const persist = vi.fn().mockResolvedValue({
      data: { id: 'd-a', ...input({ clientId: 'client-a' }) },
      error: null,
    });
    const { result } = renderHook(() => useCoachingDecision({ persist }));

    // 1. Coach reviews client A and records a decision.
    await act(async () => {
      await result.current.recordDecision(input({ clientId: 'client-a' }));
    });
    expect(result.current.recorded?.id).toBe('d-a');

    // 2. Coach switches to client B (page stays mounted).
    const forClientB = scopeCoachingDecisionToClient(result.current, 'client-b');

    // 3. Client B must NOT inherit client A's recorded state…
    expect(forClientB.recorded).toBeNull();
    expect(forClientB.isSaving).toBe(false);
    expect(forClientB.error).toBeNull();
    // …and therefore falls back to B's OWN persisted current decision
    // (hydrated from persistence), never to A's in-memory recording.
    const clientBPersisted = { id: 'd-b', clientId: 'client-b' };
    expect(forClientB.recorded ?? clientBPersisted).toEqual(clientBPersisted);
  });

  it('keeps the same-client recording intact (switch back preserves save/retry state)', async () => {
    const persist = vi.fn().mockResolvedValue({
      data: { id: 'd-a', ...input({ clientId: 'client-a' }) },
      error: null,
    });
    const { result } = renderHook(() => useCoachingDecision({ persist }));

    await act(async () => {
      await result.current.recordDecision(input({ clientId: 'client-a' }));
    });

    // Switch away and back to A: A's own lifecycle is unchanged.
    expect(scopeCoachingDecisionToClient(result.current, 'client-b').recorded).toBeNull();
    const backOnA = scopeCoachingDecisionToClient(result.current, 'client-a');
    expect(backOnA.recorded?.id).toBe('d-a');
    expect(backOnA.clientId).toBe('client-a');
  });
});