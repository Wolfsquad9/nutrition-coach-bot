import { describe, expect, it } from 'vitest';
import { generateDynamicTrainingPlan, applyFirstSessionLoads } from './workoutGenerator';
import { sampleClient } from '@/data/sampleData';
import type { TrainingPlan, TrainingPlanInput, WorkoutExercise, Exercise } from '@/types';

/**
 * Build the complete generator input from the sample client. The generator
 * contract requires every training field; the sample client defines all of
 * them, so no defaults are invented.
 */
const makeInput = (overrides: Partial<TrainingPlanInput> = {}): TrainingPlanInput => ({
  id: sampleClient.id,
  primaryGoal: sampleClient.primaryGoal,
  trainingExperience: sampleClient.trainingExperience!,
  trainingDaysPerWeek: sampleClient.trainingDaysPerWeek!,
  sessionDuration: sampleClient.sessionDuration!,
  preferredTrainingStyle: sampleClient.preferredTrainingStyle!,
  equipment: sampleClient.equipment!,
  equipmentAvailable: sampleClient.equipmentAvailable,
  ...overrides,
});

describe('generateDynamicTrainingPlan', () => {
  it('generates a 4-week program for a 3-day fat-loss client', () => {
    const input = makeInput({
      primaryGoal: 'fat_loss',
      trainingDaysPerWeek: 3,
      trainingExperience: 'beginner',
    });
    const plan = generateDynamicTrainingPlan(input);

    expect(plan.duration).toBe(4);
    expect(plan.weeks).toHaveLength(4);
    expect(plan.frequency).toBe(3);
    expect(plan.weeks.every(week => week.sessions.length === 3)).toBe(true);
    expect(plan.objective).toContain('fat');
  });

  it('generates a 6-week program for a 4-day client', () => {
    const input = makeInput({
      trainingDaysPerWeek: 4,
      trainingExperience: 'intermediate',
    });
    const plan = generateDynamicTrainingPlan(input);

    expect(plan.duration).toBe(6);
    expect(plan.weeks).toHaveLength(6);
    expect(plan.frequency).toBe(4);
    expect(plan.weeks[0].sessions).toHaveLength(4);
  });

  it('generates an 8-week program for an advanced 6-day client', () => {
    const input = makeInput({
      trainingDaysPerWeek: 6,
      trainingExperience: 'advanced',
      primaryGoal: 'muscle_gain',
    });
    const plan = generateDynamicTrainingPlan(input);

    expect(plan.duration).toBe(8);
    expect(plan.weeks).toHaveLength(8);
    expect(plan.frequency).toBe(6);
    expect(plan.weeks[7].sessions.length).toBe(6);
    expect(plan.phase).toBe('hypertrophy');
  });

  it('uses the intended training inputs (frequency, session duration, goal)', () => {
    const input = makeInput({
      primaryGoal: 'recomposition',
      trainingDaysPerWeek: 5,
      sessionDuration: 75,
      preferredTrainingStyle: 'strength',
      trainingExperience: 'advanced',
      equipment: ['barbell', 'dumbbells'],
    });
    const plan = generateDynamicTrainingPlan(input);

    expect(plan.frequency).toBe(input.trainingDaysPerWeek);
    expect(plan.clientId).toBe(input.id);
    // Session duration chosen in the questionnaire flows into every session.
    expect(plan.workouts.every(w => w.duration === input.sessionDuration)).toBe(true);
    // The prescribed exercises are drawn from the client's equipment pool.
    plan.workouts[0].exercises.forEach(ex => {
      expect(ex.targetLoad).toBeGreaterThan(0);
      expect(ex.loadUnit).toBeDefined();
    });
  });

    describe('first-session per-exercise workload (coach-established baseline)', () => {
    // A hand-built first session with THREE distinct loaded exercises (each with
    // its OWN targetLoad) and ONE bodyweight exercise. This proves the coach
    // establishes a per-exercise baseline for the first session, never a single
    // global load.

    const exA: Exercise = { id: 'ex-a', name: 'Barbell Squat', category: 'legs', equipment: ['barbell'], difficulty: 'intermediate', primaryMuscles: ['quadriceps'], secondaryMuscles: [], instructions: [] };
    const exB: Exercise = { id: 'ex-b', name: 'Dumbbell Row', category: 'back', equipment: ['dumbbells'], difficulty: 'intermediate', primaryMuscles: ['lats'], secondaryMuscles: [], instructions: [] };
    const exC: Exercise = { id: 'ex-c', name: 'Machine Chest Press', category: 'chest', equipment: ['machines'], difficulty: 'intermediate', primaryMuscles: ['chest'], secondaryMuscles: [], instructions: [] };
    const exBW: Exercise = { id: 'ex-bw', name: 'Pull-ups', category: 'back', equipment: [], difficulty: 'beginner', primaryMuscles: ['lats'], secondaryMuscles: [], instructions: [] };

    const makeEx = (exercise: Exercise, targetLoad: number, loadUnit: 'kg' | 'lb' | 'bodyweight'): WorkoutExercise => ({
      exercise,
      sets: 3,
      reps: '8-10',
      rest: 90,
      intensity: 'RPE 7-8',
      tempo: '2-0-2-0',
      targetRPE: 'RPE 7-8',
      targetLoad,
      loadUnit,
            equipmentType: (loadUnit === 'bodyweight' ? 'bodyweight' : exercise.equipment[0] ?? 'barbell') as WorkoutExercise['equipmentType'],
      progressionHint: 'hint',
      progressionRule: 'rule',
      notes: 'notes',
    });

    const firstSession = () => ({
      id: 's1',
      weekNumber: 1,
      dayNumber: 1,
      sessionType: 'full_body' as const,
      name: 'Full Body • Week 1',
      duration: 45,
      exercises: [
        makeEx(exA, 40, 'kg'),
        makeEx(exB, 10, 'kg'),
        makeEx(exC, 30, 'kg'),
        makeEx(exBW, 0, 'bodyweight'),
      ],
      notes: '',
    });

    const singleSessionPlan = (): TrainingPlan => ({
      id: 'plan-1',
      clientId: 'c1',
      name: 'Plan',
      objective: 'obj',
      duration: 1,
      frequency: 1,
      split: 'full_body',
      phase: 'strength',
      phases: [{ key: 'foundation', name: 'Foundation', objective: 'o', startWeek: 1, endWeek: 1 }],
      weeks: [{ weekNumber: 1, phase: 'foundation', objective: 'o', sessions: [firstSession()] }],
      workouts: [],
      progressionScheme: 'double progression',
      programDescription: 'desc',
      startDate: '2026-01-01',
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    it('preserves each exercise OWN target load on the first session', () => {
      // Coach sets distinct loads for each loaded exercise.
      const edited = applyFirstSessionLoads(singleSessionPlan(), { 'ex-a': 55, 'ex-b': 12.5, 'ex-c': 42.5 });
      const s1 = edited.weeks[0].sessions[0];
      const loads = s1.exercises.map(e => e.targetLoad);
      // A=55 (not the default 40), B=12.5 (not 10), C=42.5 (not 30) — per-exercise.
      expect(s1.exercises[0].targetLoad).toBe(55);
      expect(s1.exercises[1].targetLoad).toBe(12.5);
      expect(s1.exercises[2].targetLoad).toBe(42.5);
      // No single global value applied to all exercises.
      expect(new Set(loads.filter((_, i) => s1.exercises[i].loadUnit !== 'bodyweight'))).toHaveLength(3);
    });

    it('keeps bodyweight exercises as bodyweight / 0 (never given a load)', () => {
      const edited = applyFirstSessionLoads(singleSessionPlan(), { 'ex-bw': 999 });
      const bw = edited.weeks[0].sessions[0].exercises[3];
      expect(bw.loadUnit).toBe('bodyweight');
      expect(bw.targetLoad).toBe(0);
    });

    it('keeps each loadUnit correct (kg for loaded, bodyweight for the BW exercise)', () => {
      const edited = applyFirstSessionLoads(singleSessionPlan(), { 'ex-a': 55, 'ex-b': 12.5, 'ex-c': 42.5 });
      const s1 = edited.weeks[0].sessions[0];
      expect(s1.exercises[0].loadUnit).toBe('kg');
      expect(s1.exercises[1].loadUnit).toBe('kg');
      expect(s1.exercises[2].loadUnit).toBe('kg');
      expect(s1.exercises[3].loadUnit).toBe('bodyweight');
    });

    it('only edits Week 1 / Day 1 — later sessions/weeks are untouched', () => {
      const plan: TrainingPlan = {
        ...singleSessionPlan(),
        weeks: [
          { weekNumber: 1, phase: 'foundation', objective: 'o', sessions: [
            { ...firstSession(), exercises: [makeEx(exA, 40, 'kg'), makeEx(exB, 10, 'kg'), makeEx(exC, 30, 'kg'), makeEx(exBW, 0, 'bodyweight')] },
            { ...firstSession(), id: 's2', name: 'Day 2', exercises: [makeEx(exA, 40, 'kg')] },
          ] },
          { weekNumber: 2, phase: 'foundation', objective: 'o', sessions: [
            { ...firstSession(), id: 's-w2', weekNumber: 2, name: 'Week 2 Day 1', exercises: [makeEx(exA, 40, 'kg')] },
          ] },
        ],
      };
      const edited = applyFirstSessionLoads(plan, { 'ex-a': 99 });
      const s1 = edited.weeks[0].sessions[0];
      const s2 = edited.weeks[0].sessions[1];
      const w2 = edited.weeks[1].sessions[0];
      // Week 1 / Day 1 edited. Loads are quantized to equipment increments (2.5 kg barbell/dumbbell/cable).
      // 99 kg snaps to 100 kg with a 2.5 kg increment.
      expect(s1.exercises[0].targetLoad).toBe(100);
      // ...later Day-2 and Week 2 unchanged (not the coach's first-session edit).
      expect(s2.exercises[0].targetLoad).toBe(40);
      expect(w2.exercises[0].targetLoad).toBe(40);
    });

    it('is immutable — the source plan is not mutated', () => {
      const plan = singleSessionPlan();
      const snapshot = JSON.stringify(plan);
      applyFirstSessionLoads(plan, { 'ex-a': 55, 'ex-b': 12.5, 'ex-c': 42.5, 'ex-bw': 999 });
      expect(JSON.stringify(plan)).toBe(snapshot);
    });
  });
});
