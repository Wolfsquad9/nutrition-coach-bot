/**
 * useReviewQueue — React hook tests (Phase 13E)
 *
 * Verifies the read lifecycle: ready for an empty roster without fetching,
 * loading -> ready with the projected queue, error exposure, and stale-response
 * protection when the client list changes.
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useReviewQueue } from './useReviewQueue';
import type { Client } from '@/types';
import type { ReviewQueue } from '@/services/review/reviewQueueService';

const CLIENT: Client = {
  id: 'client-13e',
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'j@doe.com',
  phone: '',
  birthDate: '1995-06-15',
  age: 30,
  gender: 'male',
  height: 180,
  weight: 80,
  activityLevel: 'moderately_active',
  primaryGoal: 'fat_loss',
  targetWeight: 75,
  weeklyWeightChange: -0.5,
  trainingExperience: 'intermediate',
  trainingDaysPerWeek: 4,
  sessionDuration: 60,
  preferredTrainingStyle: 'hypertrophy',
  equipment: [],
  equipmentAvailable: [],
  dietType: 'omnivore',
  mealsPerDay: 3,
  intolerances: [],
  allergies: [],
  dislikedFoods: [],
  medicalConditions: [],
  medications: [],
  injuries: [],
  hasRedFlags: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-29T00:00:00.000Z',
};

const QUEUE: ReviewQueue = {
  needsDecision: [
    {
      clientId: 'client-13e',
      clientName: 'Jane Doe',
      reviewStatus: 'adjustment_recommended',
      decisionStatus: 'needed',
      decisionAction: null,
      reviewDate: '2026-09-14',
    },
  ],
  resolved: [],
};

describe('useReviewQueue', () => {
  it('is ready with an empty queue for an empty roster without fetching', () => {
    const fetchQueue = vi.fn();
    const { result } = renderHook(() => useReviewQueue([], { fetchQueue }));
    expect(result.current.status).toBe('ready');
    expect(result.current.queue).toEqual({ needsDecision: [], resolved: [] });
    expect(fetchQueue).not.toHaveBeenCalled();
  });

  it('loads the queue into the ready state', async () => {
    const fetchQueue = vi.fn().mockResolvedValue({ data: QUEUE, error: null });
    const { result } = renderHook(() => useReviewQueue([CLIENT], { fetchQueue }));

    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(fetchQueue).toHaveBeenCalledWith([CLIENT]);
    expect(result.current.queue?.needsDecision[0].clientId).toBe('client-13e');
    expect(result.current.error).toBeNull();
  });

  it('exposes a read failure as the error state', async () => {
    const fetchQueue = vi.fn().mockResolvedValue({ data: null, error: 'network down' });
    const { result } = renderHook(() => useReviewQueue([CLIENT], { fetchQueue }));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('network down');
    expect(result.current.queue).toBeNull();
  });

  it('refetches when the client list changes and discards a stale response', async () => {
    let releaseA: (() => void) | null = null;
    const gateA = new Promise<{ data: ReviewQueue | null; error: string | null }>((resolve) => {
      releaseA = () =>
        resolve({
          data: {
            needsDecision: [
              {
                clientId: 'stale',
                clientName: 'Stale',
                reviewStatus: 'maintain',
                decisionStatus: 'needed',
                decisionAction: null,
                reviewDate: null,
              },
            ],
            resolved: [],
          },
          error: null,
        });
    });
    const fetchQueue = vi
      .fn<(clients: readonly Client[]) => Promise<{ data: ReviewQueue | null; error: string | null }>>()
      .mockReturnValueOnce(gateA)
      .mockResolvedValue({ data: QUEUE, error: null });

    const { result, rerender } = renderHook(
      ({ clients }: { clients: readonly Client[] }) => useReviewQueue(clients, { fetchQueue }),
      { initialProps: { clients: [{ ...CLIENT, id: 'client-a' }] as readonly Client[] } },
    );

    rerender({ clients: [CLIENT] });
    await waitFor(() => expect(result.current.queue?.needsDecision[0].clientId).toBe('client-13e'));

    // The stale (slow) response for the previous list must never be shown.
    await act(async () => {
      releaseA?.();
      await gateA;
    });
    expect(result.current.queue?.needsDecision[0].clientId).toBe('client-13e');
  });
});
