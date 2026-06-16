/**
 * Daily Check-in Service
 *
 * CRUD operations for daily_checkins table.
 * Coaches and clients can read/insert; only the author can update/delete.
 */
import { supabase } from '@/integrations/supabase/client';
import type { DailyCheckin, DailyCheckinInsert } from '@/types/checkin';

/**
 * Submit or upsert a daily check-in for the current date.
 * RLS ensures the authenticated user owns the checkin.
 */
export async function submitDailyCheckin(
  input: DailyCheckinInsert
): Promise<{ checkin: DailyCheckin | null; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('daily_checkins')
      .upsert(input, { onConflict: 'client_id, checkin_date' })
      .select()
      .single();

    if (error) {
      return { checkin: null, error: error.message };
    }

    return { checkin: data as unknown as DailyCheckin, error: null };
  } catch (err: unknown) {
    return {
      checkin: null,
      error: err instanceof Error ? err.message : 'Failed to submit daily checkin',
    };
  }
}

/**
 * Get today's check-in for a client (or null if none submitted yet).
 */
export async function getTodayCheckin(
  clientId: string
): Promise<{ checkin: DailyCheckin | null; error: string | null }> {
  try {
    const today = new Date().toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from('daily_checkins')
      .select('*')
      .eq('client_id', clientId)
      .eq('checkin_date', today)
      .maybeSingle();

    if (error) {
      return { checkin: null, error: error.message };
    }

    return { checkin: data as unknown as DailyCheckin | null, error: null };
  } catch (err: unknown) {
    return {
      checkin: null,
      error: err instanceof Error ? err.message : 'Failed to fetch today checkin',
    };
  }
}

/**
 * Get check-in history for a client, newest first, with optional limit.
 */
export async function getCheckinHistory(
  clientId: string,
  options?: { limit?: number; days?: number }
): Promise<{ checkins: DailyCheckin[]; error: string | null }> {
  try {
    let query = supabase
      .from('daily_checkins')
      .select('*')
      .eq('client_id', clientId)
      .order('checkin_date', { ascending: false });

    if (options?.days) {
      const since = new Date();
      since.setDate(since.getDate() - options.days);
      query = query.gte('checkin_date', since.toISOString().slice(0, 10));
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) {
      return { checkins: [], error: error.message };
    }

    return { checkins: (data ?? []) as unknown as DailyCheckin[], error: null };
  } catch (err: unknown) {
    return {
      checkins: [],
      error: err instanceof Error ? err.message : 'Failed to fetch checkin history',
    };
  }
}

/**
 * Get check-ins for multiple clients (coach view), newest first.
 */
export async function getClientCheckins(
  clientIds: string[],
  options?: { limit?: number; days?: number }
): Promise<{ checkins: DailyCheckin[]; error: string | null }> {
  try {
    if (clientIds.length === 0) {
      return { checkins: [], error: null };
    }

    let query = supabase
      .from('daily_checkins')
      .select('*')
      .in('client_id', clientIds)
      .order('checkin_date', { ascending: false });

    if (options?.days) {
      const since = new Date();
      since.setDate(since.getDate() - options.days);
      query = query.gte('checkin_date', since.toISOString().slice(0, 10));
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) {
      return { checkins: [], error: error.message };
    }

    return { checkins: (data ?? []) as unknown as DailyCheckin[], error: null };
  } catch (err: unknown) {
    return {
      checkins: [],
      error: err instanceof Error ? err.message : 'Failed to fetch client checkins',
    };
  }
}