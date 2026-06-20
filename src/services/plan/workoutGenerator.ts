import { Client, TrainingPlan, WorkoutSession, WorkoutExercise } from './types';
import { GOAL_TRAINING_PARAMS, EXPERIENCE_ADJUSTMENTS } from './constants';
import { selectExercisesForSession } from './exerciseSelectors';

/**
 * Generate a workout session with dynamic parameters
 */
export function generateDynamicWorkoutSession(
  sessionType: 'upper' | 'lower' | 'push' | 'pull' | 'legs' | 'full_body',
  dayNumber: number,
  client: Client
): WorkoutSession {
  const goalParams = GOAL_TRAINING_PARAMS[client.primaryGoal] || GOAL_TRAINING_PARAMS.maintenance;
  const expConfig = EXPERIENCE_ADJUSTMENTS[client.trainingExperience] || EXPERIENCE_ADJUSTMENTS.intermediate;
  
  const exercises = selectExercisesForSession(
    sessionType, 
    client.trainingExperience,
    client.equipmentAvailable || []
  );
  
  const workoutExercises: WorkoutExercise[] = exercises.map((exercise, idx) => {
    let sets = Math.max(2, goalParams.sets + expConfig.setModifier);
    let reps = goalParams.reps;
    let rest = goalParams.rest;
    let intensity = goalParams.intensity;
    
    // Adjust for compound movements
    if (exercise.name.toLowerCase().includes('squat') || 
        exercise.name.toLowerCase().includes('deadlift') ||
        exercise.name.toLowerCase().includes('bench press')) {
      sets = Math.min(sets + 1, 5);
      reps = client.primaryGoal === 'fat_loss' ? '8-10' : '5-8';
      rest = 120;
      intensity = 'RPE 8-9';
    }
    
    return {
      exercise,
      sets,
      reps,
      rest,
      intensity,
      tempo: client.trainingExperience === 'beginner' ? '3-1-2-0' : '2-0-2-0',
      notes: client.trainingExperience === 'beginner' ? 'Focus on form and controlled movement' : undefined,
    };
  });
  
  const sessionName = {
    upper: 'Upper Body',
    lower: 'Lower Body',
    push: 'Push Day',
    pull: 'Pull Day',
    legs: 'Leg Day',
    full_body: 'Full Body',
  }[sessionType];
  
  return {
    id: `session-${dayNumber}`,
    dayNumber,
    sessionType,
    name: `${sessionName} - Day ${dayNumber}`,
    duration: client.sessionDuration || 60,
    exercises: workoutExercises,
    notes: `Warm up 5-10 minutes. Rest ${goalParams.rest}s between sets. Cool down and stretch after.`,
  };
}

/**
 * Generate a complete training plan based on client data
 */
export function generateDynamicTrainingPlan(client: Client): TrainingPlan {
  const daysPerWeek = client.trainingDaysPerWeek || 3;
  const workouts: WorkoutSession[] = [];
  
  // Select split based on training frequency
  let split: 'full_body' | 'upper_lower' | 'push_pull_legs';
  let sessionPattern: ('upper' | 'lower' | 'push' | 'pull' | 'legs' | 'full_body')[];
  
  if (daysPerWeek <= 3) {
    split = 'full_body';
    sessionPattern = Array(daysPerWeek).fill('full_body');
  } else if (daysPerWeek === 4) {
    split = 'upper_lower';
    sessionPattern = ['upper', 'lower', 'upper', 'lower'];
  } else {
    split = 'push_pull_legs';
    const pplPattern: ('push' | 'pull' | 'legs')[] = ['push', 'pull', 'legs'];
    sessionPattern = [];
    for (let i = 0; i < daysPerWeek; i++) {
      sessionPattern.push(pplPattern[i % 3]);
    }
  }
  
  // Generate each workout session
  sessionPattern.forEach((sessionType, idx) => {
    workouts.push(generateDynamicWorkoutSession(sessionType, idx + 1, client));
  });
  
  // Determine training phase based on goal
  const phase: 'strength' | 'hypertrophy' | 'power' | 'endurance' = 
    client.primaryGoal === 'muscle_gain' ? 'hypertrophy' :
    client.primaryGoal === 'fat_loss' ? 'endurance' :
    'strength';
  
  return {
    id: `training-${Date.now()}`,
    clientId: client.id,
    name: `${client.primaryGoal.replace('_', ' ')} ${split.replace('_', '/')} Program`,
    duration: 4, // 4-week cycles
    frequency: daysPerWeek,
    split,
    phase,
    workouts,
    progressionScheme: client.trainingExperience === 'beginner' 
      ? 'Add 2.5kg when completing all sets with good form'
      : 'Progressive overload: Increase weight 2.5-5kg or add 1-2 reps per week',
    createdAt: new Date().toISOString(),
  };
}
