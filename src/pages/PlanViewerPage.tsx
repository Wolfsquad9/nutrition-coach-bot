/**
 * PlanViewerPage — Public read-only view of a shared nutrition plan.
 * No authentication required. Fetches snapshot via edge function.
 */

import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, AlertCircle, Utensils, ArrowLeft, Printer } from 'lucide-react';
import { fetchSharedPlan } from '@/services/sharePlanService';
import { mapSnapshotToWeeklyPlan } from '@/domain/nutrition/snapshotAdapter';
import { WeeklyMealPlanDisplay } from '@/components/WeeklyMealPlanDisplay';
import type { PlanSnapshot } from '@/domain/nutrition/snapshot';

export default function PlanViewerPage() {
  const { shareId } = useParams<{ shareId: string }>();
  const [snapshot, setSnapshot] = useState<PlanSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!shareId) {
      setError('Invalid link');
      setLoading(false);
      return;
    }

    let cancelled = false;

    fetchSharedPlan(shareId).then(({ snapshot: s, error: e }) => {
      if (cancelled) return;
      if (e) setError(e);
      else setSnapshot(s);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [shareId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading plan...</p>
        </div>
      </div>
    );
  }

  if (error || !snapshot) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="p-8 max-w-md text-center space-y-4">
          <AlertCircle className="h-12 w-12 mx-auto text-destructive" />
          <h1 className="text-xl font-bold">Plan not found</h1>
          <p className="text-muted-foreground">
            {error || 'This plan link is invalid or has expired.'}
          </p>
          <Link to="/login">
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Go to login
            </Button>
          </Link>
        </Card>
      </div>
    );
  }

  const weeklyPlan = mapSnapshotToWeeklyPlan({
    weeklyPlan: snapshot.weeklyPlan,
    metrics: {
      calories: snapshot.metrics.targetCalories,
      protein: snapshot.metrics.proteinGrams,
      carbs: snapshot.metrics.carbsGrams,
      fat: snapshot.metrics.fatGrams,
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
        {/* Header */}
        <Card className="p-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <Utensils className="h-6 w-6 text-primary" />
              <div>
                <h1 className="text-2xl font-bold text-foreground">
                  {snapshot.meta.planName}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {snapshot.client.firstName} {snapshot.client.lastName} — {snapshot.client.goal}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                v{snapshot.meta.versionNumber}
              </Badge>
              <Badge variant="secondary" className="text-xs">
                {new Date(snapshot.meta.createdAt).toLocaleDateString('en-US')}
              </Badge>
            </div>
          </div>

          {/* Macro summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            <div className="bg-muted/50 p-3 rounded-lg text-center">
              <p className="text-xs text-muted-foreground">Calories</p>
              <p className="text-lg font-bold text-primary">{snapshot.metrics.targetCalories}</p>
            </div>
            <div className="bg-muted/50 p-3 rounded-lg text-center">
              <p className="text-xs text-muted-foreground">Protein</p>
              <p className="text-lg font-bold text-success">{snapshot.metrics.proteinGrams}g</p>
            </div>
            <div className="bg-muted/50 p-3 rounded-lg text-center">
              <p className="text-xs text-muted-foreground">Carbs</p>
              <p className="text-lg font-bold text-info">{snapshot.metrics.carbsGrams}g</p>
            </div>
            <div className="bg-muted/50 p-3 rounded-lg text-center">
              <p className="text-xs text-muted-foreground">Fat</p>
              <p className="text-lg font-bold text-warning">{snapshot.metrics.fatGrams}g</p>
            </div>
          </div>
        </Card>

        {/* Weekly plan display */}
        <WeeklyMealPlanDisplay weeklyPlan={weeklyPlan} />
      </div>
    </div>
  );
}
