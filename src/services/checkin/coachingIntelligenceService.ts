/**
 * Coaching Intelligence Service (Stub)
 *
 * Placeholder for AI-powered coaching analysis.
 * Currently returns mock data. Replace real AI integration
 * (e.g., Supabase Edge Function calling OpenAI/Claude) behind these
 * same interfaces.
 *
 * TODO: Replace mock implementations with edge function calls.
 */
import type { AdherenceTrend, ProgressTrajectory, ProgressTrajectoryData, CoachingSummary } from '@/types/checkin';
import { toComplianceScore } from '@/types/checkin';

/** Mock data is dev-only. In production build, refuse to return fake data. */
const IS_DEV = import.meta.env.DEV;
import { createSeededRng } from '@/utils/random';

/**
 * Get adherence trend for a client over a given period.
 *
 * TODO: Aggregate real check-in data from daily_checkins table.
 */
export async function getAdherenceTrend(
  clientId: string,
  period: '7d' | '30d' | '90d'
): Promise<{ trend: AdherenceTrend | null; error: string | null }> {
  // In production, refuse to return fake data. Real aggregation must be wired.
  if (!IS_DEV) {
    return {
      trend: null,
      error: 'getAdherenceTrend is a dev-only stub. Wire to real data before shipping.',
    };
  }

  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
  // Seeded PRNG so the same client+period always returns the same dev trend.
  const rng = createSeededRng(`adherence-${clientId}-${period}`);
  const dataPoints = Array.from({ length: days }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    return {
      date: d.toISOString().slice(0, 10),
      adherence: Math.round(60 + rng.next() * 35),
    };
  });

  const avg =
    Math.round(dataPoints.reduce((s, p) => s + p.adherence, 0) / dataPoints.length);

  return {
    trend: {
      client_id: clientId,
      period,
      average_adherence: avg,
      trend_direction: avg >= 75 ? 'improving' : avg >= 50 ? 'stable' : 'declining',
      data_points: dataPoints,
    },
    error: null,
  };
}

/**
 * Get progress trajectory — weight change + adherence → trajectory label.
 *
 * TODO: Compare weekly_reviews bodyweight_kg deltas + daily_checkins adherence.
 */
export async function getProgressTrajectory(
  clientId: string
): Promise<{ trajectory: ProgressTrajectoryData | null; error: string | null }> {
  // Stub: return mock data
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);

  return {
    trajectory: {
      client_id: clientId,
      start_date: start.toISOString().slice(0, 10),
      end_date: end.toISOString().slice(0, 10),
      weight_change_kg: -1.2,
      adherence_trend: [68, 72, 75, 80, 78, 82],
      trajectory: 'improving',
    },
    error: null,
  };
}

/**
 * Generate a weekly coaching summary.
 *
 * TODO: Call an edge function that aggregates check-in data and runs
 * through an LLM to produce narrative + highlights + recommendations + risk flags.
 */
export async function generateWeeklySummary(
  clientId: string,
  weekStartDate: string
): Promise<{ summary: CoachingSummary | null; error: string | null }> {
  // Stub: return mock summary data
  return {
    summary: {
      client_id: clientId,
      week_start_date: weekStartDate,
      adherence_score: toComplianceScore(78),
      trajectory: 'improving',
      highlights: [
        'Consistent meal adherence above 75% for 5 of 7 days',
        'Weight trending down as expected (-0.4 kg this week)',
        'Workout compliance at 86% — only missed 1 session',
      ],
      recommendations: [
        'Increase water intake on training days',
        'Consider adding a post-workout carb refeed on heavy leg days',
      ],
      risk_flags: [
        'Sleep quality below 6h on 3 nights — monitor for fatigue accumulation',
      ],
      generated_at: new Date().toISOString(),
    },
    error: null,
  };
}