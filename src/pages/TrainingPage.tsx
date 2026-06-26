/**
 * Training tab page — displays the training plan from generated complete plan
 */

import { Card } from '@/components/ui/card';
import { TrainingPlanDisplay } from '@/components/TrainingPlanDisplay';
import { useAppLayout } from '@/hooks/useAppLayout';

export default function TrainingPage() {
  const { generatedPlan } = useAppLayout();

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
        workouts: generatedPlan.trainingPlan.workouts.map(w => ({
          day: w.dayNumber,
          name: w.name,
          exercises: w.exercises.map(ex => ({
            name: ex.exercise?.name ?? 'Unknown exercise',
            sets: ex.sets,
            reps: ex.reps,
          })),
        })),
      }}
    />
  );
}
