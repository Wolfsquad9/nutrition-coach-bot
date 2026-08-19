/**
 * Training input assembly + validation.
 *
 * The workout generator must receive a complete, validated
 * `TrainingPlanInput` — never a partial Client. This module owns the only
 * path that turns the persisted client profile plus the Training-tab
 * questionnaire into that complete input. It deliberately returns a list
 * of missing fields instead of fabricating defaults: the generator must
 * never hide missing information.
 */

import type { Client, TrainingPlanInput } from '@/types';

/** Fields the Training tab questionnaire collects (not persisted on the client row). */
export type TrainingQuestionnaire = {
  trainingExperience: NonNullable<Client['trainingExperience']>;
  trainingDaysPerWeek: number;
  sessionDuration: number;
  preferredTrainingStyle: NonNullable<Client['preferredTrainingStyle']>;
  equipment: string[];
};

export type TrainingInputDraft = Partial<TrainingQuestionnaire>;

export interface BuildTrainingInputResult {
  input: TrainingPlanInput | null;
  missing: string[];
}

/** Valid options for training days per week (matches the generator contract). */
export const TRAINING_DAYS_OPTIONS = [3, 4, 5, 6] as const;

/** Valid preferences for training style. */
export const TRAINING_STYLE_OPTIONS: NonNullable<Client['preferredTrainingStyle']>[] = [
  'strength',
  'hypertrophy',
  'powerlifting',
  'crossfit',
  'bodybuilding',
];

/** Common equipment options offered in the questionnaire. */
export const EQUIPMENT_OPTIONS = [
  'barbell',
  'dumbbells',
  'cables',
  'machines',
  'pull-up bar',
  'kettlebells',
  'resistance bands',
  'bodyweight',
] as const;

const isExperience = (value: unknown): value is NonNullable<Client['trainingExperience']> =>
  value === 'beginner' || value === 'intermediate' || value === 'advanced';

const isTrainingStyle = (value: unknown): value is NonNullable<Client['preferredTrainingStyle']> =>
  TRAINING_STYLE_OPTIONS.includes(value as NonNullable<Client['preferredTrainingStyle']>);

/**
 * Validate the questionnaire and build the complete generator input.
 *
 * `client` supplies the persisted profile values (`primaryGoal`, and any
 * questionnaire fields already stored on the client row). The draft's values
 * win when present; missing draft values fall back to the persisted client
 * profile. A field that is missing everywhere is reported in `missing` and
 * no input is produced.
 */
export function buildTrainingPlanInput(
  client: Client | null,
  draft: TrainingInputDraft | null,
): BuildTrainingInputResult {
  const missing: string[] = [];

  if (!client) {
    return { input: null, missing: ['client'] };
  }
  if (!client.id) {
    missing.push('clientId');
  }
  if (!client.primaryGoal) {
    missing.push('primaryGoal');
  }

  const trainingExperience = draft?.trainingExperience ?? client.trainingExperience;
  const trainingDaysPerWeek = draft?.trainingDaysPerWeek ?? client.trainingDaysPerWeek;
  const sessionDuration = draft?.sessionDuration ?? client.sessionDuration;
  const preferredTrainingStyle = draft?.preferredTrainingStyle ?? client.preferredTrainingStyle;
  const equipment = draft?.equipment ?? client.equipment;

  if (!isExperience(trainingExperience)) {
    missing.push('trainingExperience');
  }
  if (typeof trainingDaysPerWeek !== 'number' || !Number.isInteger(trainingDaysPerWeek) || trainingDaysPerWeek < 3 || trainingDaysPerWeek > 6) {
    missing.push('trainingDaysPerWeek');
  }
  if (typeof sessionDuration !== 'number' || !Number.isFinite(sessionDuration) || sessionDuration <= 0) {
    missing.push('sessionDuration');
  }
  if (!isTrainingStyle(preferredTrainingStyle)) {
    missing.push('preferredTrainingStyle');
  }
  if (!Array.isArray(equipment) || equipment.length === 0) {
    missing.push('equipment');
  }

  if (missing.length > 0) {
    return { input: null, missing };
  }

  const input: TrainingPlanInput = {
    id: client.id,
    primaryGoal: client.primaryGoal,
    trainingExperience: trainingExperience as NonNullable<Client['trainingExperience']>,
    trainingDaysPerWeek: trainingDaysPerWeek as number,
    sessionDuration: sessionDuration as number,
    preferredTrainingStyle: preferredTrainingStyle as NonNullable<Client['preferredTrainingStyle']>,
    equipment: equipment as string[],
    equipmentAvailable: client.equipmentAvailable,
  };

  return { input, missing };
}