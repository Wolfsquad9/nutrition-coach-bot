-- ============================================================================
-- Atomic training-plan replacement (save_training_plan RPC)
--
-- Replaces the unsafe client-side archive-then-insert flow in
-- supabaseTrainingPlanService.ts. The replacement is now a single RPC
-- transaction:
--   1. insert the new plan as 'active'
--   2. archive every other active plan for the same client
-- If step 2 (or anything else) fails, the whole transaction rolls back and
-- the previous active plan stays active — the client is never left without an
-- active plan because a replacement failed.
--
-- Invariants enforced:
--   * exactly one active training plan per client (partial unique index)
--   * replacement is atomic (all-or-nothing via SECURITY DEFINER RPC)
-- ============================================================================

-- Backfill legacy duplicates first so the unique index can be created: keep
-- the newest active plan per client, archive the rest.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY client_id
           ORDER BY created_at DESC, id DESC
         ) AS rn
  FROM public.training_plans
  WHERE status = 'active'
)
UPDATE public.training_plans tp
SET status = 'archived',
    updated_at = now()
FROM ranked r
WHERE tp.id = r.id
  AND r.rn > 1;

-- One active training plan per client.
CREATE UNIQUE INDEX IF NOT EXISTS training_plans_one_active_per_client
  ON public.training_plans(client_id)
  WHERE status = 'active';

-- Atomic save/replace. SECURITY DEFINER so the function can read clients for
-- authorization while RLS stays restrictive for the caller.
CREATE OR REPLACE FUNCTION public.save_training_plan(
  p_client_id UUID,
  p_plan_data JSONB,
  p_weeks INTEGER
)
RETURNS TABLE(success BOOLEAN, plan_id UUID, error TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_plan_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Not authenticated'::TEXT;
    RETURN;
  END IF;

  IF p_client_id IS NULL OR p_plan_data IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'client_id and plan_data are required'::TEXT;
    RETURN;
  END IF;

  -- Authorize: caller must own the client, be the linked client, be the
  -- client's designated trainer, or be an admin.
  IF NOT EXISTS (
    SELECT 1
    FROM public.clients c
    LEFT JOIN public.profiles client_profile ON client_profile.id = c.user_profile_id
    WHERE c.id = p_client_id
      AND c.archived_at IS NULL
      AND (
        c.created_by = v_user_id
        OR c.user_profile_id = v_user_id
        OR client_profile.trainer_id = v_user_id
        OR public.has_role_v2(v_user_id, 'admin')
      )
  ) THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Not authorized to save a training plan for this client'::TEXT;
    RETURN;
  END IF;

  -- Serialize concurrent replacements for the same client so plan creation
  -- and archive stay deterministic (same pattern as lock_nutrition_plan).
  PERFORM pg_advisory_xact_lock(hashtextextended(p_client_id::TEXT, 0));

  -- Insert the new active plan first. If anything below fails, the whole
  -- transaction rolls back and the previous active plan stays active.
  INSERT INTO public.training_plans (
    client_id,
    created_by,
    plan_data,
    weeks,
    status
  ) VALUES (
    p_client_id,
    v_user_id,
    p_plan_data,
    COALESCE(NULLIF(p_weeks, 0), 4),
    'active'
  )
  RETURNING id INTO v_plan_id;

  -- Archive every other active plan for this client. The partial unique index
  -- above guarantees only one survives; if a foreign writer raced us and
  -- created a second active plan, this update raises and rolls everything
  -- back, preserving the previous active plan.
  UPDATE public.training_plans
  SET status = 'archived',
      updated_at = now()
  WHERE client_id = p_client_id
    AND status = 'active'
    AND id <> v_plan_id;

  RETURN QUERY SELECT TRUE, v_plan_id, NULL::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.save_training_plan(UUID, JSONB, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_training_plan(UUID, JSONB, INTEGER) TO authenticated;