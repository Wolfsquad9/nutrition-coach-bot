/**
 * Check-in Streak Service
 *
 * Manages the denormalized checkin_streaks table.
 * Updating a streak is a separate operation from submitting a check-in,
 * allowing flexibility in scheduling (could be trigger-based later).
 */
import { supabase } from '@/integrations/supabase/client';
import type { CheckinStreak } from '@/types/checkin';

/**
 * Get the current streak record for a client.
 */
export async function getStreak(
  clientId: string
): Promise<{ streak: CheckinStreak | null; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('checkin_streaks')
      .select('*')
      .eq('client_id', clientId)
      .maybeSingle();

    if (error) {
      return { streak: null, error: error.message };
    }

    return { streak: data as unknown as CheckinStreak | null, error: null };
  } catch (err: unknown) {
    return {
      streak: null,
      error: err instanceof Error ? err.message : 'Failed to fetch streak',
    };
  }
}

export interface StreakUpdateResult {
  /** The new current streak value */
  current_streak: number;
  /** Whether the streak was broken (resets to 0) */
  broken: boolean;
}

/**
 * Update (create/upsert) the streak for a client based on today's check-in.
 *
 * This implements the streak logic:
 * - If last_checkin_date is yesterday → increment current_streak
 * - If last_checkin_date is today → no change (duplicate submission guard)
 * - If last_checkin_date is older → streak broken, reset to 0
 * - If no previous streak → start at 0 (first checkin sets to 1)
 *
 * NOTE: This is intentionally NOT automatic — the application layer decides
 * when to call this, keeping the streak logic testable and debuggable.
 */
export async function updateStreak(
  clientId: string
): Promise<{
  streak: CheckinStreak | null;
  result: StreakUpdateResult | null;
  error: string | null;
}> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    // Fetch existing streak
    const { data: existing, error: fetchError } = await supabase
      .from('checkin_streaks')
      .select('*')
      .eq('client_id', clientId)
      .maybeSingle();

    if (fetchError) {
      return { streak: null, result: null, error: fetchError.message };
    }

    const record = existing as unknown as CheckinStreak | null;
    let current = record?.current_streak ?? 0;
    const lastDate = record?.last_checkin_date ?? null;
    let broken = false;

    if (lastDate === today) {
      // Already checked in today — no change
      return {
        streak: record as CheckinStreak | null,
        result: { current_streak: current, broken: false },
        error: null,
      };
    }

    if (lastDate === yesterday) {
      // Consecutive day — increment
      current += 1;
    } else if (lastDate === null) {
      // First ever check-in — start at 1
      current = 1;
    } else {
      // Streak broken — reset to 1 (today counts as new streak start)
      current = 1;
      broken = true;
    }

    const longest = Math.max(current, record?.longest_streak ?? 0);

    const streakData = {
      client_id: clientId,
      current_streak: current,
      longest_streak: longest,
      last_checkin_date: today,
      streak_start_date: broken || !record?.streak_start_date
        ? today
        : record.streak_start_date,
      streak_broken_date: broken ? yesterday : record?.streak_broken_date ?? null,
    };

    const { data: upserted, error: upsertError } = await supabase
      .from('checkin_streaks')
      .upsert(streakData, { onConflict: 'client_id' })
      .select()
      .single();

    if (upsertError) {
      return { streak: null, result: null, error: upsertError.message };
    }

    return {
      streak: upserted as unknown as CheckinStreak,
      result: { current_streak: current, broken },
      error: null,
    };
  } catch (err: unknown) {
    return {
      streak: null,
      result: null,
      error: err instanceof Error ? err.message : 'Failed to update streak',
    };
  }
}