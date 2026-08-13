/**
 * Pure, deterministic client-progress selector for training plans.
 *
 * Progress is DERIVED from the authoritative prescription (`training_plans.plan_data`)
 * plus the execution history (`session_logs`). It never mutates the prescription,
 * never touches a progress table, and never relies on cached progression bookkeeping.
 *
 * Business rules:
 * - Prescription order = `plan.weeks` flattened (never hardcoded).
 * - Scoped to the exact persisted `plan_id` — logs from other/previous plans are
 *   ignored, so a new active plan starts progressing independently.
 * - Failed sessions (chosen rule, Option A): ANY log row for the session advances it.
 * - Duplicate logs are deduped by `sessionId` — a double-log never skips ahead.
 * - Option B scheduling: the ACTIVE/loggable session is the first not-yet-logged
 *   session whose scheduled date is `<= today`. `nextSession` may be in the future
 *   (locked) until its scheduled day arrives.
 * - No `startDate` anchor => every session is treated as due (sequence-only, fully
 *   backwards compatible).
 */
import type { TrainingPlan, WorkoutSession, SessionLog } from '@/types';
import { addDays, toISODate } from './trainingSchedule';

export interface ClientProgress {
  /** The session the client should log right now (due and not yet logged), if any. */
  activeSession: WorkoutSession | null;
  /** Week number of the active (or, when locked, next) session. */
  currentWeek: number;
  /** The next unlogged session in prescription order (may be future/locked). */
  nextSession: WorkoutSession | null;
  /** ISO date (YYYY-MM-DD) of `nextSession`, when a scheduling anchor exists. */
  nextSessionDate: string | null;
  /** Whether `nextSession` is currently due/loggable. */
  nextSessionDue: boolean;
  completedSessions: WorkoutSession[];
  completedCount: number;
  isComplete: boolean;
}

/**
 * Scheduled ISO date of a session given the plan's coach-owned `startDate` anchor.
 * Week 1 / Day 1 maps to `startDate`; every subsequent prescribed day offsets by
 * one. Returns null when the plan carries no scheduling anchor.
 */
export function getSessionDate(plan: TrainingPlan, session: WorkoutSession): string | null {
  if (!plan.startDate) return null;
  const offset = (session.weekNumber - 1) * 7 + (session.dayNumber - 1);
  return toISODate(addDays(plan.startDate, offset));
}

export function selectClientProgress(
  plan: TrainingPlan,
  sessionLogs: SessionLog[],
  today: Date = new Date(),
): ClientProgress {
  const ordered: WorkoutSession[] = plan.weeks.flatMap(week => week.sessions);
  const todayIso = toISODate(today);

  // Scope to the current plan and dedup by sessionId (any log advances — Option A).
  const doneIds = new Set<string>();
  for (const log of sessionLogs) {
    if (log.planId === plan.id && log.sessionId) {
      doneIds.add(log.sessionId);
    }
  }

  const isDue = (session: WorkoutSession): boolean => {
    const date = getSessionDate(plan, session);
    if (date === null) return true; // no anchor => always due (sequence-only)
    return date <= todayIso; // ISO strings compare lexicographically
  };

  const completedSessions = ordered.filter(session => doneIds.has(session.id));
  const completedCount = completedSessions.length;
  const isComplete = ordered.length > 0 && completedCount === ordered.length;

  const firstUnlogged = ordered.find(session => !doneIds.has(session.id)) ?? null;

  // Option B: active = first not-logged session that is currently due.
  const activeSession = plan.startDate
    ? ordered.find(session => !doneIds.has(session.id) && isDue(session)) ?? null
    : firstUnlogged;

  // nextSession = the upcoming session the client will perform next. When a
  // session is currently active, that is the next not-logged session AFTER it
  // (so the sidebar shows W1/S2 while logging W1/S1). When nothing is active
  // (locked/future, or plan not started), it is the first unlogged session.
  let nextSession: WorkoutSession | null = null;
  if (activeSession) {
    const activeIdx = ordered.findIndex(session => session.id === activeSession.id);
    nextSession = ordered.slice(activeIdx + 1).find(session => !doneIds.has(session.id)) ?? null;
  } else {
    nextSession = firstUnlogged;
  }

  const nextSessionDate = nextSession ? getSessionDate(plan, nextSession) : null;

  const currentWeek = activeSession
    ? activeSession.weekNumber
    : nextSession
      ? nextSession.weekNumber
      : plan.duration;

  return {
    activeSession,
    currentWeek,
    nextSession,
    nextSessionDate,
    nextSessionDue: nextSession ? isDue(nextSession) : false,
    completedSessions,
    completedCount,
    isComplete,
  };
}
