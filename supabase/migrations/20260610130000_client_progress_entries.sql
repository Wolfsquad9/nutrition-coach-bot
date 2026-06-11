-- ============================================================================
-- Migration: client_progress_entries
-- Purpose: replace localStorage-based daily progress entries in
--          ProgressTracker.tsx (key `progress_${clientId}`) with a real,
--          multi-device, RLS-protected Supabase store.
-- Distinct from client_progress_snapshots (which is plan-version-wide periodic).
-- Created: 2026-06-10
-- Refs: AUDIT_AND_ROADMAP.md §2.2 C1 (data layer migration)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.client_progress_entries (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id                uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  recorded_on              date NOT NULL,
  weight_kg                numeric(5,2)
                             CHECK (weight_kg IS NULL OR (weight_kg > 0 AND weight_kg < 500)),
  body_fat_pct             numeric(4,2)
                             CHECK (body_fat_pct IS NULL OR (body_fat_pct > 0 AND body_fat_pct < 80)),
  nutrition_adherence_pct  smallint
                             CHECK (nutrition_adherence_pct IS NULL
                                    OR (nutrition_adherence_pct >= 0 AND nutrition_adherence_pct <= 100)),
  notes                    text,
  created_by               uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),

  -- One entry per (client, day) — upsert semantics
  CONSTRAINT uq_client_progress_entries_client_date
    UNIQUE (client_id, recorded_on)
);

-- Index for chart queries: "give me client X's progress ordered by date"
CREATE INDEX IF NOT EXISTS idx_client_progress_entries_client_date
  ON public.client_progress_entries (client_id, recorded_on DESC);

COMMENT ON TABLE public.client_progress_entries IS
  'Daily/periodic progress measurements (weight, body fat, adherence). '
  'Distinct from client_progress_snapshots which captures plan-version-wide metrics.';

-- ============================================================================
-- RLS
-- ============================================================================
ALTER TABLE public.client_progress_entries ENABLE ROW LEVEL SECURITY;

-- Coaches can read all entries for clients they own.
-- Clients can read their own entries.
-- Mirrors the RLS pattern used by `clients` and `client_progress_snapshots`.
DROP POLICY IF EXISTS "client_progress_entries_select" ON public.client_progress_entries;
CREATE POLICY "client_progress_entries_select"
  ON public.client_progress_entries FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = client_progress_entries.client_id
        AND c.created_by = auth.uid()
    )
    OR client_id = auth.uid()
  );

-- Coaches and clients can insert; the `created_by` column MUST match auth.uid()
-- (enforced by CHECK below, in addition to the FK).
DROP POLICY IF EXISTS "client_progress_entries_insert" ON public.client_progress_entries;
CREATE POLICY "client_progress_entries_insert"
  ON public.client_progress_entries FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND (
      EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id = client_progress_entries.client_id
          AND c.created_by = auth.uid()
      )
      OR client_id = auth.uid()
    )
  );

-- Updates: only the row's author can update.
DROP POLICY IF EXISTS "client_progress_entries_update" ON public.client_progress_entries;
CREATE POLICY "client_progress_entries_update"
  ON public.client_progress_entries FOR UPDATE
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- Deletes: only the row's author can delete.
DROP POLICY IF EXISTS "client_progress_entries_delete" ON public.client_progress_entries;
CREATE POLICY "client_progress_entries_delete"
  ON public.client_progress_entries FOR DELETE
  USING (created_by = auth.uid());

-- ============================================================================
-- AUTO-UPDATE updated_at
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_client_progress_entries_updated_at ON public.client_progress_entries;
CREATE TRIGGER trg_client_progress_entries_updated_at
  BEFORE UPDATE ON public.client_progress_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
