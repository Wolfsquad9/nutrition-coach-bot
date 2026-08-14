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
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { fetchCurrentPlan } from '@/services/supabasePlanService';
import { WeeklyMealPlanDisplay } from '@/components/WeeklyMealPlanDisplay';
import type { PlanPayload } from '@/services/supabasePlanService';

export default function ClientMyPlanPage() {
  const { clientId, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const [plan, setPlan] = useState<PlanPayload | null>(null);
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

      const nutritionResult = await fetchCurrentPlan(clientId);

      if (cancelled) return;

      if (nutritionResult.error) {
        setError(nutritionResult.error);
      } else if (!nutritionResult.plan) {
        setError('No plan found. Your coach has not yet created a plan for you.');
      } else {
        setPlan(nutritionResult.plan);
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
    </div>
  );
}