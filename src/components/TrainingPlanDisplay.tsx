import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dumbbell, Calendar } from 'lucide-react';

interface TrainingPlanDisplayProps {
  plan: {
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
  };
}

export function TrainingPlanDisplay({ plan }: TrainingPlanDisplayProps) {
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
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-accent/10 border border-accent/20 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Split</p>
            <p className="text-lg font-bold text-accent">{plan.split}</p>
          </div>
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Fréquence</p>
            <p className="text-lg font-bold text-primary">{plan.sessions}x/semaine</p>
          </div>
        </div>

        {/* Weekly Overview */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="h-4 w-4 text-primary" />
            <h4 className="text-sm font-semibold text-foreground">Programme Hebdomadaire</h4>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array(7).fill(null).map((_, i) => {
              const workout = plan.workouts.find(w => w.day === i + 1);
              return (
                <div
                  key={i}
                  className={`p-2 rounded text-center text-xs ${
                    workout
                      ? 'bg-primary/20 border border-primary/40 text-primary font-semibold'
                      : 'bg-muted/30 border border-border text-muted-foreground'
                  }`}
                >
                  <div className="font-bold">{['L', 'M', 'M', 'J', 'V', 'S', 'D'][i]}</div>
                  <div className="text-[10px] mt-1 truncate">
                    {workout ? workout.name.slice(0, 4) : 'Repos'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Workout Sessions */}
        <div>
          <h4 className="text-sm font-semibold text-foreground mb-3">Séances Détaillées</h4>
          <ScrollArea className="h-[280px] pr-4">
            <div className="space-y-3">
              {plan.workouts.map((workout, idx) => (
                <div key={idx} className="p-4 rounded-lg bg-card border border-border hover:bg-card-hover transition-colors">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h5 className="font-semibold text-foreground">Jour {workout.day}: {workout.name}</h5>
                      <p className="text-xs text-muted-foreground">{workout.exercises.length} exercices</p>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      Session {idx + 1}
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    {workout.exercises.map((ex, exIdx) => (
                      <div key={exIdx} className="flex items-center justify-between text-sm p-2 rounded bg-muted/50">
                        <span className="text-foreground font-medium">{ex.name}</span>
                        <span className="text-muted-foreground text-xs">
                          {ex.sets} × {ex.reps}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Progressive Overload Note */}
        <div className="p-4 rounded-lg bg-info/10 border border-info/20">
          <h5 className="text-sm font-semibold text-info mb-1">Progression</h5>
          <p className="text-xs text-muted-foreground">
            Augmentez progressivement la charge ou les répétitions chaque semaine
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
