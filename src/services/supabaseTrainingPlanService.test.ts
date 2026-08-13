import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// The service only talks to supabase via rpc/from; both are mocked here.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn(), from: vi.fn() },
}));

vi.mock('@/hooks/useAuth', () => ({
  getCurrentUserId: vi.fn(),
}));

import { supabase } from '@/integrations/supabase/client';
import { getCurrentUserId } from '@/hooks/useAuth';
import { saveTrainingPlan, fetchActiveTrainingPlan } from './supabaseTrainingPlanService';
import type { TrainingPlan } from '@/types';

const mockRpc = supabase.rpc as ReturnType<typeof vi.fn>;
const mockFrom = supabase.from as ReturnType<typeof vi.fn>;
const mockGetUserId = getCurrentUserId as ReturnType<typeof vi.fn>;

type PlanRow = {
  id: string;
  client_id: string;
  plan_data: Record<string, unknown>;
  weeks: number;
  status: string;
  created_at: string;
};

let store: PlanRow[] = [];
let rpcShouldFail = false;

const canonicalPlan = (id: string, name: string): TrainingPlan => ({
  id,
  clientId: 'client-1',
  name,
  objective: 'Build muscle',
  duration: 4,
  frequency: 4,
  split: 'upper_lower',
  phase: 'hypertrophy',
  phases: [{ key: 'foundation', name: 'Foundation', objective: 'base', startWeek: 1, endWeek: 4 }],
  weeks: [
    {
      weekNumber: 1,
      phase: 'foundation',
      objective: 'base',
      sessions: [
        {
          id: 's1',
          weekNumber: 1,
          dayNumber: 1,
          sessionType: 'upper',
          name: 'Upper Body • Week 1',
          duration: 60,
          notes: 'notes',
          exercises: [
            {
              exercise: {
                id: 'ex-1',
                name: 'Barbell Bench Press',
                category: 'chest',
                equipment: ['barbell'],
                difficulty: 'intermediate',
                primaryMuscles: ['chest', 'triceps'],
                secondaryMuscles: [],
                instructions: [],
              },
              sets: 4,
              reps: '8-10',
              rest: 90,
              targetRPE: 'RPE 7-8',
              targetLoad: 82.5,
              loadUnit: 'kg',
              progressionHint: 'Add 2.5kg when 10 reps are completed at RPE < 8',
            },
          ],
        },
      ],
    },
  ],
  workouts: [
    {
      id: 's1',
      weekNumber: 1,
      dayNumber: 1,
      sessionType: 'upper',
      name: 'Upper Body • Week 1',
      duration: 60,
      notes: 'notes',
      exercises: [],
    },
  ],
  progressionScheme: 'Autoregulated double progression',
  programDescription: 'desc',
  createdAt: '2026-01-01T00:00:00.000Z',
});

/**
 * Simulates the `save_training_plan` RPC semantics: a successful call is
 * atomic — the new plan becomes the only active plan; a failed call changes
 * nothing.
 */
function seedFromMock() {
  mockFrom.mockImplementation(() => {
    const query: { clientId?: string; status?: string; limit?: number } = {};
    const chain: Record<string, unknown> = {
      select: vi.fn(() => chain),
      eq: vi.fn((col: string, val: string) => {
        if (col === 'client_id') query.clientId = val;
        if (col === 'status') query.status = val;
        return chain;
      }),
      order: vi.fn(() => chain),
      limit: vi.fn((n: number) => {
        query.limit = n;
        return chain;
      }),
      maybeSingle: vi.fn(() => {
        let rows = [...store];
        if (query.clientId) rows = rows.filter(r => r.client_id === query.clientId);
        if (query.status) rows = rows.filter(r => r.status === query.status);
        rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        if (query.limit) rows = rows.slice(0, query.limit);
        const row = rows[0] ?? null;
        return Promise.resolve(row ? { data: row, error: null } : { data: null, error: null });
      }),
    };
    return chain;
  });
}

function seedRpcMock() {
  mockRpc.mockImplementation(async (
    _name: string,
    args: { p_client_id: string; p_plan_data: Record<string, unknown>; p_weeks: number },
  ) => {
    if (rpcShouldFail) {
      return { data: null, error: { message: 'duplicate key value violates unique constraint "training_plans_one_active_per_client"' } };
    }
    const id = `plan-${store.length + 1}`;
    store = store.filter(r => !(r.client_id === args.p_client_id && r.status === 'active'));
    store.push({
      id,
      client_id: args.p_client_id,
      plan_data: args.p_plan_data,
      weeks: args.p_weeks,
      status: 'active',
      created_at: new Date(Date.now() + store.length).toISOString(),
    });
    return { data: [{ success: true, plan_id: id, error: null }], error: null };
  });
  seedFromMock();
}

describe('saveTrainingPlan (atomic replacement)', () => {
  it('requires authentication', async () => {
    mockGetUserId.mockResolvedValue(null);
    const result = await saveTrainingPlan('client-1', canonicalPlan('plan-old', 'Old plan'));
    expect(result.success).toBe(false);
    expect(result.error).toContain('Not authenticated');
  });

  it('failed replacement preserves the previous active plan', async () => {
    pushPlan('plan-old', 'Old plan');

    rpcShouldFail = true;
    const result = await saveTrainingPlan('client-1', canonicalPlan('plan-new', 'New plan'));
    expect(result.success).toBe(false);

    // The previous active plan is still the active plan.
    const activeRows = store.filter(r => r.client_id === 'client-1' && r.status === 'active');
    expect(activeRows).toHaveLength(1);
    expect(activeRows[0].id).toBe('plan-old');

    const fetchResult = await fetchActiveTrainingPlan('client-1');
    expect(fetchResult.error).toBeNull();
    expect(fetchResult.plan?.id).toBe('plan-old');
    expect(fetchResult.plan?.name).toBe('Old plan');
  });

  it('successful replacement leaves exactly one active plan (the new one)', async () => {
    pushPlan('plan-old', 'Old plan');

    const result = await saveTrainingPlan('client-1', canonicalPlan('plan-new', 'New plan'));
    expect(result.success).toBe(true);
    expect(result.planId).not.toBeNull();

    const activeRows = store.filter(r => r.client_id === 'client-1' && r.status === 'active');
    expect(activeRows).toHaveLength(1);
    expect(activeRows[0].plan_data.name).toBe('New plan');

    // fetchActiveTrainingPlan now returns the persisted DB identity (the same
    // UUID the RPC returned as plan_id) — NOT the `plan-new` placement embedded
    // inside plan_data. This is what makes session logging's `p_plan_id` valid.
    const fetchResult = await fetchActiveTrainingPlan('client-1');
    expect(fetchResult.plan?.id).toBe(result.planId);
    expect(fetchResult.plan?.name).toBe('New plan');
  });

  it('regenerating replaces the previous plan each time', async () => {
    pushPlan('plan-v1', 'First plan');

    const first = await saveTrainingPlan('client-1', canonicalPlan('plan-v2', 'Second plan'));
    const second = await saveTrainingPlan('client-1', canonicalPlan('plan-v3', 'Third plan'));
    expect(first.success).toBe(true);
    expect(second.success).toBe(true);

    const activeRows = store.filter(r => r.client_id === 'client-1' && r.status === 'active');
    expect(activeRows).toHaveLength(1);
    expect(activeRows[0].plan_data.name).toBe('Third plan');
  });
});

describe('fetchActiveTrainingPlan', () => {
  it('preserves canonical plan information (loads, units, duration, progression, metadata)', async () => {
    pushPlan('plan-c1', 'Canonical plan');

    const { plan, error } = await fetchActiveTrainingPlan('client-1');
    expect(error).toBeNull();
    expect(plan?.id).toBe('plan-c1');
    expect(plan?.frequency).toBe(4);
    expect(plan?.duration).toBe(4);
    expect(plan?.progressionScheme).toContain('double progression');

    const session = plan?.weeks[0].sessions[0];
    expect(session?.duration).toBe(60);

    const exercise = session?.exercises[0];
    expect(exercise?.targetLoad).toBe(82.5);
    expect(exercise?.loadUnit).toBe('kg');
    expect(exercise?.progressionHint).toContain('2.5kg');
    expect(exercise?.exercise.primaryMuscles).toEqual(['chest', 'triceps']);
  });

  it('propagates the persisted training_plans.id UUID as plan.id, ignoring the plan_data placeholder', async () => {
    const dbUuid = 'a3f1d2c4-9e2b-4a6d-8c5f-0e7b9a1d3c5e';
    const placeholderId = `training-client-1-${Date.now()}`;
    store.push({
      id: dbUuid,
      client_id: 'client-1',
      plan_data: { ...canonicalPlan(placeholderId, 'Plan'), id: placeholderId } as unknown as Record<string, unknown>,
      weeks: 4,
      status: 'active',
      created_at: '2026-01-01T00:00:00.000Z',
    });

    const { plan, error } = await fetchActiveTrainingPlan('client-1');
    expect(error).toBeNull();

    // The authoritative identity is the DB UUID, NOT the fake placeholder
    // embedded in plan_data — this is what makes saveSessionLog's `p_plan_id`
    // a valid UUID instead of `training-<client>-<timestamp>`.
    expect(plan?.id).toBe(dbUuid);
    expect(plan?.id).not.toMatch(/^training-/);
  });
});

function pushPlan(id: string, name: string) {
  store.push({
    id,
    client_id: 'client-1',
    plan_data: { ...canonicalPlan(id, name) } as unknown as Record<string, unknown>,
    weeks: 4,
    status: 'active',
    created_at: `2026-01-0${id.length}T00:00:00.000Z`,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  store = [];
  rpcShouldFail = false;
  mockGetUserId.mockResolvedValue('coach-1');
  seedRpcMock();
});

afterEach(() => {
  vi.restoreAllMocks();
});