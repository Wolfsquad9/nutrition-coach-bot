import { describe, expect, it } from 'vitest';
import { generateDynamicTrainingPlan } from './workoutGenerator';
import { sampleClient } from '@/data/sampleData';

const baseClient = { ...sampleClient };

describe('generateDynamicTrainingPlan', () => {
  it('generates a 4-week program for a 3-day fat-loss client', () => {
    const client = { ...baseClient, primaryGoal: 'fat_loss' as const, trainingDaysPerWeek: 3, trainingExperience: 'beginner' as const };
    const plan = generateDynamicTrainingPlan(client);

    expect(plan.duration).toBe(4);
    expect(plan.weeks).toHaveLength(4);
    expect(plan.frequency).toBe(3);
    expect(plan.weeks.every(week => week.sessions.length === 3)).toBe(true);
    expect(plan.objective).toContain('fat');
  });

  it('generates a 6-week program for a 4-day client', () => {
    const client = { ...baseClient, trainingDaysPerWeek: 4, trainingExperience: 'intermediate' as const };
    const plan = generateDynamicTrainingPlan(client);

    expect(plan.duration).toBe(6);
    expect(plan.weeks).toHaveLength(6);
    expect(plan.frequency).toBe(4);
    expect(plan.weeks[0].sessions).toHaveLength(4);
  });

  it('generates an 8-week program for an advanced 6-day client', () => {
    const client = { ...baseClient, trainingDaysPerWeek: 6, trainingExperience: 'advanced' as const, primaryGoal: 'muscle_gain' as const };
    const plan = generateDynamicTrainingPlan(client);

    expect(plan.duration).toBe(8);
    expect(plan.weeks).toHaveLength(8);
    expect(plan.frequency).toBe(6);
    expect(plan.weeks[7].sessions.length).toBe(6);
    expect(plan.phase).toBe('hypertrophy');
  });
});
