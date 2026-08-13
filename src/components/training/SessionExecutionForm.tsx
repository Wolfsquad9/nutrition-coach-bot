import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { ClipboardCheck } from 'lucide-react';
import { saveSessionLog } from '@/services/supabaseSessionLogService';
import { useToast } from '@/hooks/use-toast';
import type { TrainingPlan, WorkoutSession, SessionLog, ExerciseExecution } from '@/types';

type ExerciseLog = {
  exerciseId: string;
  load: number;
  rpe: number;
  notes: string;
  failedToComplete: boolean;
};

const DEFAULT_EXERCISE_LOG = (exerciseId: string): ExerciseLog => ({
  exerciseId,
  load: 0,
  rpe: 7,
  notes: '',
  failedToComplete: false,
});

interface SessionExecutionFormProps {
  clientId: string;
  plan: TrainingPlan;
  /** The session to log (should be the current/active, due session). */
  session: WorkoutSession;
  /** Prior execution history, used to prefill load/RPE for THIS session only. */
  sessionLogs?: SessionLog[];
  /** Called after a successful `saveSessionLog` so the caller re-derives progress. */
  onLogged: (log: Omit<SessionLog, 'clientId'>) => void;
}

/**
 * Shared client-execution UI.
 *
 * Renders the prescribed sets/reps/targets read-only alongside the editable
 * execution fields (actual load, RPE, failed, notes). Logging persists a single
 * `session_logs` row via the existing `save_session_log` RPC — it NEVER mutates
 * `training_plans.plan_data` (the prescription is immutable / coach-owned).
 */
export function SessionExecutionForm({
  clientId,
  plan,
  session,
  sessionLogs = [],
  onLogged,
}: SessionExecutionFormProps) {
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  // Seed per this session only, prefilled from the most recent execution log
  // that belongs to THIS session id (no cross-session data leakage).
  const [exerciseLogs, setExerciseLogs] = useState<Record<string, ExerciseLog>>(() => {
    const latest = sessionLogs.find(l => l.sessionId === session.id);
    return Object.fromEntries(
      session.exercises.map(ex => {
        const prior = latest?.exercises.find(e => e.exerciseId === ex.exercise.id);
        return [
          ex.exercise.id,
          {
            exerciseId: ex.exercise.id,
            load: prior?.load ?? 0,
            rpe: prior?.rpe ?? 7,
            notes: prior?.notes ?? '',
            failedToComplete: prior?.failed ?? false,
          },
        ];
      }),
    );
  });

  const updateLog = (exerciseId: string, patch: Partial<ExerciseLog>) => {
    setExerciseLogs(prev => ({
      ...prev,
      [exerciseId]: { ...prev[exerciseId], ...patch },
    }));
  };

  const handleSubmit = async () => {
    if (saving) return;
    setSaving(true);

    // Sets/reps come exclusively from the prescription (read-only). The only
    // user-entered execution fields are load and RPE, plus an optional failure
    // flag. Logging NEVER resaves the plan.
    const executions: ExerciseExecution[] = session.exercises.map(ex => {
      const log = exerciseLogs[ex.exercise.id] ?? DEFAULT_EXERCISE_LOG(ex.exercise.id);
      return {
        exerciseId: ex.exercise.id,
        exerciseName: ex.exercise.name,
        sets: ex.sets, // from the plan prescription
        reps: ex.reps, // from the plan prescription
        load: log.load,
        rpe: log.rpe,
        completed: !log.failedToComplete && log.load > 0,
        failed: log.failedToComplete,
        notes: log.notes || undefined,
      };
    });

    const anyFailed = executions.some(e => e.failed);

    const sessionLog: Omit<SessionLog, 'clientId'> = {
      planId: plan.id, // authoritative persisted training_plans.id UUID
      sessionId: session.id,
      sessionName: session.name,
      weekNumber: session.weekNumber,
      sessionIndex: session.dayNumber,
      completed: !anyFailed,
      failedToComplete: anyFailed,
      notes: anyFailed ? 'One or more exercises failed to complete.' : undefined,
      exercises: executions,
      loggedAt: new Date().toISOString(),
    };

    try {
      const result = await saveSessionLog(clientId, sessionLog);
      if (!result.success) {
        toast({ title: 'Save failed', description: result.error || 'Unable to persist session log.', variant: 'destructive' });
      } else {
        onLogged(sessionLog);
        toast({
          title: 'Session logged successfully',
          description: 'Execution saved. Plan prescription untouched.',
        });
      }
    } catch (err: unknown) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Unexpected error saving session log',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };


  return (
    <div className="space-y-6">
      {/* Prescription — read-only, from plan_data */}
      <Card className="p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Today's Workout</p>
            <h2 className="mt-2 text-2xl font-semibold text-foreground">{session.name}</h2>
          </div>
          <div className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
            {session.duration} min
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {session.exercises.map(exercise => (
            <div key={exercise.exercise.id} className="rounded-3xl border border-border bg-card p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-base font-semibold text-foreground">{exercise.exercise.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {exercise.exercise.primaryMuscles.join(', ')}
                  </p>
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


      {/* Execution — editable */}
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
          {session.exercises.map(exercise => {
            const log = exerciseLogs[exercise.exercise.id] ?? DEFAULT_EXERCISE_LOG(exercise.exercise.id);
            return (
              <div key={exercise.exercise.id} className="rounded-3xl border border-border bg-background p-4">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{exercise.exercise.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {exercise.sets} sets × {exercise.reps} @ {exercise.targetRPE}
                    </p>
                  </div>
                  <div className="space-y-2 text-right text-xs text-muted-foreground sm:text-left">
                    <div>Target: {exercise.targetLoad} {exercise.loadUnit}</div>
                    <div>Rest {exercise.rest}s</div>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor={`load-${exercise.exercise.id}`}>Load {exercise.loadUnit ?? 'kg'}</Label>
                    <Input
                      id={`load-${exercise.exercise.id}`}
                      type="number"
                      min={0}
                      step="any"
                      value={log.load || ''}
                      onChange={(event) => updateLog(exercise.exercise.id, { load: Number(event.target.value) })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`rpe-${exercise.exercise.id}`}>RPE (1-10)</Label>
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
                  <div className="flex items-end">
                    <label
                      htmlFor={`failed-${exercise.exercise.id}`}
                      className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-foreground"
                    >
                      <Checkbox
                        id={`failed-${exercise.exercise.id}`}
                        checked={log.failedToComplete}
                        onCheckedChange={(checked) =>
                          updateLog(exercise.exercise.id, { failedToComplete: checked === true })
                        }
                      />
                      <span>Failed to complete</span>
                    </label>
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
            Sets and reps are fixed by the plan. Enter the completed load and RPE for each exercise, and mark any you failed to complete.
          </div>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving...' : 'Log Session'}
          </Button>
        </div>
      </Card>
    </div>
  );
}

