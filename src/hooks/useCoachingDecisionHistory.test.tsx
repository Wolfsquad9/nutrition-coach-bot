/**
 * useCoachingDecisionHistory — React hook tests (Phase 13D)
 *
 * Verifies the read lifecycle: idle without a client, loading -> ready with the
 * returned decisions, error exposure, and reload on client change (a stale
 * response must never be shown).
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useCoachingDecisionHistory } from './useCoachingDecisionHistory';
import type { CoachingDecision } from '@/domain/coaching/coachingDecision';

function decision(overrides: Partial<CoachingDecision> = {}): CoachingDecision {
  return {
    id: 'd-1',
    coachId: 'coach-1',
    createdAt: '2026-09-15T09:00:00Z',
    clientId: 'client-13d',
    decisionDate: '2026-09-15',
    recommendationStatus: 'adjustment_recommended',
    coachAction: 'modified',
    baselinePrescriptionVersionId: 'ver-1',
    observedWeeklyRateKg: -0.5,
    targetWeeklyRateKg: -0.5,
    adherenceScore: 90,
    recommendedCalorieAdjustment: -150,
    recommendedTargetCalories: 2000,
    finalTargetCalories: 2050,
    coachNote: null,
    ...overrides,
  };
}

describe('useCoachingDecisionHistory', () => {
  it('stays idle without a client and never fetches', () => {
    const fetchHistory = vi.fn();
    const { result } = renderHook(() => useCoachingDecisionHistory(null, { fetchHistory }));
    expect(result.current.status).toBe('idle');
    expect(result.current.decisions).toEqual([]);
    expect(fetchHistory).not.toHaveBeenCalled();
  });

  it('loads the client history into the ready state', async () => {
    const fetchHistory = vi.fn().mockResolvedValue({
      data: [decision(), decision({ id: 'd-2', decisionDate: '2026-09-08' })],
      error: null,
    });
    const { result } = renderHook(() =>
      useCoachingDecisionHistory('client-13d', { fetchHistory }),
    );

    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(fetchHistory).toHaveBeenCalledWith('client-13d');
    expect(result.current.decisions.map((d) => d.id)).toEqual(['d-1', 'd-2']);
    expect(result.current.error).toBeNull();
  });

  it('exposes a read failure as the error state', async () => {
    const fetchHistory = vi.fn().mockResolvedValue({ data: null, error: 'network down' });
    const { result } = renderHook(() =>
      useCoachingDecisionHistory('client-13d', { fetchHistory }),
    );

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('network down');
    expect(result.current.decisions).toEqual([]);
  });

  it('refetches when the client changes and discards a stale response', async () => {
    let releaseA: (() => void) | null = null;
    const gateA = new Promise<{ data: CoachingDecision[] | null; error: string | null }>(
      (resolve) => {
        releaseA = () => resolve({ data: [decision({ id: 'stale' })], error: null });
      },
    );
    const fetchHistory = vi
      .fn<(clientId: string) => Promise<{ data: CoachingDecision[] | null; error: string | null }>>()
      .mockReturnValueOnce(gateA)
      .mockResolvedValue({ data: [decision({ id: 'fresh' })], error: null });

    const { result, rerender } = renderHook(
      ({ clientId }: { clientId: string | null }) =>
        useCoachingDecisionHistory(clientId, { fetchHistory }),
      { initialProps: { clientId: 'client-a' as string | null } },
    );

    rerender({ clientId: 'client-b' });
    await waitFor(() => expect(result.current.decisions.map((d) => d.id)).toEqual(['fresh']));

    // The stale (slow) response for client-a must never be shown.
    await act(async () => {
      releaseA?.();
      await gateA;
    });
    await waitFor(() => {
      expect(result.current.decisions.map((d) => d.id)).toEqual(['fresh']);
    });
  });
});
