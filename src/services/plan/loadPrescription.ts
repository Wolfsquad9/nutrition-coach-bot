import { Exercise } from '@/types';

export type EquipmentProfile = {
  equipmentType: 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'other';
  loadUnit: 'kg' | 'lb' | 'bodyweight' | 'machine' | 'cable' | 'unknown';
  increment: number;
  defaultLoad?: number;
};

const DEFAULT_EQUIPMENT_PROFILE: EquipmentProfile = {
  equipmentType: 'barbell',
  loadUnit: 'kg',
  increment: 2.5,
  defaultLoad: 40,
};

const EQUIPMENT_PROFILES: Record<string, EquipmentProfile> = {
  barbell: { equipmentType: 'barbell', loadUnit: 'kg', increment: 2.5, defaultLoad: 40 },
  plates: { equipmentType: 'barbell', loadUnit: 'kg', increment: 2.5, defaultLoad: 40 },
  dumbbells: { equipmentType: 'dumbbell', loadUnit: 'kg', increment: 2.5, defaultLoad: 10 },
  machines: { equipmentType: 'machine', loadUnit: 'kg', increment: 5, defaultLoad: 30 },
  'leg press machine': { equipmentType: 'machine', loadUnit: 'kg', increment: 10, defaultLoad: 60 },
  'cable machine': { equipmentType: 'cable', loadUnit: 'kg', increment: 2.5, defaultLoad: 10 },
  'pull-up bar': { equipmentType: 'bodyweight', loadUnit: 'bodyweight', increment: 1, defaultLoad: 0 },
};

const getEquipmentProfile = (exercise: Exercise, availableEquipment: string[]): EquipmentProfile => {
  const equipmentLower = exercise.equipment.map(e => e.toLowerCase());
  const candidates = equipmentLower
    .map(name => EQUIPMENT_PROFILES[name])
    .filter(Boolean);

  if (candidates.length > 0) {
    return candidates[0];
  }

  const fallback = availableEquipment
    .map(e => e.toLowerCase())
    .map(name => EQUIPMENT_PROFILES[name])
    .find(Boolean);

  return fallback ?? DEFAULT_EQUIPMENT_PROFILE;
};

const quantizeLoad = (load: number, increment: number): number => {
  if (increment <= 0) return Math.round(load);
  const quantized = Math.round(load / increment) * increment;
  return Math.max(increment, Math.round(quantized * 100) / 100);
};

const ensureLoad = (exercise: Exercise, availableEquipment: string[], targetLoad?: number): { load: number; loadUnit: EquipmentProfile['loadUnit'] } => {
  const profile = getEquipmentProfile(exercise, availableEquipment);
  if (profile.loadUnit === 'bodyweight') {
    return { load: profile.defaultLoad ?? 0, loadUnit: 'bodyweight' };
  }
  const base = typeof targetLoad === 'number' && targetLoad > 0 ? targetLoad : profile.defaultLoad ?? 20;
  return { load: quantizeLoad(base, profile.increment), loadUnit: profile.loadUnit };
};

const inferRPE = (targetRPE: string | undefined): string => {
  if (!targetRPE) return 'RPE 7-8';
  return targetRPE;
};

export function buildWorkoutPrescription(
  exercise: Exercise,
  trainingStyle: string,
  experience: string,
  availableEquipment: string[],
  targetReps: string,
  targetRPE?: string,
  existingLoad?: number,
): { targetLoad: number; loadUnit: EquipmentProfile['loadUnit']; targetRPE: string; progressionHint: string } {
  const { load, loadUnit } = ensureLoad(exercise, availableEquipment, existingLoad);
  return {
    targetLoad: load,
    loadUnit,
    targetRPE: inferRPE(targetRPE),
    progressionHint: `Start with ${load}${loadUnit === 'kg' || loadUnit === 'lb' ? ` ${loadUnit}` : ''} and track RPE for the next update.`,
  };
}
