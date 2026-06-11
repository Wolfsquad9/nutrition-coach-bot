/**
 * Client progress entries service — Supabase CRUD.
 *
 * Replaces localStorage-based storage in ProgressTracker.tsx (C1, 3/3).
 *
 * - One row per (client_id, recorded_on) — enforced by unique index,
 *   so adding a measurement for "today" upserts instead of duplicating.
 * - RLS: coaches and clients can both read/write, scoped to rows
 *   they own (see migration).
 * - Returns `{ data, error }` for caller-friendly error handling.
 */

import { supabase } from '@/integrations/supabase/client';
import type { ClientProgressEntry, ProgressEntryView, ProgressEntryId } from './types';

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function fetchProgressEntries(
  clientId: string,
  limit = 365
): Promise<{ data: ProgressEntryView[] | null; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('client_progress_entries')
      .select('*')
      .eq('client_id', clientId)
      .order('recorded_on', { ascending: true })
      .limit(limit);

    if (error) return { data: null, error: error.message };
    return { data: (data ?? []).map(rowToView), error: null };
  } catch (err: unknown) {
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export interface UpsertProgressEntryInput {
  clientId: string;
  date: string;             // YYYY-MM-DD
  weight?: number | null;
  bodyFat?: number | null;
  nutritionAdherence?: number | null;
  notes?: string | null;
}

/**
 * Insert or update an entry for (client_id, recorded_on).
 * The unique index on (client_id, recorded_on) means the database
 * enforces idempotency — no client-side dedup needed.
 */
export async function upsertProgressEntry(
  input: UpsertProgressEntryInput
): Promise<{ data: ProgressEntryView | null; error: string | null }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { data: null, error: 'Not authenticated' };

    const row = {
      client_id: input.clientId,
      recorded_on: input.date,
      weight_kg: input.weight ?? null,
      body_fat_pct: input.bodyFat ?? null,
      nutrition_adherence_pct: input.nutritionAdherence ?? null,
      notes: input.notes ?? null,
      created_by: user.id,
    };

    const { data, error } = await supabase
      .from('client_progress_entries')
      .upsert(row, { onConflict: 'client_id,recorded_on' })
      .select()
      .single();

    if (error) return { data: null, error: error.message };
    return { data: rowToView(data as ClientProgressEntry), error: null };
  } catch (err: unknown) {
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export async function deleteProgressEntry(
  entryId: ProgressEntryId
): Promise<{ success: boolean; error: string | null }> {
  try {
    const { error } = await supabase
      .from('client_progress_entries')
      .delete()
      .eq('id', entryId);

    if (error) return { success: false, error: error.message };
    return { success: true, error: null };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-testable)
// ---------------------------------------------------------------------------

function rowToView(row: ClientProgressEntry): ProgressEntryView {
  return {
    id: row.id,
    date: row.recorded_on,
    weight: row.weight_kg ?? 0,
    bodyFat: row.body_fat_pct ?? undefined,
    nutritionAdherence: row.nutrition_adherence_pct ?? 0,
    notes: row.notes ?? undefined,
  };
}

/**
 * Pure helper used by both the service and the (future) refactored
 * ProgressTracker component. Computes the latest weight delta from
 * a chronologically-sorted list of entries.
 *
 * Returns 0 when fewer than 2 entries exist.
 */
export function latestWeightDelta(entries: readonly ProgressEntryView[]): number {
  if (entries.length < 2) return 0;
  const latest = entries[entries.length - 1].weight;
  const previous = entries[entries.length - 2].weight;
  return latest - previous;
}

/**
 * Average nutrition adherence across all entries.
 * Returns 0 when entries is empty.
 */
export function averageAdherence(entries: readonly ProgressEntryView[]): number {
  if (entries.length === 0) return 0;
  const sum = entries.reduce((acc, e) => acc + (e.nutritionAdherence || 0), 0);
  return Math.round(sum / entries.length);
}

/**
 * Today's date in YYYY-MM-DD format, local time.
 * Used as default `recorded_on` for new entries.
 */
export function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
