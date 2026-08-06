-- ============================================================================
-- Add statement_timeout protection to all RPCs that perform client management
-- and plan locking operations.
--
-- Problem: RPCs can hang indefinitely if the database is under load, a row
-- lock is held, or connection pool is exhausted. The frontend has no way to
-- abort a hung RPC call from the client side alone — the server-side
-- statement_timeout ensures the query eventually fails and returns control.
--
-- Affected RPCs:
--   - create_client_invitation   (10s timeout)
--   - soft_delete_client          (10s timeout)
--   - lock_nutrition_plan         (30s timeout — may need more time for lock)
-- ============================================================================

-- Fix create_client_invitation: add statement_timeout
CREATE OR REPLACE FUNCTION public.create_client_invitation(
  p_client_id UUID,
  p_invited_email TEXT,
  p_invite_token_hash TEXT,
  p_expires_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_invitation_id UUID;
BEGIN
  -- HARD TIMEOUT: abort after 10 seconds
  PERFORM set_config('statement_timeout', '10000', true);

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_invite_token_hash IS NULL OR length(trim(p_invite_token_hash)) < 32 THEN
    RAISE EXCEPTION 'invite_token_hash is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = p_client_id
      AND (c.created_by = v_user_id OR public.has_role_v2(v_user_id, 'admin'))
  ) THEN
    RAISE EXCEPTION 'Not authorized to invite this client';
  END IF;

  INSERT INTO public.client_invitations (
    client_id,
    invited_email,
    invite_token_hash,
    created_by,
    expires_at
  ) VALUES (
    p_client_id,
    p_invited_email,
    p_invite_token_hash,
    v_user_id,
    COALESCE(p_expires_at, now() + interval '14 days')
  )
  RETURNING id INTO v_invitation_id;

  RETURN v_invitation_id;
END;
$$;

-- Fix soft_delete_client: add statement_timeout
CREATE OR REPLACE FUNCTION public.soft_delete_client(p_client_id UUID)
RETURNS TABLE(success BOOLEAN, error TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  -- HARD TIMEOUT: abort after 10 seconds
  PERFORM set_config('statement_timeout', '10000', true);

  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Not authenticated'::TEXT;
    RETURN;
  END IF;

  IF p_client_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'client_id is required'::TEXT;
    RETURN;
  END IF;

  -- Authorize: caller must own the client, or be an admin.
  IF NOT EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = p_client_id
      AND c.archived_at IS NULL
      AND (c.created_by = v_user_id OR public.has_role_v2(v_user_id, 'admin'))
  ) THEN
    RETURN QUERY SELECT FALSE, 'Not authorized to delete this client'::TEXT;
    RETURN;
  END IF;

  -- Revoke any pending invitations for this client
  UPDATE public.client_invitations
    SET revoked_at = now()
    WHERE client_id = p_client_id
      AND accepted_at IS NULL
      AND revoked_at IS NULL;

  -- Mark the client as archived
  UPDATE public.clients
    SET archived_at = now(),
        archived_by = v_user_id,
        updated_at = now()
    WHERE id = p_client_id
      AND archived_at IS NULL;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Client not found or already archived'::TEXT;
    RETURN;
  END IF;

  RETURN QUERY SELECT TRUE, NULL::TEXT;
END;
$$;

-- Fix lock_nutrition_plan: add statement_timeout (30s because it may hold advisory locks)
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

-- Ensure execute grants are preserved
REVOKE ALL ON FUNCTION public.create_client_invitation(UUID, TEXT, TEXT, TIMESTAMP WITH TIME ZONE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_client_invitation(UUID, TEXT, TEXT, TIMESTAMP WITH TIME ZONE) TO authenticated;

REVOKE ALL ON FUNCTION public.soft_delete_client(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.soft_delete_client(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.lock_nutrition_plan(UUID, UUID, JSONB, JSONB, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lock_nutrition_plan(UUID, UUID, JSONB, JSONB, TEXT, UUID) TO authenticated;