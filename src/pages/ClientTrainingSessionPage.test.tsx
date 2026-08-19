import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ClientTrainingSessionPage from './ClientTrainingSessionPage';
import type { TrainingPlan, WorkoutExercise } from '@/types';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ clientId: 'client-1', isAuthenticated: true, isLoading: false }),
}));

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

vi.mock('@/services/supabaseTrainingPlanService', () => ({
  fetchActiveTrainingPlan: vi.fn(),
}));

vi.mock('@/services/supabaseSessionLogService', () => ({
  fetchSessionLogs: vi.fn(),
  saveSessionLog: vi.fn(),
}));

import { fetchActiveTrainingPlan } from '@/services/supabaseTrainingPlanService';
import { fetchSessionLogs, saveSessionLog } from '@/services/supabaseSessionLogService';

const mockFetchPlan = vi.mocked(fetchActiveTrainingPlan);
const mockFetchLogs = vi.mocked(fetchSessionLogs);
const mockSaveLog = vi.mocked(saveSessionLog);

const exercise = (id: string, name: string): WorkoutExercise => ({
  exercise: {
    id,
    name,
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
});

const makePlan = (): TrainingPlan => ({
  id: 'plan-1',
  clientId: 'client-1',
  name: 'Upper/Lower',
  objective: 'Build',
  duration: 2,
  frequency: 2,
  split: 'upper_lower',
  phase: 'hypertrophy',
  phases: [],
  weeks: [
    {
      weekNumber: 1,
      phase: 'foundation',
      objective: 'base',
      sessions: [
        { id: 's1', weekNumber: 1, dayNumber: 1, sessionType: 'upper', name: 'Upper • Week 1', duration: 75, exercises: [exercise('ex-1', 'Barbell Bench Press')] },
        { id: 's2', weekNumber: 1, dayNumber: 2, sessionType: 'lower', name: 'Lower • Week 1', duration: 75, exercises: [exercise('ex-2', 'Back Squat')] },
      ],
    },
  ],
  workouts: [],
  progressionScheme: 'Auto',
  programDescription: 'desc',
  createdAt: '2026-01-01T00:00:00.000Z',
});

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchPlan.mockResolvedValue({ plan: makePlan(), error: null });
  mockFetchLogs.mockResolvedValue({ logs: [], error: null });
  mockSaveLog.mockResolvedValue({ success: true, error: null, sessionLogId: 'log-1' });
});

describe('ClientTrainingSessionPage (client execution workflow)', () => {
  it('shows the execution form and prevents an EMPTY session from being logged', async () => {
    render(<ClientTrainingSessionPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Log Session/i })).toBeInTheDocument();
    });

    // The client-facing execution form is present.
    expect(screen.getByText(/Today's Workout/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Barbell Bench Press/i).length).toBeGreaterThan(0);

    // No data entered yet → the log action is disabled (empty sessions blocked).
    expect(screen.getByRole('button', { name: /Log Session/i })).toBeDisabled();
    expect(mockSaveLog).not.toHaveBeenCalled();
  });

  it('logs a completed session, shows the professional completion message, and unlocks the next session', async () => {
    render(<ClientTrainingSessionPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Log Session/i })).toBeInTheDocument();
    });

    // Enter a real load + RPE so the session is complete.
    fireEvent.change(screen.getByLabelText(/^Load/i), { target: { value: '62.5' } });
    fireEvent.change(screen.getByLabelText(/RPE/i), { target: { value: '7' } });

    expect(screen.getByRole('button', { name: /Log Session/i })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: /Log Session/i }));

    await waitFor(() => {
      expect(mockSaveLog).toHaveBeenCalledTimes(1);
    });
    const [clientId, sessionLog] = mockSaveLog.mock.calls[0];
    expect(clientId).toBe('client-1');
    expect(sessionLog.sessionId).toBe('s1');
    expect(sessionLog.planId).toBe('plan-1');
    expect(sessionLog.completed).toBe(true);

    // Professional completion message appears only AFTER successful persistence.
    await waitFor(() => {
      expect(screen.getByText(/Session logged — well done/i)).toBeInTheDocument();
    });

    // The next prescribed session becomes the active, executable session.
    await waitFor(() => {
      expect(screen.getAllByText(/Lower • Week 1/i).length).toBeGreaterThan(0);
    });
  });

  it('does NOT show the completion message when the backend insert fails', async () => {
    mockSaveLog.mockResolvedValue({ success: false, error: 'boom', sessionLogId: null });
    render(<ClientTrainingSessionPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Log Session/i })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/^Load/i), { target: { value: '62.5' } });
    fireEvent.change(screen.getByLabelText(/RPE/i), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: /Log Session/i }));

    await waitFor(() => {
      expect(mockSaveLog).toHaveBeenCalledTimes(1);
    });

    // No optimistic advance, no success message — the session stays incomplete.
    expect(screen.queryByText(/Session logged — well done/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/Barbell Bench Press/i).length).toBeGreaterThan(0);
  });
});