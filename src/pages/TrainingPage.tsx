/**
 * Training tab page — displays the training plan from generated complete plan
 */

import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { TrainingPlanDisplay } from '@/components/TrainingPlanDisplay';
import { useAppLayout } from '@/hooks/useAppLayout';
import type { WorkoutExercise } from '@/types';

/**
 * Validate a workout exercise entry. The upstream generator must always
 * produce a valid `exercise` reference; the prior fallback that rendered
 * "Unknown exercise" silently masked a data-pipeline regression. Drop
 * invalid entries and log in dev so the regression is observable without
 * poisoning the rendered output.
 */
function isValidWorkoutExercise(
  ex: WorkoutExercise
): ex is WorkoutExercise & { exercise: NonNullable<WorkoutExercise['exercise']> } {
  if (ex.exercise && typeof ex.exercise.name === 'string') return true;
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.error('[TrainingPage] Dropping workout exercise with missing reference:', ex);
  }
  return false;
}

export default function TrainingPage() {
  const { generatedPlan } = useAppLayout();

  const workouts = useMemo(() => {
    if (!generatedPlan) return [];
    return generatedPlan.trainingPlan.workouts.map(w => ({
      day: w.dayNumber,
      name: w.name,
      exercises: w.exercises.filter(isValidWorkoutExercise).map(ex => ({
        name: ex.exercise.name,
        sets: ex.sets,
        reps: ex.reps,
      })),
    }));
  }, [generatedPlan]);

  if (!generatedPlan) {
    return (
      <Card className="p-6 shadow-card">
        <h2 className="text-2xl font-bold text-primary">Training Plan</h2>
        <p className="text-muted-foreground mt-2">Generate a plan first to view the training schedule.</p>
      </Card>
    );
  }

  return (
    <TrainingPlanDisplay
      plan={{
        split: generatedPlan.trainingPlan.split,
        sessions: generatedPlan.trainingPlan.frequency,
        workouts,
      }}
    />
  );
}
