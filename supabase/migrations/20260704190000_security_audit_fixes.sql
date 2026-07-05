-- ============================================================================
-- Migration: Security Audit Fixes
-- Purpose: Fix all vulnerabilities identified in audit-report.md
-- Created: 2026-07-04
-- Refs: audit-report.md
-- ============================================================================

-- ============================================================================
-- FIX H2: Systemic client_id = auth.uid() bug in all checkin/progress/alert policies
-- 
-- The bug: client_id references clients.id (a client record UUID), but auth.uid()
-- returns auth.users.id (a user account UUID). These are different IDs.
-- The fix: replace client_id = auth.uid() with a subquery that resolves the
-- client record via user_profile_id.
-- ============================================================================

-- Fix client_progress_entries SELECT
DROP POLICY IF EXISTS "client_progress_entries_select" ON public.client_progress_entries;
CREATE POLICY "client_progress_entries_select"
  ON public.client_progress_entries FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = client_progress_entries.client_id
        AND c.created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = client_progress_entries.client_id
        AND c.user_profile_id = auth.uid()
    )
  );

-- Fix client_progress_entries INSERT
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
      OR EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id = client_progress_entries.client_id
          AND c.user_profile_id = auth.uid()
      )
    )
  );

-- Fix daily_checkins SELECT
DROP POLICY IF EXISTS "daily_checkins_select" ON public.daily_checkins;
CREATE POLICY "daily_checkins_select"
  ON public.daily_checkins FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = daily_checkins.client_id
        AND c.created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = daily_checkins.client_id
        AND c.user_profile_id = auth.uid()
    )
  );

-- Fix daily_checkins INSERT
DROP POLICY IF EXISTS "daily_checkins_insert" ON public.daily_checkins;
CREATE POLICY "daily_checkins_insert"
  ON public.daily_checkins FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND (
      EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id = daily_checkins.client_id
          AND c.created_by = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id = daily_checkins.client_id
          AND c.user_profile_id = auth.uid()
      )
    )
  );

-- Fix weekly_reviews SELECT
DROP POLICY IF EXISTS "weekly_reviews_select" ON public.weekly_reviews;
CREATE POLICY "weekly_reviews_select"
  ON public.weekly_reviews FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = weekly_reviews.client_id
        AND c.created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = weekly_reviews.client_id
        AND c.user_profile_id = auth.uid()
    )
  );

-- Fix weekly_reviews INSERT
DROP POLICY IF EXISTS "weekly_reviews_insert" ON public.weekly_reviews;
CREATE POLICY "weekly_reviews_insert"
  ON public.weekly_reviews FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND (
      EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id = weekly_reviews.client_id
          AND c.created_by = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id = weekly_reviews.client_id
          AND c.user_profile_id = auth.uid()
      )
    )
  );

-- Fix checkin_streaks SELECT
DROP POLICY IF EXISTS "checkin_streaks_select" ON public.checkin_streaks;
CREATE POLICY "checkin_streaks_select"
  ON public.checkin_streaks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = checkin_streaks.client_id
        AND c.created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = checkin_streaks.client_id
        AND c.user_profile_id = auth.uid()
    )
  );

-- Fix checkin_streaks INSERT - restrict to service_role only (FIX M3)
DROP POLICY IF EXISTS "checkin_streaks_insert" ON public.checkin_streaks;
CREATE POLICY "checkin_streaks_insert"
  ON public.checkin_streaks FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- Fix checkin_streaks UPDATE - restrict to service_role only (FIX M3)
DROP POLICY IF EXISTS "checkin_streaks_update" ON public.checkin_streaks;
CREATE POLICY "checkin_streaks_update"
  ON public.checkin_streaks FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Fix ai_summaries SELECT
DROP POLICY IF EXISTS "ai_summaries_select" ON public.ai_summaries;
CREATE POLICY "ai_summaries_select"
  ON public.ai_summaries FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = ai_summaries.client_id
        AND c.created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = ai_summaries.client_id
        AND c.user_profile_id = auth.uid()
    )
  );

-- Fix coach_alerts client SELECT (client can see alerts about themselves)
DROP POLICY IF EXISTS "coach_alerts_select_client" ON public.coach_alerts;
CREATE POLICY "coach_alerts_select_client"
  ON public.coach_alerts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = coach_alerts.client_id
        AND c.user_profile_id = auth.uid()
    )
  );

-- ============================================================================
-- FIX H1: coach_messages client read policy - use DB join instead of JWT metadata
-- ============================================================================

DROP POLICY IF EXISTS "client_reads_own_messages" ON public.coach_messages;
CREATE POLICY "client_reads_own_messages"
  ON public.coach_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = coach_messages.client_id
        AND c.user_profile_id = auth.uid()
    )
  );

-- ============================================================================
-- FIX M2: Standardize on has_role_v2() across all policies
-- Replace all remaining has_role() calls with has_role_v2()
-- ============================================================================

-- Update clients INSERT policy
DROP POLICY IF EXISTS "Trainers and admins can insert clients" ON public.clients;
CREATE POLICY "Trainers and admins can insert clients"
  ON public.clients FOR INSERT
  WITH CHECK (public.has_role_v2(auth.uid(), 'trainer') OR public.has_role_v2(auth.uid(), 'admin'));

-- Update clients UPDATE policy
DROP POLICY IF EXISTS "Trainers and admins can update clients" ON public.clients;
CREATE POLICY "Trainers and admins can update clients"
  ON public.clients FOR UPDATE
  USING (public.has_role_v2(auth.uid(), 'trainer') OR public.has_role_v2(auth.uid(), 'admin'));

-- Update recipes INSERT policy
DROP POLICY IF EXISTS "Admins can insert recipes" ON public.recipes;
CREATE POLICY "Admins can insert recipes"
  ON public.recipes FOR INSERT
  WITH CHECK (public.has_role_v2(auth.uid(), 'admin'));

-- Update recipes UPDATE policy
DROP POLICY IF EXISTS "Admins can update recipes" ON public.recipes;
CREATE POLICY "Admins can update recipes"
  ON public.recipes FOR UPDATE
  USING (public.has_role_v2(auth.uid(), 'admin'));

-- Update exercises INSERT policy
DROP POLICY IF EXISTS "Admins can insert exercises" ON public.exercises;
CREATE POLICY "Admins can insert exercises"
  ON public.exercises FOR INSERT
  WITH CHECK (public.has_role_v2(auth.uid(), 'admin'));

-- Update exercises UPDATE policy
DROP POLICY IF EXISTS "Admins can update exercises" ON public.exercises;
CREATE POLICY "Admins can update exercises"
  ON public.exercises FOR UPDATE
  USING (public.has_role_v2(auth.uid(), 'admin'));

-- Update macro_tolerance_rules policy
DROP POLICY IF EXISTS "admins_manage_macro_rules" ON public.macro_tolerance_rules;
CREATE POLICY "admins_manage_macro_rules"
  ON public.macro_tolerance_rules FOR ALL
  USING (public.has_role_v2(auth.uid(), 'admin'))
  WITH CHECK (public.has_role_v2(auth.uid(), 'admin'));

-- Update client_progress_snapshots INSERT policy
DROP POLICY IF EXISTS "trainers_create_client_progress" ON public.client_progress_snapshots;
CREATE POLICY "trainers_create_client_progress"
  ON public.client_progress_snapshots FOR INSERT
  WITH CHECK (
    public.has_role_v2(auth.uid(), 'trainer') OR public.has_role_v2(auth.uid(), 'admin')
  );

-- Update client_progress_snapshots UPDATE policy
DROP POLICY IF EXISTS "trainers_update_client_progress" ON public.client_progress_snapshots;
CREATE POLICY "trainers_update_client_progress"
  ON public.client_progress_snapshots FOR UPDATE
  USING (
    public.has_role_v2(auth.uid(), 'trainer') OR public.has_role_v2(auth.uid(), 'admin')
  );

-- ============================================================================
-- FIX M4: Add DELETE policies for tables that are missing them
-- ============================================================================

-- plan_overrides DELETE - owners and admins can delete
DROP POLICY IF EXISTS "Users can delete own overrides" ON public.plan_overrides;
CREATE POLICY "Users can delete own overrides"
  ON public.plan_overrides FOR DELETE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR public.has_role_v2(auth.uid(), 'admin')
  );

-- plan_versions DELETE - owners and admins can delete
DROP POLICY IF EXISTS "Users can delete own plan versions" ON public.plan_versions;
CREATE POLICY "Users can delete own plan versions"
  ON public.plan_versions FOR DELETE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR public.has_role_v2(auth.uid(), 'admin')
  );

-- nutrition_plans DELETE - owners and admins can delete
DROP POLICY IF EXISTS "Users can delete own nutrition plans" ON public.nutrition_plans;
CREATE POLICY "Users can delete own nutrition plans"
  ON public.nutrition_plans FOR DELETE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR public.has_role_v2(auth.uid(), 'admin')
  );

-- training_plans DELETE - owners and admins can delete
DROP POLICY IF EXISTS "Users can delete own training plans" ON public.training_plans;
CREATE POLICY "Users can delete own training plans"
  ON public.training_plans FOR DELETE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR public.has_role_v2(auth.uid(), 'admin')
  );

-- ============================================================================
-- Deprecate old has_role() function (mark as deprecated, keep for backward compat)
-- ============================================================================
COMMENT ON FUNCTION public.has_role IS 'DEPRECATED: Use has_role_v2() instead. This function reads from profiles.role which may be out of sync with user_roles.role.';