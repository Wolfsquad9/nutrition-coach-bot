import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn(), from: vi.fn() },
}));

vi.mock('@/hooks/useAuth', () => ({
  getCurrentUserId: vi.fn(),
}));

import { supabase } from '@/integrations/supabase/client';
import { getCurrentUserId } from '@/hooks/useAuth';
import { saveSessionLog, fetchSessionLogs, validateSessionLog } from './supabaseSessionLogService';
import type { SessionLog, ExerciseExecution } from '@/types';

const mockRpc = supabase.rpc as ReturnType<typeof vi.fn>;
const mockFrom = supabase.from as ReturnType<typeof vi.fn>;
const mockGetUserId = getCurrentUserId as ReturnType<typeof vi.fn>;

const baseLog = (): Omit<SessionLog, 'clientId'> => ({
  planId: 'plan-1',
  sessionId: 's1',
  sessionName: 'Upper Body • Week 1',
  weekNumber: 1,
  sessionIndex: 1,
  completed: true,
  failedToComplete: false,
  exercises: [
    {
      exerciseId: 'ex-1',
      exerciseName: 'Barbell Bench Press',
      sets: 4,
      reps: '8-10',
      load: 62.5,
      rpe: 8,
      completed: true,
      failed: false,
    },
  ],
  loggedAt: '2026-01-02T00:00:00.000Z',
});

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUserId.mockResolvedValue('coach-1');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('saveSessionLog', () => {
  it('requires authentication', async () => {
    mockGetUserId.mockResolvedValue(null);
    const result = await saveSessionLog('client-1', baseLog());
    expect(result.success).toBe(false);
    expect(result.error).toContain('Not authenticated');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('calls the save_session_log RPC with snake_case args and returns the log id', async () => {
    const args = {
      p_client_id: 'client-1',
      p_plan_id: 'plan-1',
      p_session_id: 's1',
      p_session_name: 'Upper Body • Week 1',
      p_week_number: 1,
      p_session_index: 1,
      p_completed: true,
      p_failed_to_complete: false,
      p_notes: null,
      p_execution_data: [
        {
          exerciseId: 'ex-1',
          exerciseName: 'Barbell Bench Press',
          sets: 4,
          reps: '8-10',
          load: 62.5,
          rpe: 8,
          completed: true,
          failed: false,
        },
      ],
      p_logged_at: '2026-01-02T00:00:00.000Z',
    };
    mockRpc.mockResolvedValue({ data: [{ success: true, session_log_id: 'log-1', error: null }], error: null });

    const result = await saveSessionLog('client-1', baseLog());

    expect(result.success).toBe(true);
    expect(result.sessionLogId).toBe('log-1');
    expect(mockRpc).toHaveBeenCalledWith('save_session_log', args);
  });

  it('propagates an RPC failure as an unsuccessful result', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('boom') });
    const result = await saveSessionLog('client-1', baseLog());
    expect(result.success).toBe(false);
    expect(result.error).toContain('boom');
  });

  it('forwards the persisted DB plan UUID verbatim as p_plan_id (never a generated placeholder)', async () => {
    const persistedUuid = 'a3f1d2c4-9e2b-4a6d-8c5f-0e7b9a1d3c5e';
    mockRpc.mockResolvedValue({ data: [{ success: true, session_log_id: 'log-1', error: null }], error: null });

    const result = await saveSessionLog('client-1', { ...baseLog(), planId: persistedUuid });

    expect(result.success).toBe(true);
    const args = mockRpc.mock.calls[0][1] as { p_plan_id: string | null };
    expect(args.p_plan_id).toBe(persistedUuid);
    expect(args.p_plan_id).not.toMatch(/^training-/);
  });

  it('forwards clientId verbatim and never sends a spoofable creator/identity field', async () => {
    // Identity/authorization is owned by the SECURITY DEFINER RPC (auth.uid()).
    // The payload must never carry a created_by/coach field the caller could
    // use to impersonate a client — this is what makes the client-only INSERT
    // RPC effective even if a coach UI called the service.
    mockGetUserId.mockResolvedValue('the-client-user');
    mockRpc.mockResolvedValue({ data: [{ success: true, session_log_id: 'log-1', error: null }], error: null });

    const result = await saveSessionLog('client-1', baseLog());

    expect(result.success).toBe(true);
        const args = mockRpc.mock.calls[0][1] as Record<string, unknown>;
    expect(args.p_client_id).toBe('client-1');
    expect(args.p_created_by).toBeUndefined();
    expect(args.p_creator_id).toBeUndefined();
    // The only identity the DB can see is the authenticated user's, derived
    // by the RPC from auth.uid(), never from the request payload.
  });

  it('execution payload carries only execution fields — never prescription fields', async () => {
    // A logged session records ACTUAL performance (load/rpe/failed), never the
    // prescribed targetLoad/targetRPE/loadUnit. This is the invariant that keeps
    // `training_plans.plan_data` (the immutable coach prescription) untouched by
    // the client execution path: there is no code path that writes prescription
    // fields back into a plan when a client logs a session.
    mockRpc.mockResolvedValue({ data: [{ success: true, session_log_id: 'log-1', error: null }], error: null });

    await saveSessionLog('client-1', baseLog());

    const args = mockRpc.mock.calls[0][1] as { p_execution_data: unknown };
    const executions = args.p_execution_data as ExerciseExecution[];
    expect(executions).toHaveLength(1);
    const ex = executions[0];
    // Actual execution fields are present...
    expect(ex).toHaveProperty('load', 62.5);
    expect(ex).toHaveProperty('rpe', 8);
    expect(ex).toHaveProperty('failed', false);
    // ...and NO prescription fields leak into the write payload.
    expect(ex).not.toHaveProperty('targetLoad');
    expect(ex).not.toHaveProperty('targetRPE');
    expect(ex).not.toHaveProperty('loadUnit');
  });
});

describe('validateSessionLog (empty / incomplete prevention)', () => {
  it('accepts a fully completed session with valid load and RPE', () => {
    expect(validateSessionLog('client-1', baseLog()).ok).toBe(true);
  });

  it('rejects an empty session (no exercise execution)', () => {
    const r = validateSessionLog('client-1', { ...baseLog(), exercises: [] });
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.error).toContain('no exercise execution');
  });

  it('rejects a completed session with an invalid RPE', () => {
    const r = validateSessionLog('client-1', { ...baseLog(), exercises: [{ ...baseLog().exercises[0], rpe: 11 }] });
    expect(r.ok).toBe(false);
  });

  it('rejects a completed session with an invalid (negative) load', () => {
    const r = validateSessionLog('client-1', { ...baseLog(), exercises: [{ ...baseLog().exercises[0], load: -5 }] });
    expect(r.ok).toBe(false);
  });

  it('rejects a payload with a missing planId', () => {
    const r = validateSessionLog('client-1', { ...baseLog(), planId: null });
    expect(r.ok).toBe(false);
  });

  it('a fully-failed session is accepted as long as execution is non-empty', () => {
    // Failed sessions still record what happened; they must not be empty.
    const r = validateSessionLog('client-1', {
      ...baseLog(),
      completed: false,
      failedToComplete: true,
      exercises: [{ ...baseLog().exercises[0], rpe: 10, load: 60, failed: true, completed: false }],
    });
    expect(r.ok).toBe(true);
  });
});

describe('fetchSessionLogs', () => {
  it('maps rows to the SessionLog domain shape (newest-first ordering is server side)', async () => {
    const selectChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: [
          {
            id: 'log-1',
            client_id: 'client-1',
            plan_id: 'plan-1',
            session_id: 's1',
            session_name: 'Upper Body • Week 1',
            week_number: 1,
            session_index: 1,
            completed: true,
            failed_to_complete: false,
            notes: null,
            execution_data: [
              {
                exerciseId: 'ex-1',
                exerciseName: 'Barbell Bench Press',
                sets: 4,
                reps: '8-10',
                load: 62.5,
                rpe: 8,
                completed: true,
                failed: false,
              },
            ],
            logged_at: '2026-01-02T00:00:00.000Z',
          },
        ],
        error: null,
      }),
    };
    mockFrom.mockReturnValue(selectChain);

    const { logs, error } = await fetchSessionLogs('client-1');

    expect(error).toBeNull();
    expect(logs).toHaveLength(1);
    const log = logs[0];
    expect(log.id).toBe('log-1');
    expect(log.clientId).toBe('client-1');
    expect(log.planId).toBe('plan-1');
    expect(log.sessionId).toBe('s1');
    expect(log.failedToComplete).toBe(false);
    expect(log.exercises[0].sets).toBe(4);
    expect(log.exercises[0].reps).toBe('8-10');
    expect(mockFrom).toHaveBeenCalledWith('session_logs');
  });

  it('returns an empty-list error state when the query fails', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: null, error: new Error('RLS denied') }),
    });

    const { logs, error } = await fetchSessionLogs('client-1');
    expect(logs).toEqual([]);
    expect(error).toContain('RLS denied');
  });
});
