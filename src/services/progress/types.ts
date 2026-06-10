/**
 * Client progress entries — per-day measurements and adherence logs.
 *
 * Distinct from `client_progress_snapshots` (which stores plan-version-wide
 * periodic metrics). Entries are the daily/weekly "I weighed in" data points
 * that feed the ProgressTracker chart.
 *
 * The previous implementation in ProgressTracker.tsx stored these in
 * localStorage under `progress_${clientId}`. This service replaces that
 * approach with a Supabase-backed, multi-device, RLS-protected store.
 */

export type ProgressEntryId = string;

export interface ClientProgressEntry {
  id: ProgressEntryId;
  client_id: string;
  recorded_on: string;     // YYYY-MM-DD (date only, no timezone)
  weight_kg: number | null;
  body_fat_pct: number | null;
  nutrition_adherence_pct: number | null; // 0–100
  notes: string | null;
  created_by: string;      // auth.uid() of the coach OR the client themselves
  created_at: string;
  updated_at: string;
}

/** Shape used by the UI — a subset of fields, no DB timestamps. */
export interface ProgressEntryView {
  id: ProgressEntryId;
  date: string;
  weight: number;
  bodyFat?: number;
  nutritionAdherence: number;
  notes?: string;
}
