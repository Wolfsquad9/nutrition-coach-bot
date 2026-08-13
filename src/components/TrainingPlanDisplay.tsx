import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dumbbell, Calendar, Clock, TrendingUp } from 'lucide-react';
import type { TrainingPlan, WorkoutSession } from '@/types';

/**
 * Displays the canonical persisted `TrainingPlan` (training_plans.plan_data).
 * Uses the plan directly — no reduced copy is created, so target loads, units,
 * progression info, session duration and exercise metadata are preserved for
 * the client view.
 */
interface TrainingPlanDisplayProps {
  plan: TrainingPlan;
}

const DAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

function loadLabel(load: number | undefined, unit: string | undefined): string {
  if (load === undefined || load === null) {
    return unit === 'bodyweight' ? 'Bodyweight' : '—';
  }
  return `${load} ${unit ?? 'kg'}`;
}

export function TrainingPlanDisplay({ plan }: TrainingPlanDisplayProps) {
  const sessions: WorkoutSession[] = Array.isArray(plan.workouts) && plan.workouts.length > 0
    ? plan.workouts
    : plan.weeks.flatMap(week => week.sessions);

  return (
    <Card className="bg-gradient-card border-border">
      <CardHeader className="border-b border-border">
        <CardTitle className="flex items-center gap-2 text-foreground">
          <Dumbbell className="h-5 w-5 text-accent" />
          Plan d'Entraînement
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6 space-y-6">
        {/* Plan Summary */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="p-3 rounded-lg bg-accent/10 border border-accent/20 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Split</p>
            <p className="text-lg font-bold text-accent">{plan.split}</p>
          </div>
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Fréquence</p>
            <p className="text-lg font-bold text-primary">{plan.frequency}x/semaine</p>
          </div>
          <div className="p-3 rounded-lg bg-success/10 border border-success/20 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Durée</p>
            <p className="text-lg font-bold text-success">{plan.duration} sem.</p>
          </div>
          <div className="p-3 rounded-lg bg-info/10 border border-info/20 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Phase</p>
            <p className="text-lg font-bold text-info capitalize">{plan.phase}</p>
          </div>
        </div>

        {plan.objective && (
          <p className="text-sm text-muted-foreground">{plan.objective}</p>
        )}

        {/* Weekly Overview */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="h-4 w-4 text-primary" />
            <h4 className="text-sm font-semibold text-foreground">Programme Hebdomadaire</h4>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {DAY_LABELS.map((label, i) => {
              const workout = sessions.find(w => w.dayNumber === i + 1);
              return (
                <div
                  key={`${label}-${i}-${plan.id}`}
                  className={`p-2 rounded text-center text-xs ${
                    workout
                      ? 'bg-primary/20 border border-primary/40 text-primary font-semibold'
                      : 'bg-muted/30 border border-border text-muted-foreground'
                  }`}
                >
                  <div className="font-bold">{label}</div>
                  <div className="text-[10px] mt-1 truncate">
                    {workout ? workout.name.slice(0, 4) : 'Repos'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {/* Detailed Sessions */}
        <div>
          <h4 className="text-sm font-semibold text-foreground mb-3">Séances Détaillées</h4>
          <ScrollArea className="h-[320px] pr-4">
            <div className="space-y-3">
              {sessions.map((workout, idx) => (
                <div key={workout.id ?? idx} className="p-4 rounded-lg bg-card border border-border hover:bg-card-hover transition-colors">
                  <div className="flex items-center justify-between mb-3 gap-2">
                    <div>
                      <h5 className="font-semibold text-foreground">
                        Jour {workout.dayNumber}: {workout.name}
                      </h5>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {workout.duration} min • {workout.exercises.length} exercices
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0">
                      Semaine {workout.weekNumber}
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    {workout.exercises.map((ex, exIdx) => (
                      <div key={`${workout.id ?? idx}-${ex.exercise.id ?? exIdx}`} className="p-2 rounded bg-muted/50">
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <span className="text-foreground font-medium">{ex.exercise.name}</span>
                          <span className="text-muted-foreground text-xs whitespace-nowrap">
                            {ex.sets} × {ex.reps}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          {(ex.exercise.primaryMuscles?.length > 0 || ex.exercise.difficulty) && (
                            <span>
                              {[ex.exercise.difficulty, ...(ex.exercise.primaryMuscles ?? [])].filter(Boolean).join(' · ')}
                            </span>
                          )}
                          <span>Charge cible: {loadLabel(ex.targetLoad, ex.loadUnit)}</span>
                          {ex.targetRPE && <span>Cible RPE: {ex.targetRPE}</span>}
                          {ex.progressionHint && <span>Progression: {ex.progressionHint}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Progression */}
        <div className="p-4 rounded-lg bg-info/10 border border-info/20">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-info" />
            <h5 className="text-sm font-semibold text-info">Progression</h5>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {plan.progressionScheme || 'Augmentez progressivement la charge ou les répétitions chaque semaine'}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
