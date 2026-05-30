-- P0 production readiness fixes:
-- 1. Make new self-serve signups coach/trainer accounts.
-- 2. Align client ownership and lock authorization on clients.created_by.
-- 3. Add invitation-based linking so a client login can see locked plans for their profile.
-- 4. Keep all changes additive/idempotent for existing environments.

-- Ensure required schema exists even in environments that were created from older migrations.
CREATE TABLE IF NOT EXISTS public.plan_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.nutrition_plans(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  plan_payload JSONB NOT NULL,
  payload_hash TEXT NOT NULL,
  note TEXT,
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  locked_snapshot_json JSONB NULL,
  idempotency_key UUID NULL
);

ALTER TABLE public.nutrition_plans
ADD COLUMN IF NOT EXISTS current_version_id UUID REFERENCES public.plan_versions(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.plan_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_version_id UUID NOT NULL REFERENCES public.plan_versions(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  meal_type TEXT NOT NULL,
  original_ingredient TEXT NOT NULL,
  replacement_ingredient TEXT NOT NULL,
  macro_delta JSONB NOT NULL,
  within_tolerance BOOLEAN NOT NULL DEFAULT true,
  requires_recipe_regeneration BOOLEAN NOT NULL DEFAULT false,
  suggested_by TEXT NOT NULL,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.client_progress_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  plan_version_id UUID NOT NULL REFERENCES public.plan_versions(id) ON DELETE CASCADE,
  snapshot_type TEXT NOT NULL,
  metrics JSONB NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.macro_tolerance_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL UNIQUE,
  calories_pct_max NUMERIC NOT NULL,
  protein_pct_max NUMERIC NOT NULL,
  carbs_pct_max NUMERIC NOT NULL,
  fats_pct_max NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.plan_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_progress_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.macro_tolerance_rules ENABLE ROW LEVEL SECURITY;

-- Self-serve signups are paying coaches by default. Client accounts are linked by invitation later.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, role, email, full_name)
  VALUES (NEW.id, 'trainer'::app_role, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email))
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'trainer'::app_role)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- Ownership policies: coaches own clients via clients.created_by; linked clients see via user_profile_id.
DROP POLICY IF EXISTS "Authenticated users can view their own clients" ON public.clients;
CREATE POLICY "Authenticated users can view owned or linked clients"
ON public.clients
FOR SELECT
TO authenticated
USING (
  created_by = auth.uid()
  OR user_profile_id = auth.uid()
  OR public.has_role_v2(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "Authenticated users can update their own clients" ON public.clients;
CREATE POLICY "Authenticated users can update owned clients"
ON public.clients
FOR UPDATE
TO authenticated
USING (
  created_by = auth.uid()
  OR public.has_role_v2(auth.uid(), 'admin')
)
WITH CHECK (
  created_by = auth.uid()
  OR public.has_role_v2(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "Authenticated users can create their own clients" ON public.clients;
CREATE POLICY "Authenticated users can create owned clients"
ON public.clients
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = auth.uid()
  OR public.has_role_v2(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "Authenticated users can view their own nutrition plans" ON public.nutrition_plans;
CREATE POLICY "Authenticated users can view owned or linked nutrition plans"
ON public.nutrition_plans
FOR SELECT
TO authenticated
USING (
  created_by = auth.uid()
  OR client_id IN (SELECT id FROM public.clients WHERE user_profile_id = auth.uid())
  OR public.has_role_v2(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "Authenticated users can update their own nutrition plans" ON public.nutrition_plans;
CREATE POLICY "Authenticated users can update owned nutrition plans"
ON public.nutrition_plans
FOR UPDATE
TO authenticated
USING (
  created_by = auth.uid()
  OR public.has_role_v2(auth.uid(), 'admin')
)
WITH CHECK (
  created_by = auth.uid()
  OR public.has_role_v2(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "Authenticated users can create their own nutrition plans" ON public.nutrition_plans;
CREATE POLICY "Authenticated users can create owned nutrition plans"
ON public.nutrition_plans
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = auth.uid()
  OR public.has_role_v2(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "Owner can view own plan versions" ON public.plan_versions;
CREATE POLICY "Users can view owned or linked plan versions"
ON public.plan_versions
FOR SELECT
TO authenticated
USING (
  created_by = auth.uid()
  OR plan_id IN (
    SELECT np.id
    FROM public.nutrition_plans np
    INNER JOIN public.clients c ON c.id = np.client_id
    WHERE c.user_profile_id = auth.uid()
  )
  OR public.has_role_v2(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "Owner can insert plan versions" ON public.plan_versions;
CREATE POLICY "Users can insert owned plan versions"
ON public.plan_versions
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = auth.uid()
  OR public.has_role_v2(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "Users can update their own plan versions" ON public.plan_versions;
CREATE POLICY "Users can update owned plan versions"
ON public.plan_versions
FOR UPDATE
TO authenticated
USING (
  created_by = auth.uid()
  OR public.has_role_v2(auth.uid(), 'admin')
)
WITH CHECK (
  created_by = auth.uid()
  OR public.has_role_v2(auth.uid(), 'admin')
);

-- Invitation/linking model for client visibility.
CREATE TABLE IF NOT EXISTS public.client_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  invited_email TEXT,
  invite_token_hash TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  accepted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '14 days'),
  revoked_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.client_invitations ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_client_invitations_client_id ON public.client_invitations(client_id);
CREATE INDEX IF NOT EXISTS idx_client_invitations_created_by ON public.client_invitations(created_by);
CREATE INDEX IF NOT EXISTS idx_client_invitations_token_hash ON public.client_invitations(invite_token_hash);

DROP POLICY IF EXISTS "Coaches can manage owned client invitations" ON public.client_invitations;
CREATE POLICY "Coaches can manage owned client invitations"
ON public.client_invitations
FOR ALL
TO authenticated
USING (
  created_by = auth.uid()
  OR public.has_role_v2(auth.uid(), 'admin')
)
WITH CHECK (
  created_by = auth.uid()
  OR public.has_role_v2(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "Linked clients can view accepted invitations" ON public.client_invitations;
CREATE POLICY "Linked clients can view accepted invitations"
ON public.client_invitations
FOR SELECT
TO authenticated
USING (accepted_by = auth.uid());

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

CREATE OR REPLACE FUNCTION public.claim_client_invitation(p_invite_token_hash TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_invitation RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_invitation
  FROM public.client_invitations
  WHERE invite_token_hash = p_invite_token_hash
    AND accepted_at IS NULL
    AND revoked_at IS NULL
    AND expires_at > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation is invalid or expired';
  END IF;

  UPDATE public.clients
  SET user_profile_id = v_user_id,
      updated_at = now()
  WHERE id = v_invitation.client_id
    AND (user_profile_id IS NULL OR user_profile_id = v_user_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Client is already linked to another account';
  END IF;

  UPDATE public.profiles
  SET trainer_id = v_invitation.created_by,
      role = 'client'::app_role,
      email = COALESCE(email, v_invitation.invited_email)
  WHERE id = v_user_id;

  UPDATE public.user_roles
  SET role = 'client'::app_role,
      updated_at = now()
  WHERE user_id = v_user_id;

  UPDATE public.client_invitations
  SET accepted_by = v_user_id,
      accepted_at = now()
  WHERE id = v_invitation.id;

  RETURN v_invitation.client_id;
END;
$$;

-- Linked clients and owning coaches can see locked snapshots through existing plan/version RLS.
CREATE OR REPLACE VIEW public.client_visible_locked_plan_versions
WITH (security_invoker = true) AS
SELECT
  pv.id AS version_id,
  pv.plan_id,
  np.client_id,
  pv.version_number,
  pv.locked_snapshot_json,
  pv.created_at,
  pv.payload_hash
FROM public.plan_versions pv
INNER JOIN public.nutrition_plans np ON np.id = pv.plan_id
WHERE pv.locked_snapshot_json IS NOT NULL
  AND pv.archived = false;

GRANT SELECT ON public.client_visible_locked_plan_versions TO authenticated;

-- Lock RPC authorization fix: owner-created coach clients are lockable even before client login linking.
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

REVOKE ALL ON FUNCTION public.create_client_invitation(UUID, TEXT, TEXT, TIMESTAMP WITH TIME ZONE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_client_invitation(UUID, TEXT, TEXT, TIMESTAMP WITH TIME ZONE) TO authenticated;

REVOKE ALL ON FUNCTION public.claim_client_invitation(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_client_invitation(TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.lock_nutrition_plan(UUID, UUID, JSONB, JSONB, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lock_nutrition_plan(UUID, UUID, JSONB, JSONB, TEXT, UUID) TO authenticated;
