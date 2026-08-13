import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Loader2, AlertCircle, Lock, PartyPopper } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { fetchActiveTrainingPlan } from '@/services/supabaseTrainingPlanService';
import { fetchSessionLogs } from '@/services/supabaseSessionLogService';
import { selectClientProgress } from '@/services/plan/progressSelector';
import { weekdayNameOfIso } from '@/services/plan/trainingSchedule';
import { SessionExecutionForm } from '@/components/training/SessionExecutionForm';
import { TrainingPlanDisplay } from '@/components/TrainingPlanDisplay';
import type { SessionLog, TrainingPlan } from '@/types';

/**
 * Client-facing training / execution page.
 *
 * The primary client training screen: it shows ONLY the current (active, due)
 * workout with the shared execution form, rather than a passive dump of the
 * entire plan. The full prescription remains visible below via TrainingPlanDisplay
 * so nothing disappears. Progress is derived from the plan + session_logs; after
 * logging, progress re-derives and the UI advances WITHOUT regenerating the plan.
 */
export default function ClientTrainingSessionPage() {
  const { clientId, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const [plan, setPlan] = useState<TrainingPlan | null>(null);
  const [logs, setLogs] = useState<SessionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthLoading) return;
    if (!isAuthenticated || !clientId) {
      setLoading(false);
      setError('Please sign in to view your training.');
      return;
    }
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const [planResult, logsResult] = await Promise.all([
        fetchActiveTrainingPlan(clientId),
        fetchSessionLogs(clientId),
      ]);
      if (cancelled) return;
      if (planResult.error) {
        setError(planResult.error);
      } else if (!planResult.plan) {
        setPlan(null);
        setError('No active training plan yet. Your coach has not assigned one.');
      } else {
        setPlan(planResult.plan);
      }
      setLogs(logsResult.logs ?? []);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [clientId, isAuthenticated, isAuthLoading]);

  const progress = useMemo(
    () => (plan ? selectClientProgress(plan, logs) : null),
    [plan, logs],
  );

  const handleLogged = (log: Omit<SessionLog, 'clientId'>) => {
    // Optimistically record the saved execution; progress re-derives and the UI
    // advances to the next session in the same render (no plan regeneration).
    setLogs(prev => [...prev, { ...log, clientId: clientId ?? '' }]);
  };

  if (isAuthLoading || loading) {
    return (
      <Card className="p-12 shadow-card">
        <div className="flex flex-col items-center justify-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading your training...</p>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-6 shadow-card">
        <div className="flex flex-col items-center justify-center gap-4 py-8">
          <AlertCircle className="h-12 w-12 text-muted-foreground" />
          <h2 className="text-xl font-bold text-primary">Training</h2>
          <p className="text-muted-foreground text-center max-w-md">{error}</p>
        </div>
      </Card>
    );
  }

  if (!plan || !progress) {
    return (
      <Card className="p-6 shadow-card">
        <div className="flex flex-col items-center justify-center gap-4 py-8">
          <h2 className="text-xl font-bold text-primary">Training</h2>
          <p className="text-muted-foreground">No training plan available.</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-primary">Training</h2>

      {progress.isComplete ? (
        <Card className="p-8">
          <div className="flex flex-col items-center gap-3 text-center">
            <PartyPopper className="h-8 w-8 text-emerald-500" />
            <h3 className="text-xl font-bold text-foreground">Program complete! 🎉</h3>
            <p className="text-muted-foreground">
              You have logged every session in this plan. Your coach will set your next one up.
            </p>
          </div>
        </Card>
      ) : progress.activeSession ? (
        <>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">Week {progress.activeSession.weekNumber}</span>
            <span>·</span>
            <span>Day {progress.activeSession.dayNumber}</span>
          </div>
          <SessionExecutionForm
            key={progress.activeSession.id}
            clientId={clientId ?? ''}
            plan={plan}
            session={progress.activeSession}
            sessionLogs={logs}
            onLogged={handleLogged}
          />
        </>
      ) : (
        <Card className="p-8">
          <div className="flex flex-col items-center gap-3 text-center">
            <Lock className="h-8 w-8 text-muted-foreground" />
            <h3 className="text-xl font-bold text-foreground">Next workout is not due yet</h3>
            {progress.nextSession && (
              <>
                <p className="text-muted-foreground">
                  Next workout: Week {progress.nextSession.weekNumber} — Day {progress.nextSession.dayNumber}{' '}
                  ({progress.nextSession.name})
                </p>
                {progress.nextSessionDate && (
                  <p className="text-sm text-muted-foreground">
                    Scheduled for {weekdayNameOfIso(progress.nextSessionDate)}, {progress.nextSessionDate}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-2">
                  It becomes active on its scheduled day.
                </p>
              </>
            )}
          </div>
        </Card>
      )}

      {/* Full prescription overview — the whole plan remains visible to the client. */}
      <TrainingPlanDisplay plan={plan} />
    </div>
  );
}

