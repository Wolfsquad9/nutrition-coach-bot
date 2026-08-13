/**
 * Supabase Session Log Service
 *
 * Persists workout session EXECUTION data to the `session_logs` table —
 * independently from the `training_plans` prescription. Logging a session
 * never rewrites or mutates the training plan: the plan is the immutable
 * prescription (sets/reps/targets), and execution data (load, RPE,
 * completion/failure, notes) lives in its own table.
 *
 * Schema (`session_logs`):
 *   id                  uuid pk
 *   client_id           uuid fk -> clients.id
 *   plan_id             uuid fk -> training_plans.id (nullable)
 *   session_id          text        (the workout session id from the plan)
 *   session_name        text
 *   week_number         int
 *   session_index       int
 *   completed           boolean
 *   failed_to_complete  boolean
 *   notes               text
 *   execution_data      jsonb       (array of ExerciseExecution)
 *   created_by          uuid
 *   logged_at           timestamptz
 */
import { supabase } from '@/integrations/supabase/client';
import { getCurrentUserId } from '@/hooks/useAuth';
import type { Json } from '@/integrations/supabase/types';
import type { ExerciseExecution, SessionLog } from '@/types';

const TABLE = 'session_logs';

const getErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

/** Serialize an execution-data array into a JSON value for the DB. */
const serializeExecutions = (executions: ExerciseExecution[]): unknown =>
  JSON.parse(JSON.stringify(executions ?? []));

/**
 * Persist a single session log. The insert is authorized and atomic via the
 * `save_session_log` SECURITY DEFINER RPC (mirrors save_training_plan's client
 * authorization). Column names in the RPC args are snake_case.
 */
export async function saveSessionLog(
  clientId: string,
  log: Omit<SessionLog, 'clientId'>,
): Promise<{ success: boolean; error: string | null; sessionLogId: string | null }> {
  try {
    if (!clientId) {
      return { success: false, error: 'clientId is required', sessionLogId: null };
    }
    if (!log || !log.sessionId) {
      return { success: false, error: 'sessionId is required', sessionLogId: null };
    }

    const userId = await getCurrentUserId();
    if (!userId) {
      return { success: false, error: 'Not authenticated. Please refresh the page.', sessionLogId: null };
    }

    const { data, error } = await supabase.rpc(
      'save_session_log' as never,
      {
        p_client_id: clientId,
        p_plan_id: log.planId ?? null,
        p_session_id: log.sessionId,
        p_session_name: log.sessionName ?? null,
        p_week_number: log.weekNumber,
        p_session_index: log.sessionIndex,
        p_completed: log.completed,
        p_failed_to_complete: log.failedToComplete,
        p_notes: log.notes ?? null,
        p_execution_data: serializeExecutions(log.exercises) as Json,
        p_logged_at: log.loggedAt,
      } as never,
    );

    if (error) {
      console.error('[saveSessionLog] insert failed:', error);
      return { success: false, error: getErrorMessage(error, 'Failed to save session log'), sessionLogId: null };
    }

    const result = data as unknown as
      | { success?: boolean; session_log_id?: string | null; error?: string | null }
      | Array<{ success?: boolean; session_log_id?: string | null; error?: string | null }>
      | null;
    const row = Array.isArray(result) ? result[0] : result;

    if (!row || !row.success) {
      return { success: false, error: row?.error || 'Failed to save session log', sessionLogId: null };
    }

    return { success: true, error: null, sessionLogId: (row.session_log_id as string | undefined) ?? null };
  } catch (err: unknown) {
    console.error('[saveSessionLog] unexpected error:', err);
    return { success: false, error: getErrorMessage(err, 'Failed to save session log'), sessionLogId: null };
  }
}

type SessionLogRow = {
  id: string;
  client_id: string;
  plan_id: string | null;
  session_id: string;
  session_name: string | null;
  week_number: number;
  session_index: number;
  completed: boolean;
  failed_to_complete: boolean;
  notes: string | null;
  execution_data: ExerciseExecution[];
  logged_at: string;
};

/** Map a raw DB row to the SessionLog domain shape. */
const mapRow = (row: SessionLogRow): SessionLog => ({
  id: row.id,
  clientId: row.client_id,
  planId: row.plan_id,
  sessionId: row.session_id,
  sessionName: row.session_name ?? undefined,
  weekNumber: row.week_number,
  sessionIndex: row.session_index,
  completed: row.completed,
  failedToComplete: row.failed_to_complete,
  notes: row.notes ?? undefined,
  exercises: row.execution_data ?? [],
  loggedAt: row.logged_at,
});

/**
 * Fetch the most recent session logs for a client (newest first). Returns an
 * empty array when there are none. Requires the session_logs SELECT RLS
 * policy, which mirrors the training_plans authorization.
 */
export async function fetchSessionLogs(
  clientId: string,
): Promise<{ logs: SessionLog[]; error: string | null }> {
  try {
    if (!clientId) {
      return { logs: [], error: 'clientId is required' };
    }

    const { data, error } = await supabase
      .from(TABLE as never)
      .select('*')
      .eq('client_id', clientId)
      .order('logged_at', { ascending: false })
      // Keep enough history that plan-scoped progress is never truncated even
      // across many coach regenerations (a plan holds at most 8wk x 6 = 48
      // sessions; old-plan logs are filtered out by plan_id in the selector).
      .limit(250);

    if (error) {
      console.error('[fetchSessionLogs] select failed:', error);
      return { logs: [], error: getErrorMessage(error, 'Failed to load session logs') };
    }

    const rows = (data ?? []) as unknown as SessionLogRow[];
    return { logs: rows.map(mapRow), error: null };
  } catch (error: unknown) {
    console.error('[fetchSessionLogs] unexpected error:', error);
    return { logs: [], error: getErrorMessage(error, 'Failed to load session logs') };
  }
}
