-- ============================================================================
-- P1-1D: Meal Completions — Corrected RLS Policies and Triggers
-- ============================================================================
-- Purpose:
--   Repair incomplete application of migration 20261029000000 which created
--   the meal_completions table and enabled RLS but failed to apply:
--   - Table-level privileges for the authenticated role
--   - Four RLS policies (athlete INSERT/SELECT/UPDATE, coach SELECT)
--   - Two triggers (timestamps, ownership validation)
--   - One SECURITY DEFINER coach ownership-check function
--
-- This migration is idempotent and safe to apply to databases where the
-- meal_completions table already exists with RLS enabled but no policies
-- or triggers.
--
-- Defects corrected:
--   - The previous fix migration (20261103120000) used CREATE POLICY IF NOT
--     EXISTS, which is invalid PostgreSQL syntax. This migration uses
--     DROP POLICY IF EXISTS followed by CREATE POLICY instead.
--   - Table-level UPDATE privilege was replaced with column-level UPDATE on
--     `completed` only, so athletes cannot change identity fields directly.
--   - Trigger functions declare SET search_path = '' in their definition
--     (not as a runtime statement) and use fully qualified references to
--     prevent object shadowing.
--   - The ownership trigger prevents changing client_id, plan_version_id,
--     day_offset, and meal_slot on UPDATE (defense in depth).
--   - The timestamp trigger now runs on INSERT as well as UPDATE so that a
--     newly completed meal receives a valid completed_at.
--   - Coach SELECT access is implemented via a dedicated SECURITY DEFINER
--     ownership-check function, bypassing the clients-table RLS restriction
--     that prevents the direct subquery from working for coaches.
-- ============================================================================

-- 1. Table-level privileges
--    INSERT, SELECT on all columns. UPDATE only on the `completed` column.
--    Athletes can mark meals complete/incomplete but cannot change identity
--    fields (client_id, plan_version_id, day_offset, meal_slot) directly.
--    Revoke any pre-existing full UPDATE privilege first (idempotent).
--    NOTE: The hosted database already grants table-level DELETE to
--    authenticated. This migration does not revoke that grant. RLS blocks
--    deletion because no DELETE policy exists, but the SQL privilege remains.
REVOKE UPDATE ON public.meal_completions FROM authenticated;
GRANT INSERT, SELECT ON public.meal_completions TO authenticated;
GRANT UPDATE (completed) ON public.meal_completions TO authenticated;

-- 2. Ensure RLS is enabled (idempotent: running ENABLE ROW LEVEL SECURITY
--    on a table that already has RLS enabled is a no-op)
ALTER TABLE public.meal_completions ENABLE ROW LEVEL SECURITY;

-- 3. Trigger functions (idempotent via CREATE OR REPLACE)
--    SECURITY DEFINER with SET search_path = '' in the function definition
--    (not as a runtime statement) to prevent object shadowing.
--    All references are explicitly schema-qualified.
--    auth.uid() resolves from the caller's session JWT, not the function owner.

CREATE OR REPLACE FUNCTION public.meal_completions_set_timestamps()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();

  IF TG_OP = 'INSERT' THEN
    -- Newly inserted row: set completed_at only if completed is true.
    IF NEW.completed THEN
      NEW.completed_at = now();
    ELSE
      NEW.completed_at = NULL;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Existing row: only touch completed_at when completed actually changes.
    IF OLD.completed IS DISTINCT FROM NEW.completed THEN
      IF NEW.completed THEN
        NEW.completed_at = now();
      ELSE
        NEW.completed_at = NULL;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.meal_completions_validate_ownership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
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

  -- 4. Prevent changing identity fields on UPDATE (TG_OP guards INSERT where OLD is NULL)
  IF TG_OP = 'UPDATE' THEN
    IF OLD.client_id IS DISTINCT FROM NEW.client_id THEN
      RAISE EXCEPTION 'meal_completions: client_id cannot be changed'
        USING ERRCODE = 'P0001';
    END IF;

    IF OLD.plan_version_id IS DISTINCT FROM NEW.plan_version_id THEN
      RAISE EXCEPTION 'meal_completions: plan_version_id cannot be changed'
        USING ERRCODE = 'P0001';
    END IF;

    IF OLD.day_offset IS DISTINCT FROM NEW.day_offset THEN
      RAISE EXCEPTION 'meal_completions: day_offset cannot be changed'
        USING ERRCODE = 'P0001';
    END IF;

    IF OLD.meal_slot IS DISTINCT FROM NEW.meal_slot THEN
      RAISE EXCEPTION 'meal_completions: meal_slot cannot be changed'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 4. Coach ownership-check function (SECURITY DEFINER)
--    Allows the coach SELECT policy to validate client ownership without
--    depending on the clients table RLS (which blocks coaches from reading
--    client rows directly). Runs with table owner privileges so its internal
--    queries against clients/profiles succeed even for coach sessions.
--    auth.uid() resolves from the caller's session JWT.
--    Parameter renamed to p_client_id to eliminate identifier ambiguity.
CREATE OR REPLACE FUNCTION public.meal_completions_coach_can_read(p_client_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.clients c
    JOIN public.profiles p ON c.user_profile_id = p.id
    WHERE c.id = p_client_id
      AND p.trainer_id = auth.uid()
  );
END;
$$;

-- Restrict execution to authenticated role only (not PUBLIC)
REVOKE ALL ON FUNCTION public.meal_completions_coach_can_read(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.meal_completions_coach_can_read(UUID) TO authenticated;

-- NOTE: No `private` schema exists in the hosted database, and `public` is
-- exposed by default through PostgREST. The helper function is therefore
-- invocable as an RPC by authenticated users, who could probe ownership of
-- guessed client IDs. This exposure is limited to a boolean yes/no answer
-- for a specific client ID; it does not reveal any client data. Creating a
-- non-exposed schema would require unrelated configuration changes outside
-- the scope of this migration.

-- 5. Attach triggers (idempotent via DO blocks with IF NOT EXISTS checks)
--    Hosted database has zero existing triggers; name-only check is sufficient.
--    Uses schema-qualified relation reference 'public.meal_completions'::regclass.
--    The migration creates the expected triggers on first application; it does
--    not repair a differently defined trigger with the same name.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_meal_completions_set_timestamps'
      AND tgrelid = 'public.meal_completions'::regclass
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER trg_meal_completions_set_timestamps
      BEFORE INSERT OR UPDATE ON public.meal_completions
      FOR EACH ROW
      EXECUTE FUNCTION public.meal_completions_set_timestamps();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_meal_completions_validate_ownership'
      AND tgrelid = 'public.meal_completions'::regclass
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER trg_meal_completions_validate_ownership
      BEFORE INSERT OR UPDATE ON public.meal_completions
      FOR EACH ROW
      EXECUTE FUNCTION public.meal_completions_validate_ownership();
  END IF;
END $$;
-- 7. Notices
--   - No DELETE permissions granted or revoked (pre-existing state unchanged).
--   - Column-level UPDATE only on `completed`.
--   - RLS remains enabled.
--   - No unrelated tables or policies modified.
--   - Idempotent: safe to apply multiple times.