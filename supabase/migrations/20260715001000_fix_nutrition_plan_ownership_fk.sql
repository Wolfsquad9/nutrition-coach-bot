-- ============================================================================
-- Fix FK constraint on nutrition_plans.created_by and training_plans.created_by
--
-- Problem: Both FKs reference public.profiles(id), but the RPCs write
-- auth.uid() (an auth.users UUID). When the handle_new_user trigger fails
-- (due to 'coach'::app_role not being in the app_role enum), no profiles row
-- is created, and the FK constraint fails.
--
-- Evidence that auth.users(id) is the correct target:
--   1. clients.created_by → REFERENCES auth.users(id)  (migration 20260129081000)
--   2. plan_versions.created_by → REFERENCES auth.users(id)  (migration 20251120110128)
--   3. plan_overrides.created_by → REFERENCES auth.users(id)  (migration 20251120110128)
--   4. All RLS policies check created_by = auth.uid()
--   5. lock_nutrition_plan RPC inserts v_user_id := auth.uid()
--
-- Pre-validation: Run this BEFORE applying the migration:
--   SELECT np.id, np.created_by, au.id AS auth_user_id
--   FROM public.nutrition_plans np
--   LEFT JOIN auth.users au ON au.id = np.created_by
--   WHERE au.id IS NULL;
--   → Should return 0 rows. If any rows exist, those created_by values are
--     orphaned and must be fixed before applying this migration.
--
--   SELECT tp.id, tp.created_by, au.id AS auth_user_id
--   FROM public.training_plans tp
--   LEFT JOIN auth.users au ON au.id = tp.created_by
--   WHERE au.id IS NULL;
--   → Should return 0 rows.
-- ============================================================================

-- Pre-validation: fail fast if any created_by values don't exist in auth.users
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.nutrition_plans np
    LEFT JOIN auth.users au ON au.id = np.created_by
    WHERE au.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Pre-validation failed: nutrition_plans has created_by values not in auth.users';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.training_plans tp
    LEFT JOIN auth.users au ON au.id = tp.created_by
    WHERE au.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Pre-validation failed: training_plans has created_by values not in auth.users';
  END IF;
END;
$$;

-- Drop existing FK constraints
ALTER TABLE public.nutrition_plans
  DROP CONSTRAINT IF EXISTS nutrition_plans_created_by_fkey;

ALTER TABLE public.training_plans
  DROP CONSTRAINT IF EXISTS training_plans_created_by_fkey;

-- Re-create with reference to auth.users (always exists for authenticated users)
ALTER TABLE public.nutrition_plans
  ADD CONSTRAINT nutrition_plans_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.training_plans
  ADD CONSTRAINT training_plans_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;