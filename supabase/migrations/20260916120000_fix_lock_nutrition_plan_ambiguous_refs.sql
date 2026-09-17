-- ============================================================================
-- Phase 10 hotfix: lock_nutrition_plan fails with SQLSTATE 42702 for any
-- client that already has an active nutrition plan.
--
-- Root cause
-- ----------
-- 20260824090000_enforce_nutrition_plan_lock_period.sql added the server-side
-- lock-period guard:
--
--   SELECT (locked_snapshot_json #>> '{meta,lockedUntil}')::timestamptz
--   INTO v_current_locked_until
--   FROM public.plan_versions
--   WHERE plan_id = v_plan_id
--     AND archived = false
--     AND locked_snapshot_json IS NOT NULL
--   ORDER BY version_number DESC
--   LIMIT 1;
--
-- `plan_id` and `version_number` are UNQUALIFIED in that statement, but the
-- function's RETURNS TABLE declares OUT parameters with the same names
-- (plan_id UUID, version_number INTEGER). With the PL/pgSQL default
-- `variable_conflict = error`, the first execution of that statement raises:
--
--   ERROR: column reference "plan_id" is ambiguous (SQLSTATE 42702)
--
-- The statement is only reached when `v_plan_id IS NOT NULL`, i.e. when the
-- client already has an active plan. Consequences:
--   * the FIRST-ever lock for a client (no plan yet) succeeds, and
--   * every RE-LOCK (new version after expiry / coach review workflow) fails
--     and rolls back atomically.
--
-- Fix
-- ---
-- Alias the table and qualify every column reference in that single guard
-- statement. NO behavioral, authorization, RLS, or lock-period change:
--   * the same lock-period check still runs, inside the same transaction,
--     after the advisory lock and idempotency handling;
--   * the same mandatory-lock-period rejection is preserved verbatim;
--   * idempotent replays still short-circuit before this statement.
-- A CREATE OR REPLACE keeps the function identity, ownership, and the
-- existing EXECUTE grants; the grants are re-asserted defensively.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.lock_nutrition_plan(
  p_client_id UUID,
  p_version_id UUID,
  p_plan_payload JSONB,
  p_locked_snapshot_json JSONB,
  p_payload_hash TEXT,
  p_idempotency_key UUID
)
RETURNS TABLE(
  success BOOLEAN,
  plan_id UUID,
  version_id UUID,
  version_number INTEGER,
  error TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_plan_id UUID;
  v_next_version_number INTEGER;
  v_existing RECORD;
  v_snapshot_version_id TEXT;
  v_canonical_snapshot_json JSONB;
  v_current_locked_until TIMESTAMPTZ;
BEGIN
  -- HARD TIMEOUT: abort after 30 seconds (advisory lock may wait)
  PERFORM set_config('statement_timeout', '30000', true);

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_client_id IS NULL THEN
    RAISE EXCEPTION 'client_id is required';
  END IF;

  IF p_version_id IS NULL THEN
    RAISE EXCEPTION 'version_id is required';
  END IF;

  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'idempotency_key is required';
  END IF;

  IF p_plan_payload IS NULL OR jsonb_typeof(p_plan_payload) <> 'object' THEN
    RAISE EXCEPTION 'plan_payload must be a JSON object';
  END IF;

  IF p_locked_snapshot_json IS NULL OR jsonb_typeof(p_locked_snapshot_json) <> 'object' THEN
    RAISE EXCEPTION 'locked_snapshot_json must be a JSON object';
  END IF;

  IF p_payload_hash IS NULL OR length(trim(p_payload_hash)) = 0 THEN
    RAISE EXCEPTION 'payload_hash is required';
  END IF;

  IF p_plan_payload->>'lockedAt' IS NULL THEN
    RAISE EXCEPTION 'locked plan payload must include lockedAt';
  END IF;

  IF p_locked_snapshot_json #>> '{meta,lockedAt}' IS DISTINCT FROM p_plan_payload->>'lockedAt' THEN
    RAISE EXCEPTION 'snapshot meta.lockedAt must match plan payload lockedAt';
  END IF;

  v_snapshot_version_id := p_locked_snapshot_json #>> '{identifier,versionId}';
  IF v_snapshot_version_id IS DISTINCT FROM p_version_id::TEXT THEN
    RAISE EXCEPTION 'snapshot identifier.versionId must match version_id';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.clients c
    LEFT JOIN public.profiles client_profile ON client_profile.id = c.user_profile_id
    WHERE c.id = p_client_id
      AND (
        c.created_by = v_user_id
        OR c.user_profile_id = v_user_id
        OR client_profile.trainer_id = v_user_id
        OR public.has_role_v2(v_user_id, 'admin')
      )
  ) THEN
    RAISE EXCEPTION 'Not authorized to lock a nutrition plan for this client';
  END IF;

SELECT pv.plan_id, pv.id, pv.version_number
  INTO v_existing
  FROM public.plan_versions pv
  INNER JOIN public.nutrition_plans np ON np.id = pv.plan_id
  WHERE pv.idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.nutrition_plans np
      WHERE np.id = v_existing.plan_id
        AND np.client_id = p_client_id
    ) THEN
      RAISE EXCEPTION 'idempotency_key already belongs to another nutrition plan';
    END IF;

    RETURN QUERY SELECT TRUE, v_existing.plan_id, v_existing.id, v_existing.version_number, NULL::TEXT;
    RETURN;
  END IF;

  -- Serialize all lock attempts for a client
  PERFORM pg_advisory_xact_lock(hashtextextended(p_client_id::TEXT, 0));

  SELECT pv.plan_id, pv.id, pv.version_number
  INTO v_existing
  FROM public.plan_versions pv
  INNER JOIN public.nutrition_plans np ON np.id = pv.plan_id
  WHERE pv.idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.nutrition_plans np
      WHERE np.id = v_existing.plan_id
        AND np.client_id = p_client_id
    ) THEN
      RAISE EXCEPTION 'idempotency_key already belongs to another nutrition plan';
    END IF;

    RETURN QUERY SELECT TRUE, v_existing.plan_id, v_existing.id, v_existing.version_number, NULL::TEXT;
    RETURN;
  END IF;

  SELECT np.id
  INTO v_plan_id
  FROM public.nutrition_plans np
  WHERE np.client_id = p_client_id
    AND np.status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    v_plan_id := NULL;
  END IF;

  -- ==========================================================================
  -- PHASE 10 SERVER-SIDE LOCK-PERIOD ENFORCEMENT
  -- --------------------------------------------------------------------------
  -- Identical semantics to 20260824090000. THE ONLY CHANGE: every column in
  -- this statement is qualified with the table alias `pv`, because `plan_id`
  -- and `version_number` collide with the function's RETURNS TABLE OUT
  -- parameters of the same name. Unqualified, PL/pgSQL (variable_conflict =
  -- error) raised SQLSTATE 42702 "column reference "plan_id" is ambiguous"
  -- the first time this statement executed — i.e. on EVERY re-lock of a
  -- client who already has an active plan. The lock-period check itself is
  -- unchanged and still enforced.
  -- ==========================================================================
  IF v_plan_id IS NOT NULL THEN
    SELECT (pv.locked_snapshot_json #>> '{meta,lockedUntil}')::timestamptz
    INTO v_current_locked_until
    FROM public.plan_versions pv
    WHERE pv.plan_id = v_plan_id
      AND pv.archived = false
      AND pv.locked_snapshot_json IS NOT NULL
    ORDER BY pv.version_number DESC
    LIMIT 1;

    IF v_current_locked_until IS NOT NULL AND v_current_locked_until > now() THEN
      RAISE EXCEPTION
        'Current nutrition plan version remains within its mandatory lock period until %',
        v_current_locked_until;
    END IF;
  END IF;

  IF v_plan_id IS NULL THEN
    INSERT INTO public.nutrition_plans (
      client_id,
      created_by,
      plan_data,
      status
    ) VALUES (
      p_client_id,
      v_user_id,
      jsonb_build_object('type', 'nutrition', 'version', 1),
      'active'
    )
    RETURNING id INTO v_plan_id;
  END IF;

  SELECT COALESCE(MAX(pv.version_number), 0) + 1
  INTO v_next_version_number
  FROM public.plan_versions pv
  WHERE pv.plan_id = v_plan_id;

  v_canonical_snapshot_json := jsonb_set(
    p_locked_snapshot_json,
    '{meta,versionNumber}',
    to_jsonb(v_next_version_number),
    true
  );

  INSERT INTO public.plan_versions (
    id,
    plan_id,
    version_number,
    created_by,
    plan_payload,
    locked_snapshot_json,
    payload_hash,
    idempotency_key,
    note
  ) VALUES (
    p_version_id,
    v_plan_id,
    v_next_version_number,
    v_user_id,
    p_plan_payload,
    v_canonical_snapshot_json,
    p_payload_hash,
    p_idempotency_key,
    format('Plan locked - v%s', v_next_version_number)
  );

  UPDATE public.nutrition_plans
  SET current_version_id = p_version_id,
      updated_at = now()
  WHERE id = v_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Failed to update current nutrition plan version';
  END IF;

  RETURN QUERY SELECT TRUE, v_plan_id, p_version_id, v_next_version_number, NULL::TEXT;
END;
$$;

-- Re-assert the same grants as every previous revision (defensive, unchanged).
REVOKE ALL ON FUNCTION public.lock_nutrition_plan(UUID, UUID, JSONB, JSONB, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lock_nutrition_plan(UUID, UUID, JSONB, JSONB, TEXT, UUID) TO authenticated;
