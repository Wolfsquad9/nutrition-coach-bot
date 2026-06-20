import { Exercise } from '@/types';
import { sampleExercises } from '@/data/sampleData';

// Exercise database organized by muscle group and difficulty
export const EXERCISE_DATABASE: Record<string, Exercise[]> = {
  chest: sampleExercises.filter(ex => ex.category === 'chest'),
  back: sampleExercises.filter(ex => ex.category === 'back'),
  legs: sampleExercises.filter(ex => ex.category === 'legs'),
  shoulders: sampleExercises.filter(ex => ex.category === 'shoulders'),
  biceps: sampleExercises.filter(ex => ex.category === 'biceps'),
  triceps: sampleExercises.filter(ex => ex.category === 'triceps'),
  glutes: sampleExercises.filter(ex => ex.category === 'glutes'),
  abs: sampleExercises.filter(ex => ex.category === 'abs'),
};

// Training parameters by goal
export const GOAL_TRAINING_PARAMS: Record<string, { 
  sets: number; 
  reps: string; 
  rest: number; 
  intensity: string;
  volumeMultiplier: number;
}> = {
  fat_loss: { sets: 3, reps: '12-15', rest: 45, intensity: 'RPE 6-7', volumeMultiplier: 1.2 },
  muscle_gain: { sets: 4, reps: '8-12', rest: 90, intensity: 'RPE 7-8', volumeMultiplier: 1.0 },
  recomposition: { sets: 4, reps: '10-12', rest: 75, intensity: 'RPE 7-8', volumeMultiplier: 1.1 },
  maintenance: { sets: 3, reps: '8-10', rest: 90, intensity: 'RPE 7', volumeMultiplier: 0.8 },
};

// Experience-based adjustments
export const EXPERIENCE_ADJUSTMENTS: Record<string, { setModifier: number; exerciseCount: number; complexityLevel: string[] }> = {
  beginner: { setModifier: -1, exerciseCount: 4, complexityLevel: ['beginner', 'intermediate'] },
  intermediate: { setModifier: 0, exerciseCount: 5, complexityLevel: ['beginner', 'intermediate', 'advanced'] },
  advanced: { setModifier: 1, exerciseCount: 6, complexityLevel: ['intermediate', 'advanced'] },
};
