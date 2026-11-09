/**
 * ClientMyPlanPage — client-facing "My Plan" page.
 *
 * Shows the authenticated client's NUTRITION program:
 * - Weekly meal plan
 * - Daily nutrition targets
 *
 * The client's TRAINING program lives exclusively in the dedicated Training
 * tab (ClientTrainingSessionPage). This page deliberately does not load or
 * render the training plan, so there is exactly one client-facing training-plan
 * presentation in the app.
 *
 * Fetches the locked nutrition plan from the database via the Supabase
 * service. Uses the resolved clientId from AuthProvider.
 */
import { useEffect, useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { fetchCurrentPlan } from '@/services/supabasePlanService';
import { WeeklyMealPlanDisplay } from '@/components/WeeklyMealPlanDisplay';
import type { PlanPayload } from '@/services/supabasePlanService';
import {
  getMealCompletions,
  upsertMealCompletion,
} from '@/services/checkin/mealCompletionService';
import type { MealCompletion } from '@/services/checkin/mealCompletionService';

export default function ClientMyPlanPage() {
  const { clientId, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const [plan, setPlan] = useState<PlanPayload | null>(null);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mealCompletions, setMealCompletions] = useState<MealCompletion[]>([]);
  const [mealCompletionsLoading, setMealCompletionsLoading] = useState(false);
  const [mealCompletionsError, setMealCompletionsError] = useState<string | null>(null);

  // Load meal completions when the plan changes
  useEffect(() => {
    if (!plan || !versionId) {
      setMealCompletions([]);
      setMealCompletionsLoading(false);
      setMealCompletionsError(null);
      return;
    }

    let cancelled = false;
    setMealCompletionsLoading(true);
    setMealCompletionsError(null);

    (async () => {
      try {
        const result = await getMealCompletions(clientId ?? '', versionId);
        if (cancelled) return;
        setMealCompletions(result.completions ?? []);
        setMealCompletionsLoading(false);
        if (result.error) setMealCompletionsError(result.error);
      } catch (err) {
        if (cancelled) return;
        setMealCompletionsError(err instanceof Error ? err.message : 'Failed to load meal completions');
        setMealCompletionsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [clientId, plan, versionId]);

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

      const nutritionResult = await fetchCurrentPlan(clientId);

      if (cancelled) return;

      if (nutritionResult.error) {
        setError(nutritionResult.error);
      } else if (!nutritionResult.plan) {
        setError('No plan found. Your coach has not yet created a plan for you.');
      } else {
        setPlan(nutritionResult.plan);
        setVersionId(nutritionResult.versionId);
      }
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [clientId, isAuthenticated, isAuthLoading]);

  const handleToggleCompletion = useCallback(async (dayOffset: number, mealSlot: 'breakfast' | 'lunch' | 'dinner' | 'snack') => {
    if (!clientId || !versionId) return;

    const upsertResult = await upsertMealCompletion({
      client_id: clientId,
      plan_version_id: versionId,
      day_offset: dayOffset,
      meal_slot: mealSlot,
      completed: !isMealCompleted(dayOffset, mealSlot),
    });

    if (upsertResult.error) {
      setError(upsertResult.error);
      return;
    }

    // Reload completions only on successful upsert
    const result = await getMealCompletions(clientId, versionId);
    if (result.completions) setMealCompletions(result.completions);
  }, [clientId, versionId, mealCompletions]);

  const isMealCompleted = useCallback((dayOffset: number, mealSlot: 'breakfast' | 'lunch' | 'dinner' | 'snack') => {
    return mealCompletions.some(
      (c) => c.day_offset === dayOffset && c.meal_slot === mealSlot && c.completed
    );
  }, [mealCompletions]);

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

      {/* Meal variety preference recorded by the coach at lock time.
          Rendered ONLY when the persisted payload actually carries the key —
          legacy payloads show nothing rather than an unverifiable label. */}
      {plan.mealVariety && (
        <div>
          <Badge variant="outline" data-testid="meal-variety-badge">
            Meal variety:{' '}
            {plan.mealVariety === 'more' ? 'More variety' : 'Traditional variety'}
          </Badge>
        </div>
      )}

      {/* Nutrition Plan */}
      {plan.weeklyPlan && (
        <WeeklyMealPlanDisplay weeklyPlan={plan.weeklyPlan} />
      )}

      {/* Meal Completion Controls */}
      {plan.weeklyPlan && (
        <Card className="p-6 shadow-card">
          <h3 className="text-lg font-bold text-primary mb-4">Meal Completion</h3>
          {mealCompletionsLoading && (
            <p className="text-sm text-muted-foreground">Loading completions...</p>
          )}
          {mealCompletionsError && (
            <p className="text-sm text-destructive mb-2">{mealCompletionsError}</p>
          )}
          <div className="space-y-4">
            {plan.weeklyPlan.days.map((day) => (
              <div key={day.dayNumber} className="border border-border/50 rounded-lg p-3">
                <p className="font-medium text-sm text-primary mb-2">{day.dayName}</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {(['breakfast', 'lunch', 'dinner', 'snack'] as const).map((mealSlot) => {
                    const dayOffset = day.dayNumber - 1;
                    const completed = isMealCompleted(dayOffset, mealSlot);
                    return (
                      <button
                        key={mealSlot}
                        onClick={() => handleToggleCompletion(dayOffset, mealSlot)}
                        aria-pressed={completed}
                        className={`flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                          completed
                            ? 'bg-success/10 text-success border border-success/20'
                            : 'bg-muted/50 text-muted-foreground border border-transparent hover:bg-muted'
                        }`}
                      >
                        {completed ? <CheckCircle2 className="h-4 w-4" /> : null}
                        {mealSlot.charAt(0).toUpperCase() + mealSlot.slice(1)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          {mealCompletions.length === 0 && !mealCompletionsLoading && (
            <p className="text-xs text-muted-foreground mt-4">
              No meal completions recorded yet. Mark meals as completed above.
            </p>
          )}
        </Card>
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
    </div>
  );
}