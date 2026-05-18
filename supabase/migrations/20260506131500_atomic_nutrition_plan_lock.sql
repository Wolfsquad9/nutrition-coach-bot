-- Phase 1: atomic, idempotent nutrition plan locking.
-- Invariants enforced here:
-- 1. Lock writes are all-or-nothing via a single RPC transaction.
-- 2. Retrying a lock with the same idempotency key returns the same version.
-- 3. Version numbers are unique per nutrition plan.
-- 4. Locked snapshots are inserted with the version and cannot be overwritten.

-- Fail fast if existing data already violates the per-plan version uniqueness invariant.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.plan_versions
    GROUP BY plan_id, version_number
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot add unique(plan_id, version_number): duplicate plan version numbers exist';
  END IF;
END;
$$;

-- Fail fast if existing data already has multiple active nutrition plans for a client.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.nutrition_plans
    WHERE status = 'active'
    GROUP BY client_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce one active nutrition plan per client: duplicate active nutrition plans exist';
  END IF;
END;
$$;


-- Fail fast if existing locked versions are missing their canonical snapshot.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.plan_versions
    WHERE plan_payload->>'lockedAt' IS NOT NULL
      AND locked_snapshot_json IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot enforce LOCKED => snapshot exists: locked plan versions without snapshots exist';
  END IF;
END;
$$;

ALTER TABLE public.plan_versions
ADD COLUMN IF NOT EXISTS idempotency_key UUID NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'plan_versions_plan_id_version_number_key'
      AND conrelid = 'public.plan_versions'::regclass
  ) THEN
    ALTER TABLE public.plan_versions
    ADD CONSTRAINT plan_versions_plan_id_version_number_key
    UNIQUE (plan_id, version_number);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'plan_versions_idempotency_key_key'
      AND conrelid = 'public.plan_versions'::regclass
  ) THEN
    ALTER TABLE public.plan_versions
    ADD CONSTRAINT plan_versions_idempotency_key_key
    UNIQUE (idempotency_key);
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS nutrition_plans_one_active_per_client_key
ON public.nutrition_plans(client_id)
WHERE status = 'active';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'plan_versions_locked_snapshot_required'
      AND conrelid = 'public.plan_versions'::regclass
  ) THEN
    ALTER TABLE public.plan_versions
    ADD CONSTRAINT plan_versions_locked_snapshot_required
    CHECK ((plan_payload->>'lockedAt') IS NULL OR locked_snapshot_json IS NOT NULL);
  END IF;
END;
$$;


CREATE OR REPLACE FUNCTION public.prevent_locked_snapshot_overwrite()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.locked_snapshot_json IS NOT NULL
     AND NEW.locked_snapshot_json IS DISTINCT FROM OLD.locked_snapshot_json THEN
    RAISE EXCEPTION 'locked_snapshot_json is immutable once set';
  END IF;

  IF OLD.idempotency_key IS NOT NULL
     AND NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key THEN
    RAISE EXCEPTION 'plan version idempotency_key is immutable once set';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_locked_snapshot_overwrite_trigger ON public.plan_versions;
CREATE TRIGGER prevent_locked_snapshot_overwrite_trigger
BEFORE UPDATE OF locked_snapshot_json, idempotency_key ON public.plan_versions
FOR EACH ROW
EXECUTE FUNCTION public.prevent_locked_snapshot_overwrite();

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
        c.user_profile_id = v_user_id
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

  -- Serialize all lock attempts for a client so plan creation and version-number allocation are safe.
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

REVOKE ALL ON FUNCTION public.lock_nutrition_plan(UUID, UUID, JSONB, JSONB, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lock_nutrition_plan(UUID, UUID, JSONB, JSONB, TEXT, UUID) TO authenticated;
