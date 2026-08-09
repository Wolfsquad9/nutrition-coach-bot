/**
 * Training tab page — displays the persisted training plan and workout logging.
 */

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { fetchActiveTrainingPlan, saveTrainingPlan } from '@/services/supabaseTrainingPlanService';
import { applySessionResult } from '@/services/plan/progressionEngine';
import type { TrainingPlan, WorkoutExercise, SessionResult } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Calendar, ClipboardCheck, Sparkles } from 'lucide-react';

type ExerciseLog = {
  exerciseId: string;
  load: number;
  sets: number;
  reps: string;
  rpe: number;
  notes: string;
};

const DEFAULT_EXERCISE_LOG = (exerciseId: string): ExerciseLog => ({
  exerciseId,
  load: 0,
  sets: 0,
  reps: '',
  rpe: 7,
  notes: '',
});

const parseRepString = (value: string): number[] =>
  value
    .split(',')
    .map(item => Number(item.trim()))
    .filter(Number.isFinite)
    .map(Number);

export default function TrainingPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const [plan, setPlan] = useState<TrainingPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [exerciseLogs, setExerciseLogs] = useState<Record<string, ExerciseLog>>({});
  const { toast } = useToast();

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;

    async function loadPlan() {
      setLoading(true);
      setError(null);
      const result = await fetchActiveTrainingPlan(clientId);
      if (cancelled) return;
      if (result.error) {
        setError(result.error);
      } else if (!result.plan) {
        setError('No active training plan found for this client. Generate and save a plan first.');
      } else {
        setPlan(result.plan);
        setExerciseLogs(
          Object.fromEntries(
            result.plan.workouts.flatMap(workout => workout.exercises.map(ex => [
              ex.exercise.id,
              DEFAULT_EXERCISE_LOG(ex.exercise.id),
            ])),
          ),
        );
      }
      setLoading(false);
    }

    loadPlan();
    return () => { cancelled = true; };
  }, [clientId]);

  const currentWeekNumber = useMemo(() => {
    if (!plan) return 1;
    const stateWeek = plan.progressionState?.currentWeek;
    return stateWeek && stateWeek >= 1 && stateWeek <= plan.duration ? stateWeek : 1;
  }, [plan]);

  const currentSessionIndex = useMemo(() => {
    if (!plan) return 1;
    const stateIndex = plan.progressionState?.currentSessionIndex;
    return stateIndex && stateIndex >= 1 ? stateIndex : 1;
  }, [plan]);

  const currentWeek = useMemo(() => {
    if (!plan) return null;
    return plan.weeks.find(week => week.weekNumber === currentWeekNumber) ?? plan.weeks[0];
  }, [plan, currentWeekNumber]);

  const currentSession = useMemo(() => {
    if (!currentWeek) return null;
    return currentWeek.sessions[currentSessionIndex - 1] ?? currentWeek.sessions[0];
  }, [currentWeek, currentSessionIndex]);

  const nextSession = useMemo(() => {
    if (!plan || !currentSession) return null;
    const allSessions = plan.weeks.flatMap(week => week.sessions);
    const currentIndex = allSessions.findIndex(session => session.id === currentSession.id);
    return allSessions[currentIndex + 1] ?? null;
  }, [plan, currentSession]);

  const updateLog = (exerciseId: string, patch: Partial<ExerciseLog>) => {
    setExerciseLogs(prev => ({
      ...prev,
      [exerciseId]: {
        ...prev[exerciseId],
        ...patch,
      },
    }));
  };

  const handleSubmit = async () => {
    if (!plan || !currentSession || !clientId) return;
    setSaving(true);

    const exerciseResults = currentSession.exercises.map(ex => {
      const log = exerciseLogs[ex.exercise.id] ?? DEFAULT_EXERCISE_LOG(ex.exercise.id);
      const actualReps = parseRepString(log.reps);
      return {
        exerciseId: ex.exercise.id,
        exerciseName: ex.exercise.name,
        actualLoad: log.load,
        actualReps,
        actualSets: log.sets,
        rpe: log.rpe,
        completed: log.sets > 0 && actualReps.length > 0,
        notes: log.notes,
        timestamp: new Date().toISOString(),
      };
    });

    const sessionResult: SessionResult = {
      sessionId: currentSession.id,
      weekNumber: currentWeek?.weekNumber ?? 1,
      sessionIndex: currentSession.dayNumber,
      completed: true,
      actualDuration: currentSession.duration,
      notes: 'Logged via training workspace.',
      exercises: exerciseResults,
      timestamp: new Date().toISOString(),
    };

    try {
      const updatedPlan = applySessionResult(plan, currentSession, sessionResult);
      const saveResult = await saveTrainingPlan(clientId, updatedPlan);
      if (!saveResult.success) {
        toast({ title: 'Save failed', description: saveResult.error || 'Unable to persist training progress.', variant: 'destructive' });
      } else {
        setPlan(updatedPlan);
        toast({ title: 'Session logged', description: 'Next prescription has been updated.' });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unexpected error saving session result';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card className="p-8 shadow-card">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading training plan...</p>
        </div>
      </Card>
    );
  }

  if (error || !plan) {
    return (
      <Card className="p-6 shadow-card">
        <h2 className="text-2xl font-bold text-primary">Training</h2>
        <p className="text-muted-foreground mt-2">{error ?? 'No training plan is available.'}</p>
      </Card>
    );
  }

  if (!currentSession) {
    return (
      <Card className="p-6 shadow-card">
        <h2 className="text-2xl font-bold text-primary">Training</h2>
        <p className="text-muted-foreground mt-2">The training plan does not contain any sessions.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="bg-gradient-card border-border p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary/20 text-primary">🏋️</span>
              Training Workspace
            </div>
            <h1 className="mt-3 text-3xl font-semibold text-foreground">{plan.name}</h1>
            <p className="mt-2 text-sm text-muted-foreground max-w-2xl">{plan.objective}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl bg-background/90 p-4 shadow-sm border border-border">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Duration</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{plan.duration} weeks</p>
            </div>
            <div className="rounded-xl bg-background/90 p-4 shadow-sm border border-border">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Week</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{currentWeekNumber}/{plan.duration}</p>
            </div>
            <div className="rounded-xl bg-background/90 p-4 shadow-sm border border-border">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Phase</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{plan.phase}</p>
            </div>
            <div className="rounded-xl bg-background/90 p-4 shadow-sm border border-border">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Objective</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{currentWeek?.objective}</p>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.6fr]">
        <section className="space-y-6">
          <Card className="p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Today's Workout</p>
                <h2 className="mt-2 text-2xl font-semibold text-foreground">{currentSession.name}</h2>
              </div>
              <div className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">{currentSession.duration} min</div>
            </div>

            <div className="mt-6 space-y-4">
              {currentSession.exercises.map((exercise) => (
                <div key={exercise.exercise.id} className="rounded-3xl border border-border bg-card p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-base font-semibold text-foreground">{exercise.exercise.name}</p>
                      <p className="text-sm text-muted-foreground">{exercise.exercise.primaryMuscles.join(', ')}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                      <div>
                        <p className="text-muted-foreground">Sets</p>
                        <p className="font-semibold text-foreground">{exercise.sets}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Reps</p>
                        <p className="font-semibold text-foreground">{exercise.reps}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Load</p>
                        <p className="font-semibold text-foreground">
                          {exercise.targetLoad ?? '-'} {exercise.loadUnit ?? 'kg'}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">RPE</p>
                        <p className="font-semibold text-foreground">{exercise.targetRPE ?? 'RPE 7-8'}</p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-muted/10 p-3 text-sm text-muted-foreground">
                      <strong className="text-foreground">Rest:</strong> {exercise.rest}s
                    </div>
                    <div className="rounded-2xl bg-muted/10 p-3 text-sm text-muted-foreground">
                      <strong className="text-foreground">Progression:</strong> {exercise.progressionHint}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Session log</p>
                <h2 className="mt-2 text-xl font-semibold text-foreground">Enter actual performance</h2>
              </div>
              <div className="flex items-center gap-2 rounded-full bg-secondary/10 px-3 py-1 text-xs uppercase tracking-wide text-secondary">
                <ClipboardCheck className="h-4 w-4" /> Fast logging
              </div>
            </div>

            <div className="mt-6 space-y-4">
              {currentSession.exercises.map((exercise) => {
                const log = exerciseLogs[exercise.exercise.id] ?? DEFAULT_EXERCISE_LOG(exercise.exercise.id);
                return (
                  <div key={exercise.exercise.id} className="rounded-3xl border border-border bg-background p-4">
                    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{exercise.exercise.name}</p>
                        <p className="text-xs text-muted-foreground">{exercise.sets} sets × {exercise.reps} @ {exercise.targetRPE}</p>
                      </div>
                      <div className="space-y-2 text-right text-xs text-muted-foreground sm:text-left">
                        <div>Target: {exercise.targetLoad} {exercise.loadUnit}</div>
                        <div>Rest {exercise.rest}s</div>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-4">
                      <div className="space-y-2">
                        <Label htmlFor={`load-${exercise.exercise.id}`}>Load</Label>
                        <Input
                          id={`load-${exercise.exercise.id}`}
                          type="number"
                          value={log.load || ''}
                          onChange={(event) => updateLog(exercise.exercise.id, { load: Number(event.target.value) })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`sets-${exercise.exercise.id}`}>Sets</Label>
                        <Input
                          id={`sets-${exercise.exercise.id}`}
                          type="number"
                          value={log.sets || ''}
                          onChange={(event) => updateLog(exercise.exercise.id, { sets: Number(event.target.value) })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`reps-${exercise.exercise.id}`}>Reps</Label>
                        <Input
                          id={`reps-${exercise.exercise.id}`}
                          value={log.reps}
                          placeholder="10,10,8"
                          onChange={(event) => updateLog(exercise.exercise.id, { reps: event.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`rpe-${exercise.exercise.id}`}>RPE</Label>
                        <Input
                          id={`rpe-${exercise.exercise.id}`}
                          type="number"
                          step="0.5"
                          min={1}
                          max={10}
                          value={log.rpe}
                          onChange={(event) => updateLog(exercise.exercise.id, { rpe: Number(event.target.value) })}
                        />
                      </div>
                    </div>

                    <div className="mt-4 space-y-2">
                      <Label htmlFor={`notes-${exercise.exercise.id}`}>Notes</Label>
                      <Textarea
                        id={`notes-${exercise.exercise.id}`}
                        value={log.notes}
                        rows={2}
                        onChange={(event) => updateLog(exercise.exercise.id, { notes: event.target.value })}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-muted-foreground">
                Enter the completed load, completed sets, and set-by-set reps. Use the RPE field to capture how the final set felt.
              </div>
              <Button onClick={handleSubmit} disabled={saving}>
                {saving ? 'Saving...' : 'Log Session'}
              </Button>
            </div>
          </Card>
        </section>

        <aside className="space-y-6">
          <Card className="p-6">
            <div className="flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-emerald-500" />
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Future prescription</p>
                <h2 className="mt-1 text-lg font-semibold text-foreground">Next session preview</h2>
              </div>
            </div>
            <div className="mt-5 space-y-4">
              {nextSession ? (
                <div>
                  <p className="text-sm text-muted-foreground">Upcoming session</p>
                  <p className="mt-2 text-base font-medium text-foreground">{nextSession.name}</p>
                  <p className="text-sm text-muted-foreground">{nextSession.exercises.length} exercises • {nextSession.duration} min</p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">This is the final session in the current plan.</p>
              )}
            </div>
            {nextSession && (
              <div className="mt-6 space-y-3">
                {nextSession.exercises.map(exercise => (
                  <div key={exercise.exercise.id} className="rounded-2xl border border-border bg-background p-3">
                    <p className="font-semibold text-foreground">{exercise.exercise.name}</p>
                    <p className="text-sm text-muted-foreground">{exercise.sets}×{exercise.reps} @ {exercise.targetLoad} {exercise.loadUnit}</p>
                    <p className="text-xs text-muted-foreground">Target: {exercise.targetRPE}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Week navigation</h2>
            </div>
            <div className="mt-4 grid grid-cols-4 gap-2">
              {plan.weeks.map(week => (
                <div
                  key={week.weekNumber}
                  className={`rounded-2xl border p-3 text-center text-sm ${week.weekNumber === currentWeekNumber ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background text-muted-foreground'}`}
                >
                  Week {week.weekNumber}
                </div>
              ))}
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
