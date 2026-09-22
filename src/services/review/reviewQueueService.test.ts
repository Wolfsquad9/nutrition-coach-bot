/**
 * Review Queue — projection + service tests (Phase 13E)
 *
 * Verifies the read-only queue projection: client identity preserved, review
 * status preserved verbatim, decision state derived ONLY from a persisted
 * decision for the current date, deterministic grouping/ordering, empty
 * client set, and read failure handling. No nutrition values are projected.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn(), from: vi.fn() },
}));

import { supabase } from '@/integrations/supabase/client';
import type { Client } from '@/types';
import {
  projectReviewQueueItem,
  orderReviewQueue,
  fetchCurrentDayDecisions,
  fetchReviewQueue,
  type ReviewQueueItem,
} from './reviewQueueService';

const mockFrom = supabase.from as ReturnType<typeof vi.fn>;

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

const TODAY = '2026-09-15';

// ============================================================================
// PROJECTION
// ============================================================================

describe('projectReviewQueueItem', () => {
  it('preserves client identity and review status verbatim', () => {
    const item = projectReviewQueueItem({
      clientId: 'c1',
      clientName: 'Jane Doe — 80kg — Perte de graisse',
      reviewStatus: 'adjustment_recommended',
      reviewDate: '2026-09-14',
      decisionToday: null,
    });
    expect(item.clientId).toBe('c1');
    expect(item.clientName).toBe('Jane Doe — 80kg — Perte de graisse');
    expect(item.reviewStatus).toBe('adjustment_recommended');
    expect(item.decisionStatus).toBe('needed');
    expect(item.decisionAction).toBeNull();
    expect(item.reviewDate).toBe('2026-09-14');
  });

  it('marks a review resolved ONLY when a decision exists for the current date', () => {
    const item = projectReviewQueueItem({
      clientId: 'c1',
      clientName: 'A',
      reviewStatus: 'maintain',
      reviewDate: '2026-09-01',
      decisionToday: { coachAction: 'maintained', decisionDate: TODAY },
    });
    expect(item.decisionStatus).toBe('recorded');
    expect(item.decisionAction).toBe('maintained');
    expect(item.reviewDate).toBe(TODAY);
  });
});

describe('orderReviewQueue', () => {
  function item(overrides: Partial<ReviewQueueItem> & { clientId: string }): ReviewQueueItem {
    return {
      clientId: overrides.clientId,
      clientName: `Client ${overrides.clientId}`,
      reviewStatus: 'adjustment_recommended',
      decisionStatus: 'needed',
      decisionAction: null,
      reviewDate: '2026-09-14',
      ...overrides,
    };
  }

  it('groups outstanding decisions before resolved reviews', () => {
    const queue = orderReviewQueue([
      item({ clientId: 'r1', decisionStatus: 'recorded' }),
      item({ clientId: 'n1' }),
    ]);
    expect(queue.needsDecision.map((i) => i.clientId)).toEqual(['n1']);
    expect(queue.resolved.map((i) => i.clientId)).toEqual(['r1']);
  });

  it('orders needs-decision by review-model status priority (deterministic, no scoring)', () => {
    const queue = orderReviewQueue([
      item({ clientId: 'm', reviewStatus: 'maintain' }),
      item({ clientId: 'i', reviewStatus: 'insufficient_data' }),
      item({ clientId: 'rr', reviewStatus: 'review_required' }),
      item({ clientId: 'ar', reviewStatus: 'adjustment_recommended' }),
    ]);
    expect(queue.needsDecision.map((i) => i.clientId)).toEqual(['ar', 'rr', 'i', 'm']);
  });

  it('uses the most relevant review date descending within the same status', () => {
    const queue = orderReviewQueue([
      item({ clientId: 'old', reviewStatus: 'maintain', reviewDate: '2026-09-01' }),
      item({ clientId: 'new', reviewStatus: 'maintain', reviewDate: '2026-09-10' }),
    ]);
    expect(queue.needsDecision.map((i) => i.clientId)).toEqual(['new', 'old']);
  });

  it('breaks full ties deterministically by client identity', () => {
    const queue = orderReviewQueue([
      item({ clientId: 'b', reviewStatus: 'maintain', reviewDate: null }),
      item({ clientId: 'a', reviewStatus: 'maintain', reviewDate: null }),
    ]);
    expect(queue.needsDecision.map((i) => i.clientId)).toEqual(['a', 'b']);
  });

  it('handles the empty client set', () => {
    expect(orderReviewQueue([])).toEqual({ needsDecision: [], resolved: [] });
  });
});

// ============================================================================
// READ PATHS
// ============================================================================

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchCurrentDayDecisions', () => {
  it('queries coaching_decisions scoped to the current decision date (one set-based read)', async () => {
    const eq = vi.fn().mockResolvedValue({
      data: [
        { client_id: 'c1', coach_action: 'modified' },
        { client_id: 'c2', coach_action: 'deferred' },
      ],
      error: null,
    });
    mockFrom.mockReturnValue({ select: vi.fn().mockReturnValue({ eq }) });

    const result = await fetchCurrentDayDecisions(TODAY);
    expect(result.error).toBeNull();
    expect(mockFrom).toHaveBeenCalledWith('coaching_decisions');
    expect(eq).toHaveBeenCalledWith('decision_date', TODAY);
    expect(result.data?.get('c1')).toBe('modified');
    expect(result.data?.get('c2')).toBe('deferred');
  });

  it('surfaces a read failure', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: { message: 'network down' } }),
      }),
    });
    const result = await fetchCurrentDayDecisions(TODAY);
    expect(result.data).toBeNull();
    expect(result.error).toBe('network down');
  });
});

describe('fetchReviewQueue', () => {
  const baseOptions = () => ({
    now: () => new Date('2026-09-15T10:00:00'),
    fetchers: {
      fetchCheckins: vi.fn().mockResolvedValue({ checkins: [], error: null }),
      fetchReviews: vi.fn().mockResolvedValue({ reviews: [], error: null }),
    },
    fetchPrescription: vi.fn().mockResolvedValue({ data: null, error: null }),
    fetchDecisions: vi.fn().mockResolvedValue({ data: new Map(), error: null }),
  });

  it('returns an empty queue for an empty client set without any fetch', async () => {
    const options = baseOptions();
    const result = await fetchReviewQueue([], options);
    expect(result.error).toBeNull();
    expect(result.data).toEqual({ needsDecision: [], resolved: [] });
    expect(options.fetchers.fetchCheckins).not.toHaveBeenCalled();
  });

  it('delegates each client review to the existing buildReviewState pipeline and preserves statuses', async () => {
    const options = baseOptions();
    const result = await fetchReviewQueue(
      [CLIENT, { ...CLIENT, id: 'client-2', firstName: 'Bob' }],
      options,
    );
    expect(result.error).toBeNull();
    // Empty evidence -> the EXISTING model's insufficient_data state, verbatim.
    for (const item of result.data!.needsDecision) {
      expect(item.reviewStatus).toBe('insufficient_data');
      expect(item.decisionStatus).toBe('needed');
    }
    expect(options.fetchers.fetchCheckins).toHaveBeenCalledWith('client-13e');
    expect(options.fetchers.fetchReviews).toHaveBeenCalledWith('client-13e');
  });

  it('marks resolved only clients with a decision for the CURRENT date', async () => {
    const options = {
      ...baseOptions(),
      fetchDecisions: vi
        .fn()
        .mockResolvedValue({ data: new Map([['client-13e', 'accepted']]), error: null }),
    };
    const result = await fetchReviewQueue(
      [CLIENT, { ...CLIENT, id: 'client-2', firstName: 'Bob' }],
      options,
    );
    expect(result.error).toBeNull();
    expect(result.data!.resolved.map((i) => i.clientId)).toEqual(['client-13e']);
    expect(result.data!.resolved[0].decisionAction).toBe('accepted');
    expect(result.data!.needsDecision.map((i) => i.clientId)).toEqual(['client-2']);
  });

  it('propagates a decision-state read failure as a queue error', async () => {
    const options = {
      ...baseOptions(),
      fetchDecisions: vi.fn().mockResolvedValue({ data: null, error: 'decision state down' }),
    };
    const result = await fetchReviewQueue([CLIENT], options);
    expect(result.data).toBeNull();
    expect(result.error).toBe('decision state down');
  });

  it('propagates an evidence read failure without fabricating entries', async () => {
    const options = {
      ...baseOptions(),
      fetchers: {
        fetchCheckins: vi.fn().mockResolvedValue({ checkins: [], error: 'checkins down' }),
        fetchReviews: vi.fn().mockResolvedValue({ reviews: [], error: null }),
      },
    };
    const result = await fetchReviewQueue([CLIENT], options);
    expect(result.data).toBeNull();
    expect(result.error).toContain('check-in history');
  });
});
