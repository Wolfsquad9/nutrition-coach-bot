/**
 * Weekly Review Service
 *
 * CRUD operations for weekly_reviews table.
 * Coaches and clients can read/insert; updates allow coach_notes edits by coach.
 */
import { supabase } from '@/integrations/supabase/client';
import type { WeeklyReview, WeeklyReviewInsert } from '@/types/checkin';

/**
 * Get the ISO week start date (Monday) for a given date.
 */
function getWeekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setDate(diff);
  return d.toISOString().slice(0, 10);
}

/**
 * Submit or upsert a weekly review.
 * The week_start_date is auto-computed from checkin_date if not provided.
 */
export async function submitWeeklyReview(
  input: WeeklyReviewInsert
): Promise<{ review: WeeklyReview | null; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('weekly_reviews')
      .upsert(input, { onConflict: 'client_id, week_start_date' })
      .select()
      .single();

    if (error) {
      return { review: null, error: error.message };
    }

    return { review: data as unknown as WeeklyReview, error: null };
  } catch (err: unknown) {
    return {
      review: null,
      error: err instanceof Error ? err.message : 'Failed to submit weekly review',
    };
  }
}

/**
 * Get the current week's review for a client.
 */
export async function getCurrentWeekReview(
  clientId: string
): Promise<{ review: WeeklyReview | null; error: string | null }> {
  try {
    const weekStart = getWeekStart(new Date());

    const { data, error } = await supabase
      .from('weekly_reviews')
      .select('*')
      .eq('client_id', clientId)
      .eq('week_start_date', weekStart)
      .maybeSingle();

    if (error) {
      return { review: null, error: error.message };
    }

    return { review: data as unknown as WeeklyReview | null, error: null };
  } catch (err: unknown) {
    return {
      review: null,
      error: err instanceof Error ? err.message : 'Failed to fetch current week review',
    };
  }
}

/**
 * Get review history for a client, newest first.
 */
export async function getReviewHistory(
  clientId: string,
  options?: { limit?: number }
): Promise<{ reviews: WeeklyReview[]; error: string | null }> {
  try {
    let query = supabase
      .from('weekly_reviews')
      .select('*')
      .eq('client_id', clientId)
      .order('week_start_date', { ascending: false });

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) {
      return { reviews: [], error: error.message };
    }

    return { reviews: (data ?? []) as unknown as WeeklyReview[], error: null };
  } catch (err: unknown) {
    return {
      reviews: [],
      error: err instanceof Error ? err.message : 'Failed to fetch review history',
    };
  }
}

/**
 * Update only the coach_notes field on a weekly review.
 * Coach-specific operation — RLS permits this via the created_by OR coach-ownership check.
 */
export async function updateCoachNotes(
  reviewId: string,
  coachNotes: string
): Promise<{ review: WeeklyReview | null; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('weekly_reviews')
      .update({ coach_notes: coachNotes })
      .eq('id', reviewId)
      .select()
      .single();

    if (error) {
      return { review: null, error: error.message };
    }

    return { review: data as unknown as WeeklyReview, error: null };
  } catch (err: unknown) {
    return {
      review: null,
      error: err instanceof Error ? err.message : 'Failed to update coach notes',
    };
  }
}