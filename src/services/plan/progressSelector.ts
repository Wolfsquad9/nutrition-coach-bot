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
import type { TrainingPlan, WorkoutSession, SessionLog, WorkoutExercise } from '@/types';
import { addDays, toISODate } from './trainingSchedule';

/**
 * --- RPE-driven prescription adaptation -----------------------------------
 * The plan is the immutable coach-owned prescription; session_logs are the
 * immutable execution record. RPE adaptation is DERIVED each render from those
 * two inputs and never mutates either. It therefore lives alongside the
 * progress selector and keeps a single authoritative progression path:
 *
 *     training_plans.plan_data + session_logs
 *         → progressSelector / adaptSessionPrescription
 *         → current session + next available prescription
 *
 * Rule set (deterministic, units-aware, conservative-by-default):
 *   - Easy       (actual RPE meaningfully below target): progress load up.
 *   - At target  (within +/-0.5 of the target midpoint): hold (no aggressive
 *                 increase even when reps were achieved).
 *   - Hard        (actual RPE above target, 8-9-ish): hold.
 *   - Very hard   (actual RPE >= 9): hold — no aggressive increase.
 *   - Failure     (marked failed): reduce load by one increment.
 * ---------------------------------------------------------------------------
 */

const DEFAULT_INCREMENT = 2.5;

const incrementFor = (loadUnit: WorkoutExercise['loadUnit'] | undefined): number => {
  if (loadUnit === 'bodyweight') return 1;
  if (loadUnit === 'machine' || loadUnit === 'cable') return 5;
  return DEFAULT_INCREMENT;
};

/**
 * Parse a target-RPE string ("RPE 7-8", "7-8", "7.5", "RPE 8") into its numeric
 * midpoint. Falls back to 7.5 (a safe autoregulation midpoint) when unparseable.
 */
export function parseTargetRPE(targetRPE: string | undefined): number {
  if (!targetRPE) return 7.5;
  const nums = (targetRPE.match(/\d+(?:\.\d+)?/g) ?? []).map(n => Number(n));
  if (nums.length === 0) return 7.5;
  const sum = nums.reduce((a, b) => a + b, 0);
  return sum / nums.length;
}

const roundTo = (load: number, increment: number): number => {
  const r = Math.round(load / increment) * increment;
  return Math.round(r * 100) / 100;
};

/** Adapt a single exercise's target load from its prior execution + RPE. */
export function adaptExerciseLoad(
  currentLoad: number,
  targetRPE: string | undefined,
  actualRPE: number | null,
  failed: boolean,
  loadUnit: WorkoutExercise['loadUnit'] | undefined,
): number {
  const increment = incrementFor(loadUnit);
  const minLoad = loadUnit === 'bodyweight' ? 0 : increment;

  if (failed) {
    return roundTo(Math.max(minLoad, currentLoad - increment), increment);
  }
  if (actualRPE === null || actualRPE === undefined) {
    return currentLoad; // no execution signal yet → keep coach prescription
  }
  // Very hard / extreme effort → hold; no aggressive progression.
  if (actualRPE >= 9) return currentLoad;

  const target = parseTargetRPE(targetRPE);
  const undershoot = target - actualRPE; // positive = session was easier than target

  // Easier than target RPE with reps achieved → progress load.
  if (undershoot >= 1) {
    return roundTo(currentLoad + increment, increment);
  }
  if (undershoot >= 0.5) {
    return roundTo(currentLoad + increment, increment);
  }
  // At/above target RPE → conservative hold.
  return currentLoad;
}

/**
 * Return a NEW session whose per-exercise targetLoad (and targetRPE/context)
 * reflect the client's most recent actual RPE for that exercise within the
 * plan. Pure and deterministic — never mutates the plan or logs. The passed
 * plan/session stay untouched.
 */
export function adaptSessionPrescription(
  plan: TrainingPlan,
  sessionLogs: SessionLog[],
  session: WorkoutSession,
): WorkoutSession {
  if (!session || !Array.isArray(session.exercises) || session.exercises.length === 0) {
    return session;
  }

  // Most recent execution per exercise in this plan, keyed by exercise id.
  const latestByExercise = new Map<string, { load: number; rpe: number; failed: boolean }>();
  const planLogs = sessionLogs
    .filter(l => l.planId === plan.id)
    .sort((a, b) => (a.loggedAt > b.loggedAt ? 1 : a.loggedAt < b.loggedAt ? -1 : 0));

  for (const log of planLogs) {
    for (const ex of log.exercises ?? []) {
      if (typeof ex.rpe !== 'number' || !Number.isFinite(ex.rpe)) continue;
      if (latestByExercise.has(ex.exerciseId)) continue; // keep earliest → stay within window
      latestByExercise.set(ex.exerciseId, {
        load: ex.load,
        rpe: ex.rpe,
        failed: ex.failed === true,
      });
    }
  }

  if (latestByExercise.size === 0) {
    return session;
  }

  const adaptedExercises = session.exercises.map(ex => {
    const prior = latestByExercise.get(ex.exercise.id);
    if (!prior) return ex;
    const baseLoad = typeof ex.targetLoad === 'number' ? ex.targetLoad : prior.load;
    const newLoad = adaptExerciseLoad(
      baseLoad,
      ex.targetRPE,
      prior.rpe,
      prior.failed,
      ex.loadUnit,
    );
    if (newLoad === ex.targetLoad) return ex;
    return {
      ...ex,
      targetLoad: newLoad,
      progressionHint:
        `Previous ${ex.exercise.name} RPE ${prior.rpe}. Adjusted prescription: ${newLoad} ${ex.loadUnit ?? 'kg'}.`,
    };
  });

  return { ...session, exercises: adaptedExercises };
}

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

  // Reflect the client's prior execution/RPE in the prescription the client is
  // about to do (active) and the next one (preview). Adaptation is derived
  // from plan_data + session_logs and never mutates either. Week/day/ids are
  // unchanged, so gating fields (nextSessionDate / nextSessionDue) still apply.
  const adaptedActive = activeSession
    ? adaptSessionPrescription(plan, sessionLogs, activeSession)
    : null;
  const adaptedNext = nextSession
    ? adaptSessionPrescription(plan, sessionLogs, nextSession)
    : null;

  return {
    activeSession: adaptedActive,
    currentWeek,
    nextSession: adaptedNext,
    nextSessionDate,
    nextSessionDue: nextSession ? isDue(nextSession) : false,
    completedSessions,
    completedCount,
    isComplete,
  };
}
