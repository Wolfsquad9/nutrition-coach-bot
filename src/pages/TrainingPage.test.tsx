import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TrainingPage from './TrainingPage';
import { sampleClient } from '@/data/sampleData';
import type { Client, TrainingPlan } from '@/types';

const { mockedActiveClientRef } = vi.hoisted(() => ({
  mockedActiveClientRef: { current: null as Client | null },
}));

vi.mock('react-router-dom', () => ({
  useParams: () => ({ clientId: 'client-1' }),
}));

vi.mock('@/hooks/useAppLayout', () => ({
  useAppLayout: () => ({ activeClientId: 'client-1', activeClient: mockedActiveClientRef.current }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/services/supabaseTrainingPlanService', () => ({
  fetchActiveTrainingPlan: vi.fn(),
  saveTrainingPlan: vi.fn(),
}));

vi.mock('@/services/supabaseSessionLogService', () => ({
  fetchSessionLogs: vi.fn(),
  saveSessionLog: vi.fn(),
}));

vi.mock('@/services/plan/workoutGenerator', () => ({
  generateDynamicTrainingPlan: vi.fn(),
}));

import { fetchActiveTrainingPlan, saveTrainingPlan } from '@/services/supabaseTrainingPlanService';
import { fetchSessionLogs, saveSessionLog } from '@/services/supabaseSessionLogService';
import { generateDynamicTrainingPlan } from '@/services/plan/workoutGenerator';

const fixturePlan: TrainingPlan = {
  id: 'plan-p1',
  clientId: 'client-1',
  name: 'Upper/Lower Program',
  objective: 'Build lean muscle',
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
          name: 'Upper Body • Week 1',
          duration: 75,
          exercises: [
            {
              exercise: {
                id: 'ex-1',
                name: 'Barbell Bench Press',
                category: 'chest',
                equipment: ['barbell'],
                difficulty: 'intermediate',
                primaryMuscles: ['chest'],
                secondaryMuscles: [],
                instructions: [],
              },
              sets: 4,
              reps: '8-10',
              rest: 90,
              targetRPE: 'RPE 7-8',
              targetLoad: 60,
              loadUnit: 'kg',
            },
          ],
        },
      ],
    },
  ],
  workouts: [],
  progressionScheme: 'Autoregulated double progression',
  programDescription: 'desc',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const mockFetchActiveTrainingPlan = vi.mocked(fetchActiveTrainingPlan);
const mockSaveTrainingPlan = vi.mocked(saveTrainingPlan);
const mockGenerateDynamicTrainingPlan = vi.mocked(generateDynamicTrainingPlan);
const mockFetchSessionLogs = vi.mocked(fetchSessionLogs);
const mockSaveSessionLog = vi.mocked(saveSessionLog);

beforeEach(() => {
  vi.clearAllMocks();
  mockedActiveClientRef.current = {
    ...sampleClient,
    id: 'client-1',
    trainingExperience: 'intermediate',
    trainingDaysPerWeek: 4,
    sessionDuration: undefined,
    preferredTrainingStyle: undefined,
    equipment: undefined,
  };
  mockFetchActiveTrainingPlan.mockResolvedValue({ plan: null, error: null });
  mockSaveTrainingPlan.mockResolvedValue({ success: true, error: null, planId: 'plan-p1' });
  mockGenerateDynamicTrainingPlan.mockReturnValue(fixturePlan);
  mockFetchSessionLogs.mockResolvedValue({ logs: [], error: null });
  mockSaveSessionLog.mockResolvedValue({ success: true, error: null, sessionLogId: 'log-1' });
});

describe('TrainingPage generation authority', () => {
  it('does not generate on load and refuses to generate with incomplete input', async () => {
    render(<TrainingPage />);

    // Questionnaire is rendered; generation is an explicit action only.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Generate Plan/i })).toBeInTheDocument();
    });
    expect(mockGenerateDynamicTrainingPlan).not.toHaveBeenCalled();

    // Incomplete questionnaire (style/equipment/session duration missing) →
    // generation is rejected and the generator is never invoked.
    fireEvent.click(screen.getByRole('button', { name: /Generate Plan/i }));
    await waitFor(() => {
      expect(mockGenerateDynamicTrainingPlan).not.toHaveBeenCalled();
    });
    expect(screen.getAllByText(/sessionDuration/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/preferredTrainingStyle/i).length).toBeGreaterThan(0);
  });

  it('generates only on explicit action and passes the complete validated input to the generator', async () => {
    // Pre-fill training style from the persisted client profile (loaded into
    // the questionnaire); session duration and equipment are completed in the
    // questionnaire UI.
    mockedActiveClientRef.current = {
      ...sampleClient,
      id: 'client-1',
      trainingExperience: 'intermediate',
      trainingDaysPerWeek: 4,
      preferredTrainingStyle: 'hypertrophy',
      sessionDuration: undefined,
      equipment: undefined,
    };
    render(<TrainingPage />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Generate Plan/i })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Session duration (minutes)'), { target: { value: '75' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /barbell/i }));

    expect(mockGenerateDynamicTrainingPlan).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Generate Plan/i }));

    await waitFor(() => {
      expect(mockGenerateDynamicTrainingPlan).toHaveBeenCalledTimes(1);
    });

    const input = mockGenerateDynamicTrainingPlan.mock.calls[0][0];
    expect(input).toEqual({
      id: 'client-1',
      primaryGoal: 'recomposition',
      trainingExperience: 'intermediate',
      trainingDaysPerWeek: 4,
      sessionDuration: 75,
      preferredTrainingStyle: 'hypertrophy',
      equipment: ['barbell'],
      equipmentAvailable: sampleClient.equipmentAvailable,
    });

    // The generated plan is persisted to training_plans.plan_data.
    expect(mockSaveTrainingPlan).toHaveBeenCalledWith('client-1', fixturePlan);
  });
});

// --- Coach = prescription + review. The coach must NEVER see the client's
// execution/logging workflow (that belongs to the CLIENT Training tab). -------
describe('TrainingPage coach review (no client execution UI)', () => {
  const oneDoneLog = {
    id: 'log-1',
    clientId: 'client-1',
    planId: 'plan-p1',
    sessionId: 's1',
    sessionName: 'Upper Body • Week 1',
    weekNumber: 1,
    sessionIndex: 1,
    completed: true,
    failedToComplete: false,
    exercises: [{ exerciseId: 'ex-1', exerciseName: 'Barbell Bench Press', sets: 4, reps: '8-10', load: 62.5, rpe: 8, completed: true, failed: false }],
    loggedAt: '2026-01-02T00:00:00.000Z',
  };

  it('renders read-only prescription with NO execution/log controls', async () => {
    mockFetchActiveTrainingPlan.mockResolvedValue({ plan: fixturePlan, error: null });
    render(<TrainingPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /^Prescription$/i })).toBeInTheDocument();
    });

    // Coach sees the prescribed workout read-only...
    expect(screen.getByText(/Barbell Bench Press/i)).toBeInTheDocument();
    // ...and a read-only review panel, never the client logging form.
    expect(screen.getByRole('heading', { name: /^Session history$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Log Session/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Load/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/RPE/i)).not.toBeInTheDocument();
    expect(mockSaveSessionLog).not.toHaveBeenCalled();
  });

  it('shows read-only session history from session_logs (no mutation controls)', async () => {
    mockFetchActiveTrainingPlan.mockResolvedValue({ plan: fixturePlan, error: null });
    mockFetchSessionLogs.mockResolvedValue({ logs: [oneDoneLog], error: null });
    render(<TrainingPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /^Session history$/i })).toBeInTheDocument();
    });
    expect(screen.getByText(/Upper Body • Week 1/i)).toBeInTheDocument();
    expect(screen.getByText(/load 62.5/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Log Session/i })).not.toBeInTheDocument();
  });

  it('reports a fully-logged plan as complete without any execution controls', async () => {
    mockFetchActiveTrainingPlan.mockResolvedValue({ plan: fixturePlan, error: null });
    mockFetchSessionLogs.mockResolvedValue({ logs: [oneDoneLog], error: null });
    render(<TrainingPage />);

    await waitFor(() => {
      expect(screen.getByText(/plan is complete/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /Log Session/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Load/i)).not.toBeInTheDocument();
  });
});