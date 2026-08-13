import { describe, expect, it } from 'vitest';
import { selectClientProgress, getSessionDate } from './progressSelector';
import type { TrainingPlan, WorkoutSession, SessionLog } from '@/types';

const PLAN_ID = 'a3f1d2c4-9e2b-4a6d-8c5f-0e7b9a1d3c5e';
const OLD_PLAN_ID = '00000000-0000-0000-0000-000000000000';

const START_DATE = '2026-01-05'; // a Monday — Week 1 / Day 1 anchor

function makeSession(id: string, weekNumber: number, dayNumber: number): WorkoutSession {
  return {
    id,
    weekNumber,
    dayNumber,
    sessionType: 'full_body',
    name: `Session ${id}`,
    duration: 60,
    exercises: [],
  };
}

function makePlan(): TrainingPlan {
  return {
    id: PLAN_ID,
    clientId: 'client-1',
    name: 'Plan',
    objective: 'obj',
    duration: 2,
    frequency: 2,
    split: 'full_body',
    phase: 'hypertrophy',
    phases: [{ key: 'foundation', name: 'Foundation', objective: 'base', startWeek: 1, endWeek: 2 }],
    weeks: [
      { weekNumber: 1, phase: 'foundation', objective: 'base', sessions: [makeSession('s11', 1, 1), makeSession('s12', 1, 2)] },
      { weekNumber: 2, phase: 'foundation', objective: 'base', sessions: [makeSession('s21', 2, 1), makeSession('s22', 2, 2)] },
    ],
    workouts: [],
    progressionScheme: 'double progression',
    programDescription: 'desc',
    startDate: START_DATE,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function makeLog(sessionId: string, completed = true, planId = PLAN_ID, overrides: Partial<SessionLog> = {}): SessionLog {
  return {
    clientId: 'client-1',
    planId,
    sessionId,
    sessionName: sessionId,
    weekNumber: Number(sessionId[1]),
    sessionIndex: Number(sessionId[2]),
    completed,
    failedToComplete: !completed,
    exercises: [],
    loggedAt: '2026-01-06T00:00:00.000Z',
    ...overrides,
  };
}

const day = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

describe('selectClientProgress (sequence + Option B scheduling)', () => {
  it('new plan, no logs, today at/after start → active W1/S1, next W1/S2', () => {
    const p = selectClientProgress(makePlan(), [], day('2026-01-05'));
    expect(p.activeSession?.id).toBe('s11');
    expect(p.currentWeek).toBe(1);
    expect(p.nextSession?.id).toBe('s12');
    expect(p.completedCount).toBe(0);
    expect(p.isComplete).toBe(false);
  });

  it('one completed session logged → active W1/S2', () => {
    const p = selectClientProgress(makePlan(), [makeLog('s11')], day('2026-01-06'));
    expect(p.activeSession?.id).toBe('s12');
    expect(p.completedCount).toBe(1);
  });

  it('all W1 sessions logged → active W2/S1 (week transition)', () => {
    const p = selectClientProgress(makePlan(), [makeLog('s11'), makeLog('s12')], day('2026-01-12'));
    expect(p.activeSession?.id).toBe('s21');
    expect(p.currentWeek).toBe(2);
  });

  it('logs from a previous (old) plan NEVER affect the new plan', () => {
    const logs = [
      makeLog('s11', true, OLD_PLAN_ID),
      makeLog('s12', true, OLD_PLAN_ID),
      makeLog('s21', true, OLD_PLAN_ID),
    ];
    const p = selectClientProgress(makePlan(), logs, day('2026-01-12'));
    // Old-plan logs are plan-scoped out → the new plan starts fresh at W1/S1.
    expect(p.activeSession?.id).toBe('s11');
    expect(p.completedCount).toBe(0);
  });

  it('duplicate logs never skip multiple prescribed sessions', () => {
    const logs = [makeLog('s11'), makeLog('s11'), makeLog('s11')];
    const p = selectClientProgress(makePlan(), logs, day('2026-01-06'));
    expect(p.activeSession?.id).toBe('s12');
    expect(p.completedCount).toBe(1);
  });

  it('failed session (chosen rule: Option A) still advances the client', () => {
    // completed=false / failedToComplete=true still counts as done.
    const p = selectClientProgress(makePlan(), [makeLog('s11', false)], day('2026-01-06'));
    expect(p.activeSession?.id).toBe('s12');
    expect(p.completedCount).toBe(1);
  });

  it('full plan → isComplete, no active session', () => {
    const logs = ['s11', 's12', 's21', 's22'].map(id => makeLog(id));
    const p = selectClientProgress(makePlan(), logs, day('2026-01-20'));
    expect(p.isComplete).toBe(true);
    expect(p.activeSession).toBeNull();
    expect(p.nextSession).toBeNull();
    expect(p.completedCount).toBe(4);
  });

  it('is deterministic: repeated calls with the same inputs return identical results', () => {
    const plan = makePlan();
    const logs = [makeLog('s11'), makeLog('s12')];
    const a = selectClientProgress(plan, logs, day('2026-01-12'));
    const b = selectClientProgress(plan, logs, day('2026-01-12'));
    expect(b).toEqual(a);
  });

  it('a future scheduled session is NOT presented as today\u0027s active session', () => {
    // Today is before the plan even starts → nothing active, next locked (W1/S1).
    const p = selectClientProgress(makePlan(), [], day('2026-01-03'));
    expect(p.activeSession).toBeNull();
    expect(p.nextSession?.id).toBe('s11');
    expect(p.nextSessionDue).toBe(false);
    expect(p.nextSessionDate).toBe(START_DATE);
  });

  it('today\u0027s due session becomes active on its scheduled day', () => {
    // startDate (Mon) == today → W1/S1 active, and W1/S2 is the upcoming (locked) next.
    const onDay = selectClientProgress(makePlan(), [], day(START_DATE));
    expect(onDay.activeSession?.id).toBe('s11');
    expect(onDay.nextSession?.id).toBe('s12');
    expect(onDay.nextSessionDue).toBe(false); // W1/S2 is scheduled for tomorrow
    expect(onDay.nextSessionDate).toBe('2026-01-06');
    // On W1/S2 day (start+1) the second session is active.
    const nextDay = selectClientProgress(makePlan(), [makeLog('s11')], day('2026-01-06'));
    expect(nextDay.activeSession?.id).toBe('s12');
  });

  it('after a week is done, the next session is locked until its own scheduled date', () => {
    // W1 done; W2/S1 (s21) is anchored to Jan 12. Before that it is locked.
    const before = selectClientProgress(makePlan(), [makeLog('s11'), makeLog('s12')], day('2026-01-08'));
    expect(before.nextSession?.id).toBe('s21');
    expect(before.nextSessionDue).toBe(false);
    expect(before.activeSession).toBeNull();
    // On Jan 12 it becomes the active session.
    const onDay = selectClientProgress(makePlan(), [makeLog('s11'), makeLog('s12')], day('2026-01-12'));
    expect(onDay.activeSession?.id).toBe('s21');
  });

  it('no startDate anchor → sequence gating is off (all sessions due)', () => {
    const plan = makePlan();
    delete plan.startDate;
    const p = selectClientProgress(plan, [], day('2026-01-03'));
    // Without scheduling, the first unlogged session is always active.
    expect(p.activeSession?.id).toBe('s11');
    expect(p.nextSessionDue).toBe(true);
  });
});

describe('getSessionDate', () => {
  it('anchors W1/D1 to startDate and offsets each subsequent day', () => {
    const plan = makePlan();
    expect(getSessionDate(plan, makeSession('x', 1, 1))).toBe('2026-01-05');
    expect(getSessionDate(plan, makeSession('x', 1, 2))).toBe('2026-01-06');
    expect(getSessionDate(plan, makeSession('x', 2, 1))).toBe('2026-01-12');
    expect(getSessionDate(plan, makeSession('x', 2, 2))).toBe('2026-01-13');
  });

  it('returns null when the plan has no startDate', () => {
    const plan = makePlan();
    delete plan.startDate;
    expect(getSessionDate(plan, makeSession('x', 1, 1))).toBeNull();
  });
});

