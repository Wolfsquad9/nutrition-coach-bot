/**
 * useCurrentCoachingDecision — React hook tests (Phase 13F)
 *
 * Verifies the persistence-hydrated current decision state: only a decision
 * whose persisted decision_date equals TODAY is exposed as "current"; a
 * historical decision never satisfies the current review; failures surface as
 * errors; refreshKey triggers a re-read of the authoritative data; stale
 * responses for a previous client are discarded.
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useCurrentCoachingDecision } from './useCurrentCoachingDecision';
import type { CoachingDecision } from '@/domain/coaching/coachingDecision';

const TODAY = '2026-09-16';

function decision(overrides: Partial<CoachingDecision> = {}): CoachingDecision {
  return {
    id: 'd-1',
    coachId: 'coach-1',
    createdAt: '2026-09-16T09:00:00Z',
    clientId: 'client-13f',
    decisionDate: TODAY,
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

function options(overrides: Record<string, unknown> = {}) {
  return {
    now: () => new Date('2026-09-16T10:00:00'),
    ...overrides,
  };
}

describe('useCurrentCoachingDecision', () => {
  it('is idle without a client and never fetches', () => {
    const fetchLatest = vi.fn();
    const { result } = renderHook(() =>
      useCurrentCoachingDecision(null, { fetchLatest, ...options() }),
    );
    expect(result.current.isLoading).toBe(false);
    expect(result.current.currentDecision).toBeNull();
    expect(fetchLatest).not.toHaveBeenCalled();
  });

  it('exposes a persisted decision for TODAY as the current decision', async () => {
    const fetchLatest = vi.fn().mockResolvedValue({ data: decision(), error: null });
    const { result } = renderHook(() =>
      useCurrentCoachingDecision('client-13f', { fetchLatest, ...options() }),
    );

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(fetchLatest).toHaveBeenCalledWith('client-13f');
    expect(result.current.error).toBeNull();
    expect(result.current.currentDecision?.coachAction).toBe('modified');
    expect(result.current.currentDecision?.finalTargetCalories).toBe(2050);
  });

  it('never treats a HISTORICAL decision as the current decision', async () => {
    const fetchLatest = vi.fn().mockResolvedValue({
      data: decision({ decisionDate: '2026-09-15' }),
      error: null,
    });
    const { result } = renderHook(() =>
      useCurrentCoachingDecision('client-13f', { fetchLatest, ...options() }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.currentDecision).toBeNull();
  });

  it('surfaces a read failure as an error with no fabricated decision', async () => {
    const fetchLatest = vi.fn().mockResolvedValue({ data: null, error: 'network down' });
    const { result } = renderHook(() =>
      useCurrentCoachingDecision('client-13f', { fetchLatest, ...options() }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe('network down');
    expect(result.current.currentDecision).toBeNull();
  });

  it('re-reads the persisted state when the refreshKey changes', async () => {
    const fetchLatest = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: null }) // before the save
      .mockResolvedValue({ data: decision({ id: 'd-new' }), error: null }); // after the save

    const { result, rerender } = renderHook(
      ({ refreshKey }: { refreshKey: string | null }) =>
        useCurrentCoachingDecision('client-13f', { fetchLatest, refreshKey, ...options() }),
      { initialProps: { refreshKey: null as string | null } },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.currentDecision).toBeNull();

    // The decision was persisted; the hook re-reads the authoritative data.
    rerender({ refreshKey: 'd-new' });
    await waitFor(() => expect(result.current.currentDecision?.id).toBe('d-new'));
    expect(fetchLatest).toHaveBeenCalledTimes(2);
  });

  it('discards a stale response when the client changes', async () => {
    let releaseA: (() => void) | null = null;
    const gateA = new Promise<{
      data: CoachingDecision | null;
      error: string | null;
    }>((resolve) => {
      releaseA = () => resolve({ data: decision({ clientId: 'client-a', id: 'stale' }), error: null });
    });
    const fetchLatest = vi
      .fn()
      .mockReturnValueOnce(gateA)
      .mockResolvedValue({ data: decision({ clientId: 'client-b', id: 'fresh' }), error: null });

    const { result, rerender } = renderHook(
      ({ clientId }: { clientId: string | null }) =>
        useCurrentCoachingDecision(clientId, { fetchLatest, ...options() }),
      { initialProps: { clientId: 'client-a' as string | null } },
    );

    rerender({ clientId: 'client-b' });
    await waitFor(() => expect(result.current.currentDecision?.id).toBe('fresh'));

    await act(async () => {
      releaseA?.();
      await gateA;
    });
    // The stale response for client-a must never be shown for client-b.
    expect(result.current.currentDecision?.id).toBe('fresh');
    expect(result.current.currentDecision?.clientId).toBe('client-b');
  });
});
