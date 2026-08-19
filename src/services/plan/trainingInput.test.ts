import { describe, expect, it } from 'vitest';
import { buildTrainingPlanInput } from './trainingInput';
import { sampleClient } from '@/data/sampleData';
import type { Client } from '@/types';

// A client whose questionnaire-not-persisted fields are missing — must NOT be
// silently filled with defaults.
const incompleteProfile: Client = {
  ...sampleClient,
  sessionDuration: undefined,
  preferredTrainingStyle: undefined,
  equipment: undefined,
};

describe('buildTrainingPlanInput', () => {
  it('rejects a null client', () => {
    const result = buildTrainingPlanInput(null, null);
    expect(result.input).toBeNull();
    expect(result.missing).toContain('client');
  });

  it('cannot generate when questionnaire fields are missing', () => {
    const result = buildTrainingPlanInput(incompleteProfile, null);
    expect(result.input).toBeNull();
    expect(result.missing).toEqual(expect.arrayContaining(['sessionDuration', 'preferredTrainingStyle', 'equipment']));
  });

  it('cannot generate when a questionnaire input is not provided anywhere', () => {
    // Client has no persisted trainingDaysPerWeek and the draft omits it too.
    const noDaysProfile: Client = { ...sampleClient, trainingDaysPerWeek: undefined };
    const result = buildTrainingPlanInput(noDaysProfile, {
      sessionDuration: 60,
      preferredTrainingStyle: 'hypertrophy',
      equipment: ['barbell'],
    });
    expect(result.input).toBeNull();
    expect(result.missing).toContain('trainingDaysPerWeek');
  });

  it('cannot generate with an unsupported training style', () => {
    const result = buildTrainingPlanInput(sampleClient, {
      preferredTrainingStyle: 'zumba' as Client['preferredTrainingStyle'],
    });
    expect(result.input).toBeNull();
    expect(result.missing).toContain('preferredTrainingStyle');
  });

  it('rejects out-of-range training days per week', () => {
    const result = buildTrainingPlanInput(sampleClient, { trainingDaysPerWeek: 2 });
    expect(result.input).toBeNull();
    expect(result.missing).toContain('trainingDaysPerWeek');
  });

  it('builds a complete input from the persisted profile plus the questionnaire', () => {
    const result = buildTrainingPlanInput(sampleClient, {
      sessionDuration: 90,
      preferredTrainingStyle: 'powerlifting',
      equipment: ['barbell', 'pull-up bar'],
    });

    expect(result.missing).toEqual([]);
    expect(result.input).not.toBeNull();
    expect(result.input).toEqual({
      id: sampleClient.id,
      primaryGoal: sampleClient.primaryGoal,
      trainingExperience: sampleClient.trainingExperience,
      trainingDaysPerWeek: sampleClient.trainingDaysPerWeek,
      sessionDuration: 90,
      preferredTrainingStyle: 'powerlifting',
      equipment: ['barbell', 'pull-up bar'],
      equipmentAvailable: sampleClient.equipmentAvailable,
    });
  });

    it('passes persisted training values through when the questionnaire leaves them undefined', () => {
    const result = buildTrainingPlanInput(sampleClient, {
      trainingExperience: undefined,
      trainingDaysPerWeek: undefined,
    });

    expect(result.input).not.toBeNull();
    expect(result.input?.trainingExperience).toBe(sampleClient.trainingExperience);
    expect(result.input?.trainingDaysPerWeek).toBe(sampleClient.trainingDaysPerWeek);
  });
});