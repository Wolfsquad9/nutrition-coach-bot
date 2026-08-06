/**
 * ClientMyPlanPage — client-facing "My Plan" page.
 *
 * Shows the authenticated client's full program:
 * - Training plan (reuses TrainingPlanDisplay)
 * - Nutrition plan (reuses WeeklyMealPlanDisplay)
 * - Daily meal plan (reuses DailyMealPlanDisplay)
 *
 * Fetches the locked nutrition plan AND training plan from the database
 * via the Supabase services. Uses the resolved clientId from AuthProvider.
 */
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { fetchCurrentPlan } from '@/services/supabasePlanService';
import { fetchActiveTrainingPlan } from '@/services/supabaseTrainingPlanService';
import { TrainingPlanDisplay } from '@/components/TrainingPlanDisplay';
import { WeeklyMealPlanDisplay } from '@/components/WeeklyMealPlanDisplay';
import type { PlanPayload } from '@/services/supabasePlanService';
import type { Exercise, TrainingPlan as PersistedTrainingPlan, WorkoutSession } from '@/types';

interface TrainingPlanData {
  split: string;
  sessions: number;
  workouts: Array<{
    day: number;
    name: string;
    exercises: Array<{
      name: string;
      sets: number;
      reps: string;
    }>;
  }>;
}

const getExerciseName = (ex: Exercise | unknown): string => {
  if (!ex || typeof ex !== 'object') return 'Exercise';
  const obj = ex as Record<string, unknown>;
  const exercise = obj.exercise;
  if (exercise && typeof exercise === 'object') {
    const name = (exercise as Record<string, unknown>).name;
    if (typeof name === 'string') return name;
  }
  if (typeof obj.name === 'string') return obj.name;
  return 'Exercise';
};

const normalizeTrainingPlan = (plan: PersistedTrainingPlan | null): TrainingPlanData | null => {
  if (!plan) return null;
  const workouts: WorkoutSession[] = Array.isArray(plan.workouts) ? plan.workouts : [];
  return {
    split: plan.split || 'Custom',
    sessions:
      plan.frequency ??
      workouts.length ??
      3,
    workouts: workouts.map((w, idx) => ({
      day: (w as unknown as { day?: number; dayNumber?: number }).day
        ?? (w as unknown as { dayNumber?: number }).dayNumber
        ?? idx + 1,
      name: w.name || `Workout ${idx + 1}`,
      exercises: (w.exercises || []).map((ex) => ({
        name: getExerciseName(ex),
        sets: ex.sets ?? 3,
        reps: ex.reps || '10-12',
      })),
    })),
  };
};

export default function ClientMyPlanPage() {
  const { clientId, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const [plan, setPlan] = useState<PlanPayload | null>(null);
  const [trainingPlan, setTrainingPlan] = useState<TrainingPlanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthLoading) return;
    if (!isAuthenticated || !clientId) {
      setLoading(false);
      setError('Please sign in to view your plan.');
      return;
    }

    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);

      // Fetch nutrition and training plans in parallel
      const [nutritionResult, trainingResult] = await Promise.all([
        fetchCurrentPlan(clientId),
        fetchActiveTrainingPlan(clientId),
      ]);

      if (cancelled) return;

      if (nutritionResult.error) {
        setError(nutritionResult.error);
      } else if (!nutritionResult.plan) {
        setError('No plan found. Your coach has not yet created a plan for you.');
      } else {
        setPlan(nutritionResult.plan);
      }

      if (!cancelled) {
        setTrainingPlan(normalizeTrainingPlan(trainingResult.plan));
      }
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [clientId, isAuthenticated, isAuthLoading]);

  if (isAuthLoading || loading) {
    return (
      <Card className="p-12 shadow-card">
        <div className="flex flex-col items-center justify-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading your plan...</p>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-6 shadow-card">
        <div className="flex flex-col items-center justify-center gap-4 py-8">
          <AlertCircle className="h-12 w-12 text-muted-foreground" />
          <h2 className="text-xl font-bold text-primary">My Plan</h2>
          <p className="text-muted-foreground text-center max-w-md">{error}</p>
        </div>
      </Card>
    );
  }

  if (!plan) {
    return (
      <Card className="p-6 shadow-card">
        <div className="flex flex-col items-center justify-center gap-4 py-8">
          <h2 className="text-xl font-bold text-primary">My Plan</h2>
          <p className="text-muted-foreground">No plan available yet.</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-primary">My Plan</h2>

      {/* Nutrition Plan */}
      {plan.weeklyPlan && (
        <WeeklyMealPlanDisplay weeklyPlan={plan.weeklyPlan} />
      )}

      {/* Macro Targets Summary */}
      {plan.macroTargets && (
        <Card className="p-6 shadow-card">
          <h3 className="text-lg font-bold text-primary mb-4">Daily Nutrition Targets</h3>
          <div className="grid grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Calories</p>
              <p className="text-xl font-bold text-primary">{plan.macroTargets.calories}</p>
            </div>
            <div className="p-3 rounded-lg bg-success/10 border border-success/20 text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Protein</p>
              <p className="text-xl font-bold text-success">{plan.macroTargets.protein}g</p>
            </div>
            <div className="p-3 rounded-lg bg-info/10 border border-info/20 text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Carbs</p>
              <p className="text-xl font-bold text-info">{plan.macroTargets.carbs}g</p>
            </div>
            <div className="p-3 rounded-lg bg-warning/10 border border-warning/20 text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Fat</p>
              <p className="text-xl font-bold text-warning">{plan.macroTargets.fat}g</p>
            </div>
          </div>
        </Card>
      )}

      {/* Training Plan — fetched from training_plans table */}
      {trainingPlan ? (
        <TrainingPlanDisplay plan={trainingPlan} />
      ) : (
        <Card className="p-6 shadow-card">
          <div className="flex flex-col items-center justify-center gap-2 py-4">
            <h3 className="text-lg font-bold text-primary">Training Plan</h3>
            <p className="text-muted-foreground text-sm">
              Your training plan will appear here once assigned by your coach.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}