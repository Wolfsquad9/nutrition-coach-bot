-- ============================================================================
-- P1-1D Fix: Meal Completions RLS Policies, Triggers, and Grants
-- ============================================================================
-- Purpose:
--   Correct incomplete application of migration 20261029000000 which created
--   the meal_completions table and enabled RLS but failed to apply:
--   - Table-level privileges for the authenticated role
--   - Four RLS policies (athlete INSERT/SELECT/UPDATE, coach SELECT)
--   - Two triggers (timestamps, ownership validation)
--
-- This migration is idempotent: it uses DO blocks with IF NOT EXISTS checks
-- so it can be safely applied to databases where some objects already exist.
-- ============================================================================

-- 1. Table-level privileges (GRANT is idempotent)
GRANT INSERT, SELECT, UPDATE, DELETE ON public.meal_completions TO authenticated;

-- 2. Ensure trigger functions exist with correct definitions
CREATE OR REPLACE FUNCTION public.meal_completions_set_timestamps()
RETURNS TRIGGER AS $$
BEGIN
  SET search_path = public, pg_catalog, auth;

  NEW.updated_at = now();

  IF OLD.completed IS DISTINCT FROM NEW.completed THEN
    NEW.completed_at = now();
  ELSE
    NEW.completed_at = OLD.completed_at;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.meal_completions_validate_ownership()
RETURNS TRIGGER AS $$
BEGIN
  SET search_path = public, pg_catalog, auth;

  -- 1. Athlete must own the client
  IF NOT EXISTS (
    SELECT 1
    FROM public.clients c
    WHERE c.id = NEW.client_id
      AND c.user_profile_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'meal_completions: user is not the owner of this client'
      USING ERRCODE = 'P0001';
  END IF;

  -- 2. plan_version_id must belong to this client
  IF NOT EXISTS (
    SELECT 1
    FROM public.plan_versions pv
    JOIN public.nutrition_plans np ON np.id = pv.plan_id
    WHERE pv.id = NEW.plan_version_id
      AND np.client_id = NEW.client_id
  ) THEN
    RAISE EXCEPTION 'meal_completions: plan_version_id belongs to another client'
      USING ERRCODE = 'P0001';
  END IF;

  -- 3. plan_version_id must be the current version for this client
  PERFORM np.id
  FROM public.nutrition_plans np
  WHERE np.client_id = NEW.client_id
    AND np.current_version_id = NEW.plan_version_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'meal_completions: plan_version_id is not the current version for this client'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Attach triggers (idempotent via DO blocks)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_meal_completions_set_timestamps'
      AND tgrelid = (SELECT oid FROM pg_class WHERE relname = 'meal_completions')
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER trg_meal_completions_set_timestamps
      BEFORE UPDATE ON public.meal_completions
      FOR EACH ROW
      EXECUTE FUNCTION public.meal_completions_set_timestamps();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_meal_completions_validate_ownership'
      AND tgrelid = (SELECT oid FROM pg_class WHERE relname = 'meal_completions')
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER trg_meal_completions_validate_ownership
      BEFORE INSERT OR UPDATE ON public.meal_completions
      FOR EACH ROW
      EXECUTE FUNCTION public.meal_completions_validate_ownership();
  END IF;
END $$;

-- 4. RLS policies (idempotent via CREATE POLICY IF NOT EXISTS)

-- Athlete INSERT (WITH CHECK enforces ownership + current version)
CREATE POLICY IF NOT EXISTS meal_completions_client_insert
  ON public.meal_completions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = meal_completions.client_id
        AND c.user_profile_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.nutrition_plans np
      WHERE np.client_id = meal_completions.client_id
        AND np.current_version_id = meal_completions.plan_version_id
    )
  );

-- Athlete SELECT
CREATE POLICY IF NOT EXISTS meal_completions_client_read
  ON public.meal_completions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = meal_completions.client_id
        AND c.user_profile_id = auth.uid()
    )
  );

-- Athlete UPDATE (USING + WITH CHECK for concurrent upsert safety)
CREATE POLICY IF NOT EXISTS meal_completions_client_update
  ON public.meal_completions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = meal_completions.client_id
        AND c.user_profile_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = meal_completions.client_id
        AND c.user_profile_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.nutrition_plans np
      WHERE np.client_id = meal_completions.client_id
        AND np.current_version_id = meal_completions.plan_version_id
    )
  );

-- Coach SELECT (coach -> client via profiles.trainer_id)
CREATE POLICY IF NOT EXISTS meal_completions_coach_read
  ON public.meal_completions FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.clients c
      JOIN public.profiles p ON c.user_profile_id = p.id
      WHERE c.id = meal_completions.client_id
        AND p.trainer_id = auth.uid()
    )
  );

-- 5. Notices
-- No existing policies were modified (IF NOT EXISTS guards prevent duplicates).
-- No existing tables were altered.
-- No plan payloads, locked snapshots, hashes, or nutrition calculations were touched.
-- New plan versions start with no inherited completion records (table is empty).
