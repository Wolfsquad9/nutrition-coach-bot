-- ============================================================================
-- P1-1D: Meal Completions — Security, Ownership, and RLS
-- ============================================================================
-- Purpose:
--   - Track individual meal completion for athletes on their locked nutrition plan
--   - Enforce athlete ownership and current-version enforcement entirely in
--     the database (RLS + triggers), so no app-side check can be bypassed
--   - Allow coaches to view their athletes' completion records
--
-- Design decisions:
--   - Approach B: no schema change to plan_versions; ownership validated by
--     a PL/pgSQL trigger against the existing FK chain
--     (plan_versions.plan_id -> nutrition_plans.id -> nutrition_plans.client_id)
--   - Athletes can only write to their OWN client's CURRENT plan version;
--     the trigger locks the matching nutrition_plans row with FOR UPDATE so
--     concurrent plan replacement and completion writes serialize correctly
--   - created_at / updated_at / completed_at follow the spec's prescribed
--     semantics; completed_at is set only when completed actually changes
-- ============================================================================

-- 1. New table: meal_completions
CREATE TABLE IF NOT EXISTS public.meal_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  plan_version_id UUID NOT NULL REFERENCES public.plan_versions(id) ON DELETE CASCADE,
  day_offset SMALLINT NOT NULL CHECK (day_offset BETWEEN 0 AND 6),
  meal_slot TEXT NOT NULL CHECK (meal_slot IN ('breakfast', 'lunch', 'dinner', 'snack')),
  completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

  CONSTRAINT uq_meal_completions_client_plan_day_slot
    UNIQUE (client_id, plan_version_id, day_offset, meal_slot)
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_meal_completions_client_plan
  ON public.meal_completions (client_id, plan_version_id);

-- 3. RLS
ALTER TABLE public.meal_completions ENABLE ROW LEVEL SECURITY;



-- 4. Trigger functions

/*
 * Timestamp setter.
 *
 * On every UPDATE:
 *   - updated_at = now()  (every successful update)
 *   - completed_at = now()  only if completed actually changed;
 *     otherwise keep the previous completed_at
 *   - created_at is never modified (default at INSERT)
 *
 * Security: SECURIT DEFINER => runs with the owner's (postgres) privileges,
 * not the caller's. search_path is fixed to prevent schema injection.
 */
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

/*
 * Ownership + current-version validator.
 *
 * On every INSERT OR UPDATE:
 *   1. Authenticated user (auth.uid()) must own client_id:
 *        clients.user_profile_id = auth.uid()
 *   2. plan_version_id must belong to the same client:
 *        plan_versions.plan_id -> nutrition_plans.id -> nutrition_plans.client_id
 *   3. plan_version_id must be the current version for that client:
 *        nutrition_plans.current_version_id = plan_version_id
 *
 * The trigger locks the matched nutrition_plans row with FOR UPDATE, so a
 * concurrent plan replacement and completion write serialize on that row.
 *
 * Security: SECURIT DEFINER => runs with the owner's (postgres) privileges,
 * not the caller's. search_path is fixed to prevent schema injection.
 */
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

-- 5. Row-level triggers

-- Update timestamp semantics on every UPDATE.
CREATE TRIGGER trg_meal_completions_set_timestamps
  BEFORE UPDATE ON public.meal_completions
  FOR EACH ROW
  EXECUTE FUNCTION public.meal_completions_set_timestamps();

-- Enforce ownership, plan-version ownership, and current-version at the DB
-- boundary. Runs BEFORE INSERT OR UPDATE so the VALUES are validated before
-- the row is committed.
CREATE TRIGGER trg_meal_completions_validate_ownership
  BEFORE INSERT OR UPDATE ON public.meal_completions
  FOR EACH ROW
  EXECUTE FUNCTION public.meal_completions_validate_ownership();

-- 6. RLS policies

-- Athlete INSERT (WITH CHECK enforces ownership + current version)
CREATE POLICY meal_completions_client_insert
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
CREATE POLICY meal_completions_client_read
  ON public.meal_completions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = meal_completions.client_id
        AND c.user_profile_id = auth.uid()
    )
  );

-- Athlete UPDATE (USING + WITH CHECK for concurrent upsert safety)
CREATE POLICY meal_completions_client_update
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
CREATE POLICY meal_completions_coach_read
  ON public.meal_completions FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.clients c
      JOIN public.profiles p ON c.user_profile_id = p.id

-- 7. Notices

-- No existing policies were modified.
-- No existing tables were altered.
-- No plan payloads, locked snapshots, hashes, or nutrition calculations were touched.
-- New plan versions start with no inherited completion records (table is empty).

      WHERE c.id = meal_completions.client_id
        AND p.trainer_id = auth.uid()
    )
  );

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


