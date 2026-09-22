/**
 * useCoachingDecision — React hook tests (Phase 13C)
 *
 * Verifies the submission lifecycle: success only after persistence succeeds,
 * errors never render as success, a double-submission is blocked, and the
 * decision date is defaulted when omitted.
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { todayIso, useCoachingDecision } from './useCoachingDecision';

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