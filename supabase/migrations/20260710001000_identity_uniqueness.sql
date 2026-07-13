-- ============================================================================
-- Sprint 1.9.2 — Identity Uniqueness
-- Prevent duplicate identities:
--   - A coach cannot create two clients with the same email (case-insensitive).
--   - A coach cannot create a second pending invitation for the same client.
-- Database is the only source of truth; the application surfaces these as
-- friendly errors.
-- ============================================================================

-- Ensure pgcrypto is available for gen_random_uuid (already required by other
-- migrations, but make this migration self-contained).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) One row per (coach, lower(email)) for active (non-archived) clients.
--    NULL emails are excluded so multi-tenant coaches who never set an email
--    are not blocked.
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_coach_email_unique
  ON public.clients (created_by, lower(email))
  WHERE email IS NOT NULL AND archived_at IS NULL;

-- 2) One pending invitation per client.
--    Once an invitation is accepted, revoked, or the client is soft-deleted,
--    the index entry disappears and a new invitation can be created.
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_invitations_client_pending
  ON public.client_invitations (client_id)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

-- 3) Replace create_client_invitation with a version that errors clearly
--    when a pending invitation already exists.
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
      AND c.archived_at IS NULL
      AND (c.created_by = v_user_id OR public.has_role_v2(v_user_id, 'admin'))
  ) THEN
    RAISE EXCEPTION 'Not authorized to invite this client';
  END IF;

  -- Reject duplicate pending invitations for the same client. The coach must
  -- either wait for the existing one to be accepted/revoked/expired, or
  -- revoke it explicitly.
  IF EXISTS (
    SELECT 1 FROM public.client_invitations
    WHERE client_id = p_client_id
      AND accepted_at IS NULL
      AND revoked_at IS NULL
      AND expires_at > now()
  ) THEN
    RAISE EXCEPTION 'An active invitation already exists for this client. Revoke it before creating a new one.';
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

REVOKE ALL ON FUNCTION public.create_client_invitation(UUID, TEXT, TEXT, TIMESTAMP WITH TIME ZONE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_client_invitation(UUID, TEXT, TEXT, TIMESTAMP WITH TIME ZONE) TO authenticated;
