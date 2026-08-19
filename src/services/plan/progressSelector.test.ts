import { describe, expect, it } from 'vitest';
import { selectClientProgress, getSessionDate, adaptExerciseLoad, adaptSessionPrescription, parseTargetRPE } from './progressSelector';
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

// --- RPE-driven progression -------------------------------------------------

function makeExercisedSession(id: string, week: number, day: number, targetLoad: number, targetRPE = 'RPE 7-8'): WorkoutSession {
  return {
    id,
    weekNumber: week,
    dayNumber: day,
    sessionType: 'full_body',
    name: `Session ${id}`,
    duration: 60,
    exercises: [
      {
        exercise: {
          id: 'ex-bench',
          name: 'Barbell Bench Press',
          category: 'chest',
          equipment: ['barbell'],
          difficulty: 'intermediate',
          primaryMuscles: ['chest'],
          secondaryMuscles: [],
          instructions: [],
        },
        sets: 4,
        reps: '8-10',
        rest: 90,
        targetRPE,
        targetLoad,
        loadUnit: 'kg',
      },
    ],
  };
}

function makeExecLog(sessionId: string, rpe: number, load = 60, failed = false, planId = PLAN_ID): SessionLog {
  return {
    clientId: 'client-1',
    planId,
    sessionId,
    sessionName: sessionId,
    weekNumber: Number(sessionId[1]),
    sessionIndex: Number(sessionId[2]),
    completed: !failed,
    failedToComplete: failed,
    exercises: [
      { exerciseId: 'ex-bench', exerciseName: 'Bench', sets: 4, reps: '8-10', load, rpe, completed: !failed, failed },
    ],
    loggedAt: '2026-01-06T00:00:00.000Z',
  };
}

describe('parseTargetRPE', () => {
  it('parses a range and a single value to a numeric midpoint', () => {
    expect(parseTargetRPE('RPE 7-8')).toBe(7.5);
    expect(parseTargetRPE('7-8')).toBe(7.5);
    expect(parseTargetRPE('RPE 8')).toBe(8);
    expect(parseTargetRPE('8')).toBe(8);
  });
  it('falls back to a safe 7.5 midpoint when unparseable', () => {
    expect(parseTargetRPE(undefined)).toBe(7.5);
    expect(parseTargetRPE('autoregulated')).toBe(7.5);
  });
});

describe('adaptExerciseLoad (deterministic RPE progression)', () => {
  it('easy session (actual RPE 6, target 7-8) progresses load up', () => {
    expect(adaptExerciseLoad(60, 'RPE 7-8', 6, false, 'kg')).toBe(62.5);
  });

  it('hard-but-achieved session (actual RPE 8) holds — conservative', () => {
    expect(adaptExerciseLoad(60, 'RPE 7-8', 8, false, 'kg')).toBe(60);
  });

  it('very hard session (actual RPE 9 / 9.5) blocks aggressive progression', () => {
    expect(adaptExerciseLoad(60, 'RPE 7-8', 9, false, 'kg')).toBe(60);
    expect(adaptExerciseLoad(60, 'RPE 7-8', 9.5, false, 'kg')).toBe(60);
  });

  it('failed session reduces load by one increment', () => {
    expect(adaptExerciseLoad(60, 'RPE 7-8', 10, true, 'kg')).toBe(57.5);
  });

  it('no execution signal yet keeps the coach prescription', () => {
    expect(adaptExerciseLoad(60, 'RPE 7-8', null, false, 'kg')).toBe(60);
  });

  it('is units-aware (bodyweight increments by one, machine by five)', () => {
    expect(adaptExerciseLoad(60, 'RPE 7-8', 6, false, 'bodyweight')).toBe(61);
    expect(adaptExerciseLoad(60, 'RPE 7-8', 6, false, 'machine')).toBe(65);
  });
});

describe('adaptSessionPrescription (next prescription reflects prior RPE)', () => {
  it('easy prior session lifts the next session target load', () => {
    const session = makeExercisedSession('s12', 1, 2, 60);
    const plan = { ...makePlan(), weeks: [{ weekNumber: 1, phase: 'foundation', objective: 'base', sessions: [makeSession('s11', 1, 1), session] }] };
    const adapted = adaptSessionPrescription(plan, [makeExecLog('s11', 6)], session);
    expect(adapted.exercises[0].targetLoad).toBe(62.5);
  });

  it('hard prior session holds the next session target load', () => {
    const session = makeExercisedSession('s12', 1, 2, 60);
    const plan = { ...makePlan(), weeks: [{ weekNumber: 1, phase: 'foundation', objective: 'base', sessions: [makeSession('s11', 1, 1), session] }] };
    const adapted = adaptSessionPrescription(plan, [makeExecLog('s11', 8)], session);
    expect(adapted.exercises[0].targetLoad).toBe(60);
  });

  it('immutability: the plan prescription is never mutated', () => {
    const session = makeExercisedSession('s12', 1, 2, 60);
    const plan = { ...makePlan(), weeks: [{ weekNumber: 1, phase: 'foundation', objective: 'base', sessions: [makeSession('s11', 1, 1), session] }] };
    adaptSessionPrescription(plan, [makeExecLog('s11', 6)], session);
    expect(session.exercises[0].targetLoad).toBe(60);
    expect(plan.weeks[0].sessions[1].exercises[0].targetLoad).toBe(60);
  });

  it('selectClientProgress exposes an adapted ACTIVE session after an easy prior session', () => {
    const s1 = makeSession('s11', 1, 1);
    const s2 = makeExercisedSession('s12', 1, 2, 60);
    const plan = { ...makePlan(), weeks: [{ weekNumber: 1, phase: 'foundation', objective: 'base', sessions: [s1, s2] }] };
    const p = selectClientProgress(plan, [makeExecLog('s11', 6)], day('2026-01-06'));
    expect(p.activeSession?.id).toBe('s12');
    expect(p.activeSession?.exercises[0].targetLoad).toBe(62.5);
  });
});

describe('progression integration (session_logs drive the next earned prescription)', () => {
  const twoSessionPlan = (): TrainingPlan => {
    const s1 = makeExercisedSession('s11', 1, 1, 60); // bench, target 60 kg, RPE 7-8
    const s2 = makeExercisedSession('s12', 1, 2, 60);
    return { ...makePlan(), weeks: [{ weekNumber: 1, phase: 'foundation', objective: 'base', sessions: [s1, s2] }] };
  };

  it('low actual RPE → the next earned session prescribes a HIGHER load', () => {
    const p = selectClientProgress(twoSessionPlan(), [makeExecLog('s11', 6)], day('2026-01-06'));
    expect(p.activeSession?.id).toBe('s12');
    expect(p.activeSession?.exercises[0].targetLoad).toBe(62.5);
  });

  it('target/high actual RPE → the next earned session holds the load', () => {
    const p = selectClientProgress(twoSessionPlan(), [makeExecLog('s11', 8)], day('2026-01-06'));
    expect(p.activeSession?.exercises[0].targetLoad).toBe(60);
  });

  it('very high RPE → no aggressive increase; failure → load reduces', () => {
    const veryHard = selectClientProgress(twoSessionPlan(), [makeExecLog('s11', 9.5)], day('2026-01-06'));
    expect(veryHard.activeSession?.exercises[0].targetLoad).toBe(60);

    const failed = selectClientProgress(twoSessionPlan(), [makeExecLog('s11', 10, 60, true)], day('2026-01-06'));
    expect(failed.activeSession?.exercises[0].targetLoad).toBe(57.5);
  });

  it('derivation is purely derived — the persisted plan object is never mutated', () => {
    const plan = twoSessionPlan();
    const frozen = JSON.stringify(plan);
    selectClientProgress(plan, [makeExecLog('s11', 6)], day('2026-01-06'));
    selectClientProgress(plan, [makeExecLog('s11', 10, 60, true)], day('2026-01-06'));
    selectClientProgress(plan, [], day('2026-01-05'));
    expect(JSON.stringify(plan)).toBe(frozen);
  });
});

