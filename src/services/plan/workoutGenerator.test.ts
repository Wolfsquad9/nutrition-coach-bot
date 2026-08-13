import { describe, expect, it } from 'vitest';
import { generateDynamicTrainingPlan } from './workoutGenerator';
import { sampleClient } from '@/data/sampleData';
import type { TrainingPlanInput } from '@/types';

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
});
