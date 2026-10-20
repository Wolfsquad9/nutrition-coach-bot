/**
 * Adherence Metrics Service
 *
 * Loads the REAL persisted evidence for a client (daily check-ins +
 * weekly reviews) and hands it to the canonical, pure computation in
 * `src/domain/coaching/adherenceMetrics.ts`.
 *
 * This service owns I/O only; every number it returns comes from the
 * canonical domain module, so the client dashboard, the client detail
 * view and the coach dashboard can never disagree.
 */
import { supabase } from '@/integrations/supabase/client';
import {
  computeAdherenceMetrics,
  adherenceWindowEndingOn,
  utcMsForDate,
  type AdherenceMetrics,
} from '@/domain/coaching/adherenceMetrics';
import type { DailyCheckin, WeeklyReview } from '@/types/checkin';

export interface AdherenceEvidence {
  readonly dailyCheckins: DailyCheckin[];
  readonly weeklyReviews: WeeklyReview[];
}

export interface AdherenceFetchResult {
  readonly evidence: AdherenceEvidence;
  readonly error: string | null;
}

/**
 * Load the persisted check-in evidence for a client.
 * `days` bounds the daily check-in lookback; weekly reviews are loaded for
 * the same span (plus the week that starts before it, so the weekly
 * fallback can still apply to a partially-covered week).
 */
export async function fetchAdherenceEvidence(
  clientId: string,
  days: number,
): Promise<AdherenceFetchResult> {
  const empty: AdherenceEvidence = { dailyCheckins: [], weeklyReviews: [] };
  const window = adherenceWindowEndingOn(todayIso(), days);

  // Daily check-ins are fetched one extra week earlier so that the
  // "daily evidence wins per ISO week" precedence can be evaluated for
  // weeks that start before the window.
  const dailySince = new Date(
    utcMsForDate(window.startDate) - 7 * 86_400_000,
  )
    .toISOString()
    .slice(0, 10);

  try {
    const [checkinResult, reviewResult] = await Promise.all([
      supabase
        .from('daily_checkins')
        .select('*')
        .eq('client_id', clientId)
        .gte('checkin_date', dailySince)
        .order('checkin_date', { ascending: true }),
      supabase
        .from('weekly_reviews')
        .select('*')
        .eq('client_id', clientId)
        .gte('week_start_date', dailySince)
        .order('week_start_date', { ascending: true }),
    ]);

    if (checkinResult.error) {
      return { evidence: empty, error: checkinResult.error.message };
    }
    if (reviewResult.error) {
      return { evidence: empty, error: reviewResult.error.message };
    }

    return {
      evidence: {
        dailyCheckins: (checkinResult.data ?? []) as unknown as DailyCheckin[],
        weeklyReviews: (reviewResult.data ?? []) as unknown as WeeklyReview[],
      },
      error: null,
    };
  } catch (err: unknown) {
    return {
      evidence: empty,
      error: err instanceof Error ? err.message : 'Failed to fetch adherence evidence',
    };
  }
}

/**
 * Fetch the evidence for a client and compute the canonical adherence
 * metrics for the last `days` days.
 */
export async function getAdherenceMetrics(
  clientId: string,
  days: number,
): Promise<{ metrics: AdherenceMetrics | null; error: string | null }> {
  const { evidence, error } = await fetchAdherenceEvidence(clientId, days);
  if (error) {
    return { metrics: null, error };
  }
  const metrics = computeAdherenceMetrics({
    dailyCheckins: evidence.dailyCheckins,
    weeklyReviews: evidence.weeklyReviews,
    window: adherenceWindowEndingOn(todayIso(), days),
  });
  return { metrics, error: null };
}

/** Today as YYYY-MM-DD (UTC). */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
