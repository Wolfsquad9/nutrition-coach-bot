-- ============================================================================
-- Sprint 1.9.3 — Prevent Coach Self-Claim
-- Guards claim_client_invitation so the invitation creator (the coach) cannot
-- accidentally claim their own invitation, which would convert their role from
-- 'trainer'/'coach' to 'client' and lock them out of the coach portal.
-- ============================================================================

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

  -- Prevent the coach who created the invitation from claiming it.
  -- This avoids an accidental role conversion (trainer → client).
  IF v_invitation.created_by = v_user_id THEN
    RAISE EXCEPTION 'You cannot claim your own invitation';
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

REVOKE ALL ON FUNCTION public.claim_client_invitation(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_client_invitation(TEXT) TO authenticated;