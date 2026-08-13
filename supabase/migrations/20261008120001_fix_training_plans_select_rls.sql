-- ============================================================================
-- Fix training_plans SELECT RLS to match save_training_plan authorization
--
-- Problem:
--   save_training_plan() authorizes saves for clients where:
--     - created_by = auth.uid()
--     - user_profile_id = auth.uid()
--     - profiles.trainer_id = auth.uid()
--     - has_role_v2(auth.uid(), 'admin')
--
--   But the training_plans SELECT policies only allowed:
--     - clients viewing their own plans (via user_profile_id)
--     - trainers viewing their clients' plans (via get_trainer_client_ids)
--
--   The get_trainer_client_ids() helper only checks profiles.trainer_id, so
--   coaches who created the client or are linked via user_profile_id cannot
--   read back plans after reload.
--
-- Fix:
--   Add a SELECT policy that mirrors the save_training_plan() authorization
--   so fetchActiveTrainingPlan() can read plans for every client that
--   save_training_plan() is authorized to save for.
-- ============================================================================

CREATE POLICY "Trainers can view training plans for clients they manage"
  ON public.training_plans FOR SELECT
  USING (
    client_id IN (
      SELECT id
      FROM public.clients
      WHERE created_by = auth.uid()
        OR user_profile_id = auth.uid()
        OR user_profile_id IN (
          SELECT id
          FROM public.profiles
          WHERE trainer_id = auth.uid()
        )
    )
    OR public.has_role_v2(auth.uid(), 'admin')
  );
