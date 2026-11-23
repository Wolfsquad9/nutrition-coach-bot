-- ============================================================================
-- P1-1D: Meal Completions — Corrected RLS Policies (v2)
-- ============================================================================
-- Purpose: Restore the four RLS policies lost during migration refactoring.
-- Idempotent: safe to apply multiple times via DROP POLICY IF EXISTS / CREATE POLICY.
-- ============================================================================

-- 1. Ensure RLS is enabled (idempotent)
ALTER TABLE public.meal_completions ENABLE ROW LEVEL SECURITY;

-- 2. Restore the four intended RLS policies
--    Use DROP POLICY IF EXISTS followed by CREATE POLICY for deterministic replacement.

-- 4a. Athlete INSERT: enforces ownership + current-version check
DROP POLICY IF EXISTS meal_completions_client_insert ON public.meal_completions;
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

-- 4b. Athlete SELECT: enforces ownership
DROP POLICY IF EXISTS meal_completions_client_read ON public.meal_completions;
CREATE POLICY meal_completions_client_read
ON public.meal_completions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = meal_completions.client_id
      AND c.user_profile_id = auth.uid()
  )
);

-- 4c. Athlete UPDATE: enforces ownership + current-version check
DROP POLICY IF EXISTS meal_completions_client_update ON public.meal_completions;
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

-- 4d. Coach SELECT: allows coach to read only their own clients' records
DROP POLICY IF EXISTS meal_completions_coach_read ON public.meal_completions;
CREATE POLICY meal_completions_coach_read
ON public.meal_completions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.clients c
    JOIN public.profiles p ON c.user_profile_id = p.id
    WHERE c.id = meal_completions.client_id
      AND p.trainer_id = auth.uid()
  )
);

-- Migration chain reference:
--   20261029000000 — Created table + RLS + policies + triggers + functions
--   20261113000000 — Revised functions, added column-level privileges, added coach function
--   20261120000000 — Restores the four missing RLS policies