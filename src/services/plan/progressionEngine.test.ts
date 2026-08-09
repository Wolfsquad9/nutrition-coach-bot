import { describe, expect, it } from 'vitest';
import { generateDynamicTrainingPlan } from './workoutGenerator';
import { applySessionResult } from './progressionEngine';
import { sampleClient } from '@/data/sampleData';

const client = { ...sampleClient, trainingDaysPerWeek: 4, trainingExperience: 'intermediate' as const };
const plan = generateDynamicTrainingPlan(client);
const currentSession = plan.weeks[0].sessions[0];

const buildResult = (rpe: number, reps: number[]) => ({
  sessionId: currentSession.id,
  weekNumber: 1,
  sessionIndex: currentSession.dayNumber,
  completed: true,
  actualDuration: currentSession.duration,
  notes: 'test',
  exercises: currentSession.exercises.map(ex => ({
    exerciseId: ex.exercise.id,
    exerciseName: ex.exercise.name,
    actualLoad: ex.targetLoad ?? 0,
    actualReps: reps,
    actualSets: ex.sets,
    rpe,
    completed: true,
    notes: '',
    timestamp: new Date().toISOString(),
  })),
  timestamp: new Date().toISOString(),
});

describe('progressionEngine', () => {
  it('progresses load after an easy session', () => {
    const easyResult = buildResult(6, [10, 10, 10]);
    const updatedPlan = applySessionResult(plan, currentSession, easyResult);
    const updatedExercise = updatedPlan.weeks[0].sessions[0].exercises[0];
    expect(updatedExercise.targetLoad).toBeGreaterThanOrEqual(currentSession.exercises[0].targetLoad ?? 0);
  });

  it('holds or reduces load after an extremely hard session', () => {
    const hardResult = buildResult(9.5, [8, 7, 6]);
    const updatedPlan = applySessionResult(plan, currentSession, hardResult);
    const updatedExercise = updatedPlan.weeks[0].sessions[0].exercises[0];
    expect(updatedExercise.targetLoad).toBeLessThanOrEqual(currentSession.exercises[0].targetLoad ?? 0);
  });

  it('quantizes load to valid increments', () => {
    const exercise = currentSession.exercises[0];
    expect(Number.isFinite(exercise.targetLoad)).toBe(true);
    expect(Math.round((exercise.targetLoad ?? 0) * 10) % 25).toBe(0);
  });
});
