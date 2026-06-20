import { Exercise } from './types';
import { EXERCISE_DATABASE, EXPERIENCE_ADJUSTMENTS } from './constants';
import { createSeededRng, type Rng } from '@/utils/random';

/**
 * Select exercises based on session type, experience, and available equipment
 */
export function selectExercisesForSession(
  sessionType: 'upper' | 'lower' | 'push' | 'pull' | 'legs' | 'full_body',
  experience: string,
  availableEquipment: string[],
  rng: Rng = createSeededRng(`session-${sessionType}-${experience}-${Date.now()}`)
): Exercise[] {
  const expConfig = EXPERIENCE_ADJUSTMENTS[experience] || EXPERIENCE_ADJUSTMENTS.intermediate;
  let muscleGroups: string[] = [];
  
  switch (sessionType) {
    case 'upper':
      muscleGroups = ['chest', 'back', 'shoulders', 'biceps', 'triceps'];
      break;
    case 'lower':
    case 'legs':
      muscleGroups = ['legs', 'glutes', 'abs'];
      break;
    case 'push':
      muscleGroups = ['chest', 'shoulders', 'triceps'];
      break;
    case 'pull':
      muscleGroups = ['back', 'biceps'];
      break;
    case 'full_body':
      muscleGroups = ['chest', 'back', 'legs', 'shoulders', 'abs'];
      break;
  }
  
  const selectedExercises: Exercise[] = [];
  
  // Select 1-2 exercises per muscle group based on session type
  muscleGroups.forEach(muscle => {
    const muscleExercises = (EXERCISE_DATABASE[muscle] || [])
      .filter(ex => expConfig.complexityLevel.includes(ex.difficulty));
    
    if (muscleExercises.length > 0) {
      // Deterministic shuffle — same seed = same exercises. Replaces Math.random().
      const shuffled = rng.shuffle(muscleExercises);
      const exercisesToAdd = sessionType === 'full_body' ? 1 : Math.min(2, shuffled.length);
      selectedExercises.push(...shuffled.slice(0, exercisesToAdd));
    }
  });
  
  // Limit total exercises based on experience
  return selectedExercises.slice(0, expConfig.exerciseCount);
}
