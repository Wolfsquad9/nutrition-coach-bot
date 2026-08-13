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
  // No persisted questionnaire fields for session duration/style/equipment —
  // they belong to the Training tab and must stay empty (no arbitrary
  // defaults) until the coach completes them.
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

    // Fill the questionnaire (session duration input + equipment checkbox).
    fireEvent.change(screen.getByLabelText('Session duration (minutes)'), { target: { value: '75' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /barbell/i }));

    // Still nothing generated until the explicit action.
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

describe('TrainingPage session logging (decoupled execution model)', () => {
  it('logs session execution data without mutating or resaving the training plan', async () => {
    mockFetchActiveTrainingPlan.mockResolvedValue({ plan: fixturePlan, error: null });
    render(<TrainingPage />);

    // The workspace is rendered (an active plan exists) — the user is never
    // sent back through the questionnaire, and no regeneration happens.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Log Session/i })).toBeInTheDocument();
    });
    expect(mockGenerateDynamicTrainingPlan).not.toHaveBeenCalled();

    // The only required user-entered execution fields are load and RPE.
    fireEvent.change(screen.getByLabelText(/^Load/i), { target: { value: '62.5' } });

    fireEvent.click(screen.getByRole('button', { name: /Log Session/i }));

    await waitFor(() => {
      expect(mockSaveSessionLog).toHaveBeenCalledTimes(1);
    });

    const [clientId, sessionLog] = mockSaveSessionLog.mock.calls[0];
    expect(clientId).toBe('client-1');
    expect(sessionLog.planId).toBe('plan-p1');
    expect(sessionLog.sessionId).toBe('s1');

    // Sets/reps come EXCLUSIVELY from the plan prescription (read-only).
    const exec = sessionLog.exercises[0];
    expect(exec.sets).toBe(4);
    expect(exec.reps).toBe('8-10');
    expect(exec.load).toBe(62.5);
    expect(exec.completed).toBe(true);
    expect(exec.failed).toBe(false);

    // Logging a session never writes to / replaces the training plan.
    expect(mockSaveTrainingPlan).not.toHaveBeenCalled();
  });

  it('persists a simple failed_to_complete flag without a workflow', async () => {
    mockFetchActiveTrainingPlan.mockResolvedValue({ plan: fixturePlan, error: null });
    render(<TrainingPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Log Session/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText(/Failed to complete/i));

    fireEvent.click(screen.getByRole('button', { name: /Log Session/i }));

    await waitFor(() => {
      expect(mockSaveSessionLog).toHaveBeenCalledTimes(1);
    });

    const [, sessionLog] = mockSaveSessionLog.mock.calls[0];
    expect(sessionLog.failedToComplete).toBe(true);
    expect(sessionLog.exercises[0].failed).toBe(true);
    expect(sessionLog.exercises[0].completed).toBe(false);
    expect(mockSaveTrainingPlan).not.toHaveBeenCalled();
  });

  it('reloads the existing active plan and derives progress from saved execution without regenerating', async () => {
    mockFetchActiveTrainingPlan.mockResolvedValue({ plan: fixturePlan, error: null });
    mockFetchSessionLogs.mockResolvedValue({
      logs: [{
        id: 'log-1',
        clientId: 'client-1',
        planId: 'plan-p1',
        sessionId: 's1',
        sessionName: 'Upper Body • Week 1',
        weekNumber: 1,
        sessionIndex: 1,
        completed: true,
        failedToComplete: false,
        exercises: [{
          exerciseId: 'ex-1',
          exerciseName: 'Barbell Bench Press',
          sets: 4,
          reps: '8-10',
          load: 62.5,
          rpe: 8,
          completed: true,
          failed: false,
        }],
        loggedAt: '2026-01-02T00:00:00.000Z',
      }],
      error: null,
    });

    render(<TrainingPage />);

    // The fixture contains a single session that is now logged → the derived
    // progress correctly reports the program as complete (the log is scoped to
    // this plan). No questionnaire, no regeneration, and the log was fetched.
    await waitFor(() => {
      expect(screen.getByText(/Program complete/i)).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /Generate Plan/i })).not.toBeInTheDocument();
    expect(mockGenerateDynamicTrainingPlan).not.toHaveBeenCalled();
    expect(mockFetchSessionLogs).toHaveBeenCalledWith('client-1');
  });
});

describe('TrainingPage persisted plan UUID propagation', () => {
  it('logs sessions with the persisted DB plan UUID, never the generated placeholder', async () => {
    const persistedUuid = 'a3f1d2c4-9e2b-4a6d-8c5f-0e7b9a1d3c5e';

    // The generator returns a plan carrying the OLD-style fabricated id
    // (`training-<client>-<timestamp>`), which previously leaked into
    // `p_plan_id` and triggered Postgres 22P02. The page must override it with
    // the persisted UUID returned by saveTrainingPlan.
    mockFetchActiveTrainingPlan.mockResolvedValue({ plan: null, error: null });
    mockSaveTrainingPlan.mockResolvedValue({ success: true, error: null, planId: persistedUuid });
    mockGenerateDynamicTrainingPlan.mockReturnValue({
      ...fixturePlan,
      id: `training-client-1-${Date.now()}`,
    });

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

    // Complete the questionnaire and generate.
    fireEvent.change(screen.getByLabelText('Session duration (minutes)'), { target: { value: '75' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /barbell/i }));
    fireEvent.click(screen.getByRole('button', { name: /Generate Plan/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Log Session/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Log Session/i }));

    await waitFor(() => {
      expect(mockSaveSessionLog).toHaveBeenCalledTimes(1);
    });

    const [, sessionLog] = mockSaveSessionLog.mock.calls[0];
    // saveSessionLog must receive the persisted DB UUID as planId — the fake
    // `training-...` placeholder must never reach p_plan_id.
    expect(sessionLog.planId).toBe(persistedUuid);
    expect(sessionLog.planId).not.toMatch(/^training-/);
  });
describe('TrainingPage derived progression (advance after logging)', () => {
  it('advances to the next prescribed session after logging, without regenerating the plan', async () => {
    const s1 = fixturePlan.weeks[0].sessions[0];
    const s2 = { ...s1, id: 's2', name: 'Lower Body • Week 1' };
    const twoSessionPlan: TrainingPlan = {
      ...fixturePlan,
      weeks: [{ ...fixturePlan.weeks[0], sessions: [s1, s2] }],
    };

    mockFetchActiveTrainingPlan.mockResolvedValue({ plan: twoSessionPlan, error: null });

    render(<TrainingPage />);

    // First prescribed session (W1/S1) is active.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Log Session/i })).toBeInTheDocument();
    });
    expect(screen.getByText(/Upper Body • Week 1/i)).toBeInTheDocument();

    // Enter a load and log the session.
    fireEvent.change(screen.getByLabelText(/^Load/i), { target: { value: '62.5' } });
    fireEvent.click(screen.getByRole('button', { name: /Log Session/i }));

    await waitFor(() => {
      expect(mockSaveSessionLog).toHaveBeenCalledTimes(1);
    });

    // The UI advances to the next prescribed session WITHOUT regenerating the
    // plan (progress is re-derived from the optimistic session log).
    await waitFor(() => {
      expect(screen.getByText(/Lower Body • Week 1/i)).toBeInTheDocument();
    });
    expect(mockGenerateDynamicTrainingPlan).not.toHaveBeenCalled();
    expect(mockFetchActiveTrainingPlan).toHaveBeenCalledTimes(1);
  });
});
});