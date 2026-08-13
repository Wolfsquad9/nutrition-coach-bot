/**
 * Training tab page — displays the persisted training plan and workout logging.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAppLayout } from '@/hooks/useAppLayout';
import { fetchActiveTrainingPlan, saveTrainingPlan } from '@/services/supabaseTrainingPlanService';
import { fetchSessionLogs } from '@/services/supabaseSessionLogService';
import { generateDynamicTrainingPlan } from '@/services/plan/workoutGenerator';
import { selectClientProgress } from '@/services/plan/progressSelector';
import { SessionExecutionForm } from '@/components/training/SessionExecutionForm';
import {
  buildTrainingPlanInput,
  EQUIPMENT_OPTIONS,
  TRAINING_DAYS_OPTIONS,
  TRAINING_STYLE_OPTIONS,
} from '@/services/plan/trainingInput';
import type { TrainingPlan, SessionLog, Client } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Calendar, Sparkles, RefreshCw } from 'lucide-react';

export default function TrainingPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const { activeClientId: activeClientIdFromContext, activeClient } = useAppLayout();
  const clientIdToUse = clientId ?? activeClientIdFromContext;
  const [plan, setPlan] = useState<TrainingPlan | null>(null);
  const [sessionLogs, setSessionLogs] = useState<SessionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [showQuestionnaire, setShowQuestionnaire] = useState(false);
  const { toast } = useToast();
  const canGeneratePlan = Boolean(clientIdToUse && activeClient);

  // ---- Training questionnaire state. sessionDuration, preferredTrainingStyle
  // and equipment belong to the Training questionnaire (not the persistent
  // client profile), so they live only here. Missing values are never
  // silently replaced with arbitrary training defaults. ----
  const [trainingExperience, setTrainingExperience] = useState<Client['trainingExperience'] | undefined>(undefined);
  const [trainingDaysPerWeek, setTrainingDaysPerWeek] = useState<number | undefined>(undefined);
  const [sessionDuration, setSessionDuration] = useState<number | undefined>(undefined);
  const [preferredTrainingStyle, setPreferredTrainingStyle] = useState<Client['preferredTrainingStyle'] | undefined>(undefined);
  const [equipment, setEquipment] = useState<string[]>([]);

  // Load persisted training-profile values into the questionnaire once per
  // client. Fields with no persisted value stay empty until completed.
  const loadedClientId = useRef<string | null>(null);
  useEffect(() => {
    if (!activeClient) return;
    if (loadedClientId.current === activeClient.id) return;
    loadedClientId.current = activeClient.id;
    setTrainingExperience(activeClient.trainingExperience ?? undefined);
    setTrainingDaysPerWeek(activeClient.trainingDaysPerWeek ?? undefined);
    setSessionDuration(activeClient.sessionDuration ?? undefined);
    setPreferredTrainingStyle(activeClient.preferredTrainingStyle ?? undefined);
    setEquipment(activeClient.equipment ?? []);
  }, [activeClient]);

  useEffect(() => {
    if (!clientIdToUse) return;
    let cancelled = false;

    async function loadPlan() {
      setLoading(true);
      setError(null);
      const [planResult, logsResult] = await Promise.all([
        fetchActiveTrainingPlan(clientIdToUse),
        fetchSessionLogs(clientIdToUse),
      ]);
      if (cancelled) return;
      if (planResult.error) {
        setError(planResult.error);
      } else if (!planResult.plan) {
        setError('No active training plan found for this client. Generate and save a plan first.');
      } else {
        setPlan(planResult.plan);
        // Reload keeps the existing active plan and its saved execution history.
        // Progress is derived from session_logs (scoped by plan_id), never from
        // a regenerated plan or stale cached progression bookkeeping.
        setSessionLogs(logsResult.logs ?? []);
        if (logsResult.error) {
          console.warn('[TrainingPage] failed to load saved execution data:', logsResult.error);
        }
      }
      setLoading(false);
    }

    loadPlan();
    return () => { cancelled = true; };
  }, [clientIdToUse]);

  const toggleEquipment = (item: string) => {
    setEquipment(prev => prev.includes(item) ? prev.filter(i => i !== item) : [...prev, item]);
  };

  const handleGeneratePlan = async () => {
    if (!clientIdToUse || !activeClient) return;
    setIsGeneratingPlan(true);
    setError(null);

    try {
      const { input, missing } = buildTrainingPlanInput(activeClient, {
        trainingExperience,
        trainingDaysPerWeek,
        sessionDuration,
        preferredTrainingStyle,
        equipment,
      });
      if (!input) {
        setError(`Complete the training questionnaire to generate a plan. Missing: ${missing.join(', ')}.`);
        return;
      }

      const generatedPlan = generateDynamicTrainingPlan(input);
      const saveResult = await saveTrainingPlan(clientIdToUse, generatedPlan);
      if (!saveResult.success) {
        setError(saveResult.error || 'Failed to save generated training plan.');
        return;
      }

      // `save_training_plan` generates the authoritative `training_plans.id`
      // UUID and returns it as `planId`. OVERRIDE the generated placeholder so
      // the in-memory plan references the real persisted FK — otherwise the fake
      // `plan.id` would be sent as `p_plan_id` (a UUID column) when logging a
      // session, and PostgreSQL rejects it (22P02 invalid UUID).
      const savedPlan = saveResult.planId
        ? { ...generatedPlan, id: saveResult.planId }
        : generatedPlan;

      setPlan(savedPlan);
      setShowQuestionnaire(false);
      // A freshly generated plan has no execution history yet — progress starts
      // at the first prescribed session. The plan itself is never rewritten when
      // the client later logs sessions.
      setSessionLogs([]);
      toast({
        title: 'Training plan generated',
        description: 'The training plan is saved and ready in the training workspace.',
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to generate training plan.');
    } finally {
      setIsGeneratingPlan(false);
    }
  };

  // Client progress is DERIVED from the prescription + session_logs (scoped by
  // plan_id). It never reads stale cached progression bookkeeping.
  const progress = useMemo(
    () => (plan ? selectClientProgress(plan, sessionLogs) : null),
    [plan, sessionLogs],
  );
  const activeSession = progress?.activeSession ?? null;
  const nextSession = progress?.nextSession ?? null;
  const currentWeekNumber = progress?.currentWeek ?? 1;

  const currentWeek = useMemo(
    () => plan?.weeks.find(week => week.weekNumber === currentWeekNumber) ?? plan?.weeks[0] ?? null,
    [plan, currentWeekNumber],
  );

  const handleLogged = (log: Omit<SessionLog, 'clientId'>) => {
    // Optimistically record the saved execution; progress re-derives and the UI
    // advances to the next workout in the same render (no plan regeneration).
    setSessionLogs(prev => [...prev, { ...log, clientId: clientIdToUse ?? '' }]);
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

  if (error || !plan || showQuestionnaire) {
    return (
      <Card className="p-6 shadow-card">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold text-primary">Training</h2>
              <p className="text-muted-foreground mt-2">
                {error ?? (plan ? 'Update the questionnaire, then regenerate the plan.' : 'No active training plan for this client. Complete the questionnaire to generate one.')}
              </p>
            </div>
            {plan && !showQuestionnaire && (
              <Button variant="outline" onClick={() => setShowQuestionnaire(true)}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Regenerate Plan
              </Button>
            )}
          </div>

          {/* Training questionnaire — the Training tab owns these inputs. */}
          <div className="mt-2 space-y-5 rounded-2xl border border-border bg-card p-5">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Training questionnaire</h3>
              <p className="text-sm text-muted-foreground">Complete the inputs below. Generation only happens when you press Generate.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <Label htmlFor="q-session-duration">Session duration (minutes)</Label>
                <Input
                  id="q-session-duration"
                  type="number"
                  min={15}
                  max={180}
                  value={sessionDuration ?? ''}
                  onChange={e => setSessionDuration(e.target.value === '' ? undefined : parseInt(e.target.value, 10) || undefined)}
                />
              </div>

              <div>
                <Label htmlFor="q-training-days">Training days / week</Label>
                <Select value={trainingDaysPerWeek ? String(trainingDaysPerWeek) : ''} onValueChange={v => setTrainingDaysPerWeek(parseInt(v, 10))}>
                  <SelectTrigger id="q-training-days" className="mt-1"><SelectValue placeholder="Select days" /></SelectTrigger>
                  <SelectContent className="bg-background border border-border z-50">
                    {TRAINING_DAYS_OPTIONS.map(days => (
                      <SelectItem key={days} value={String(days)}>{days} days</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="q-experience">Training experience</Label>
                <Select value={trainingExperience ?? ''} onValueChange={v => setTrainingExperience(v as Client['trainingExperience'])}>
                  <SelectTrigger id="q-experience" className="mt-1"><SelectValue placeholder="Select experience" /></SelectTrigger>
                  <SelectContent className="bg-background border border-border z-50">
                    <SelectItem value="beginner">Beginner</SelectItem>
                    <SelectItem value="intermediate">Intermediate</SelectItem>
                    <SelectItem value="advanced">Advanced</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="q-style">Training style</Label>
                <Select value={preferredTrainingStyle ?? ''} onValueChange={v => setPreferredTrainingStyle(v as Client['preferredTrainingStyle'])}>
                  <SelectTrigger id="q-style" className="mt-1"><SelectValue placeholder="Select style" /></SelectTrigger>
                  <SelectContent className="bg-background border border-border z-50">
                    {TRAINING_STYLE_OPTIONS.map(style => (
                      <SelectItem key={style} value={style} className="capitalize">{style}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="q-goal">Primary goal</Label>
                <div id="q-goal" className="mt-1 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-foreground capitalize">
                  {activeClient?.primaryGoal ? activeClient.primaryGoal.replace('_', ' ') : 'Not set on client profile'}
                </div>
              </div>
            </div>

            <div>
              <Label>Available equipment</Label>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {EQUIPMENT_OPTIONS.map(item => (
                  <label key={item} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-foreground">
                    <Checkbox
                      checked={equipment.includes(item)}
                      onCheckedChange={() => toggleEquipment(item)}
                      className="border-border"
                    />
                    <span className="capitalize">{item.replace('-', ' ')}</span>
                  </label>
                ))}
              </div>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="flex items-center justify-end gap-3">
              {plan && showQuestionnaire && (
                <Button type="button" variant="ghost" onClick={() => { setShowQuestionnaire(false); setError(null); }}>
                  Cancel
                </Button>
              )}
              <Button onClick={handleGeneratePlan} disabled={!canGeneratePlan || isGeneratingPlan}>
                {isGeneratingPlan ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generate Plan
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  if (!plan.weeks.some(week => week.sessions.length > 0)) {
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
          {activeSession ? (
            <SessionExecutionForm
              key={activeSession.id}
              clientId={clientIdToUse || ''}
              plan={plan}
              session={activeSession}
              sessionLogs={sessionLogs}
              onLogged={handleLogged}
            />
          ) : (
            <Card className="p-8 text-center">
              <h2 className="text-xl font-bold text-foreground">
                {nextSession ? 'Next workout is not due yet' : 'Program complete'}
              </h2>
              {nextSession ? (
                <p className="mt-2 text-muted-foreground">
                  Next workout: {nextSession.name} — it becomes active on its scheduled day.
                </p>
              ) : (
                <p className="mt-2 text-muted-foreground">
                  You have logged every prescribed session in this plan.
                </p>
              )}
            </Card>
          )}
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
