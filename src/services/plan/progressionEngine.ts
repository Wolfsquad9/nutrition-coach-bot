import { Exercise, TrainingPlan, WorkoutExercise, WorkoutSession, ExerciseResult, SessionResult, TrainingForecast, TrainingProgressionState } from '@/types';
import { createSeededRng } from '@/utils/random';

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

const parseRepRange = (reps: string): { min: number; max: number } => {
  const parts = reps.split('-').map(part => Number(part.trim())).filter(Number.isFinite);
  if (parts.length === 2) return { min: parts[0], max: parts[1] };
  if (parts.length === 1) return { min: parts[0], max: parts[0] };
  return { min: 8, max: 12 };
};

const averageReps = (actualReps: number[]): number => {
  if (actualReps.length === 0) return 0;
  return actualReps.reduce((sum, rep) => sum + rep, 0) / actualReps.length;
};

const progressionStep = (exercise: Exercise, experience: string): number => {
  if (experience === 'beginner') return 2.5;
  if (experience === 'advanced') return 5;
  return 2.5;
};

const determineNextLoad = (
  exercise: Exercise,
  availableEquipment: string[],
  currentLoad: number,
  actualReps: number[],
  targetReps: string,
  actualRPE: number,
  experience: string,
  phase: string,
  exerciseType: string,
): { nextLoad: number; direction: 'increase' | 'hold' | 'reduce'; note: string } => {
  const { min: targetMin, max: targetMax } = parseRepRange(targetReps);
  const avgReps = averageReps(actualReps);
  const step = progressionStep(exercise, experience);
  const profile = getEquipmentProfile(exercise, availableEquipment);
  const idealIncrease = currentLoad + step;
  let nextLoad = currentLoad;
  let direction: 'increase' | 'hold' | 'reduce' = 'hold';
  let note = 'Maintain load and focus on consistent technique.';

  const isStrengthPhase = phase === 'strength' || phase === 'power';
  const isHypertrophyPhase = phase === 'hypertrophy' || phase === 'recomposition';

  const successful = avgReps >= targetMin && actualRPE <= 8;
  const easy = actualRPE <= 6;
  const hard = actualRPE >= 9;
  const veryHard = actualRPE >= 9.5;
  const failure = actualRPE >= 10;

  if (failure) {
    direction = 'reduce';
    nextLoad = Math.max(profile.increment, currentLoad - profile.increment);
    note = 'Reduce load slightly after a hard session and repeat with better form.';
  } else if (veryHard) {
    direction = 'hold';
    nextLoad = currentLoad;
    note = 'Hold load and aim for better recovery before progressing.';
  } else if (hard) {
    if (avgReps >= targetMin) {
      direction = 'hold';
      nextLoad = currentLoad;
      note = 'Keep the same load to build consistency under higher effort.';
    } else {
      direction = 'reduce';
      nextLoad = Math.max(profile.increment, currentLoad - profile.increment);
      note = 'Ease the load to preserve form and rebuild confidence.';
    }
  } else if (easy) {
    direction = 'increase';
    nextLoad = idealIncrease;
    note = 'Progress load because the session felt easy and the target was achieved.';
  } else if (successful) {
    direction = 'increase';
    nextLoad = idealIncrease;
    note = 'Progress with a conservative increase after a solid performance.';
  } else {
    direction = 'hold';
    nextLoad = currentLoad;
    note = 'Keep the current load and repeat the session if the work was missed.';
  }

  nextLoad = quantizeLoad(nextLoad, profile.increment);
  return { nextLoad, direction, note };
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

export function inferNextSessionForecast(
  plan: TrainingPlan,
  session: WorkoutSession,
): TrainingForecast[] {
  const forecasts: TrainingForecast[] = session.exercises.map((exercise, idx) => {
    const targetLoad = exercise.targetLoad ?? 0;
    return {
      sessionId: session.id,
      summary: `${exercise.exercise.name}: ${exercise.sets}×${exercise.reps} @ ${exercise.targetRPE ?? 'RPE 7-8'}`,
      targetLoad,
      loadUnit: exercise.loadUnit ?? 'kg',
      repRange: exercise.reps,
      targetRPE: exercise.targetRPE ?? 'RPE 7-8',
      notes: exercise.progressionHint,
    };
  });
  return forecasts;
}

export function applySessionResult(
  plan: TrainingPlan,
  session: WorkoutSession,
  result: SessionResult,
): TrainingPlan {
  const sessionIndex = plan.weeks.flatMap(w => w.sessions).findIndex(s => s.id === session.id);
  const nextSessionIndex = sessionIndex + 1;

  const existing = session.exercises.map(exercise => {
    const exerciseResult = result.exercises.find(r => r.exerciseId === exercise.exercise.id);
    if (!exerciseResult) return exercise;

    const { nextLoad, note } = determineNextLoad(
      exercise.exercise,
      exercise.exercise.equipment.map(e => e.toLowerCase()),
      exercise.targetLoad ?? 0,
      exerciseResult.actualReps,
      exercise.reps,
      exerciseResult.rpe,
      plan.phase,
      exercise.exercise.category,
      plan.frequency === 1 ? 'single' : 'multiple',
    );

    return {
      ...exercise,
      targetLoad: nextLoad,
      progressionHint: note,
    };
  });

  const nextForecast = inferNextSessionForecast(plan, session);
  const nextState: TrainingProgressionState = {
    currentWeek: result.weekNumber,
    currentSessionIndex: result.sessionIndex,
    sessionHistory: [...(plan.progressionState?.sessionHistory ?? []), result],
    nextSessionId: plan.weeks.flatMap(w => w.sessions)[nextSessionIndex]?.id,
    futureForecast: nextForecast,
  };

  const updatedSession: WorkoutSession = {
    ...session,
    exercises: existing,
  };

  const updatedWeeks = plan.weeks.map((week) => ({
    ...week,
    sessions: week.sessions.map((s) => (s.id === session.id ? updatedSession : s)),
  }));

  return {
    ...plan,
    weeks: updatedWeeks,
    workouts: plan.workouts.map((w) => (w.id === session.id ? updatedSession : w)),
    progressionState: nextState,
  };
}
