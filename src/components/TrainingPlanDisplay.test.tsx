import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TrainingPlanDisplay } from './TrainingPlanDisplay';
import type { TrainingPlan } from '@/types';

const canonicalPlan: TrainingPlan = {
  id: 'plan-c1',
  clientId: 'client-1',
  name: 'Upper/Lower Program',
  objective: 'Build lean muscle with structured volume and progression.',
  duration: 6,
  frequency: 4,
  split: 'upper_lower',
  phase: 'hypertrophy',
  phases: [{ key: 'foundation', name: 'Foundation', objective: 'base', startWeek: 1, endWeek: 6 }],
  weeks: [
    {
      weekNumber: 1,
      phase: 'foundation',
      objective: 'base',
      sessions: [
        {
          id: 's1',
          weekNumber: 1,
          dayNumber: 1,
          sessionType: 'upper',
          name: "Upper Body • Week 1",
          duration: 75,
          notes: 'warm up well',
          exercises: [
            {
              exercise: {
                id: 'ex-1',
                name: 'Barbell Bench Press',
                category: 'chest',
                equipment: ['barbell'],
                difficulty: 'intermediate',
                primaryMuscles: ['chest', 'triceps'],
                secondaryMuscles: ['front deltoids'],
                instructions: ['Press and control the descent'],
              },
              sets: 4,
              reps: '8-10',
              rest: 90,
              intensity: 'RPE 7-8',
              targetRPE: 'RPE 7-8',
              targetLoad: 82.5,
              loadUnit: 'kg',
              progressionHint: 'Add 2.5kg when 10 reps are completed at RPE < 8',
            },
          ],
        },
      ],
    },
  ],
  workouts: [],
  progressionScheme: 'Autoregulated double progression with RPE-based load decisions.',
  programDescription: 'desc',
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('TrainingPlanDisplay (client view)', () => {
  it('preserves canonical plan information (loads, units, duration, progression, metadata)', () => {
    render(<TrainingPlanDisplay plan={canonicalPlan} />);

    // Split / frequency / duration / phase summary from the canonical plan.
    expect(screen.getByText('upper_lower')).toBeInTheDocument();
    expect(screen.getByText('4x/semaine')).toBeInTheDocument();
    expect(screen.getByText('6 sem.')).toBeInTheDocument();
    expect(screen.getByText('hypertrophy')).toBeInTheDocument();
    expect(screen.getByText(/Build lean muscle with structured volume/i)).toBeInTheDocument();

    // Session duration from the canonical plan.
    expect(screen.getByText(/75 min/)).toBeInTheDocument();

    // Exercise metadata (muscles) is preserved.
    expect(screen.getByText(/intermediate · chest · triceps/)).toBeInTheDocument();

    // Target load + unit are preserved.
    expect(screen.getByText('Charge cible: 82.5 kg')).toBeInTheDocument();

    // Progression info is preserved both per-exercise and plan-level.
    expect(screen.getByText(/Cible RPE: RPE 7-8/)).toBeInTheDocument();
    expect(screen.getByText(/Progression: Add 2.5kg when 10 reps/)).toBeInTheDocument();
    expect(screen.getByText(/Autoregulated double progression/)).toBeInTheDocument();
  });
});