-- ============================================================================
-- Sprint 1.9.2 — Client Soft Delete
-- Adds archived_at / archived_by to clients, a soft_delete_client RPC, and
-- updates the relevant RLS policies so archived clients are hidden from the
-- coach's list view. Mirrors the soft-delete pattern used by plan_overrides
-- and plan_versions.
-- ============================================================================

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE NULL;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS archived_by UUID NULL REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_clients_archived_at ON public.clients(archived_at);

-- Replace the SELECT policy so archived clients are hidden from the
-- owner-coach (and from the linked client themselves; they should use the
-- RPC if they need to see history, but for now this is the safest default).
DROP POLICY IF EXISTS "Authenticated users can view owned or linked clients" ON public.clients;
CREATE POLICY "Authenticated users can view owned or linked clients"
  ON public.clients
  FOR SELECT
  TO authenticated
  USING (
    archived_at IS NULL
    AND (
      created_by = auth.uid()
      OR user_profile_id = auth.uid()
      OR public.has_role_v2(auth.uid(), 'admin')
    )
  );

-- Replace the UPDATE policy to prevent accidental edits to archived clients
-- by the owner. Admins retain access.
DROP POLICY IF EXISTS "Authenticated users can update owned clients" ON public.clients;
CREATE POLICY "Authenticated users can update owned clients"
  ON public.clients
  FOR UPDATE
  TO authenticated
  USING (
    archived_at IS NULL
    AND (
      created_by = auth.uid()
      OR public.has_role_v2(auth.uid(), 'admin')
    )
  )
  WITH CHECK (
    archived_at IS NULL
    AND (
      created_by = auth.uid()
      OR public.has_role_v2(auth.uid(), 'admin')
    )
  );

-- soft_delete_client: marks the client archived and revokes any pending
-- invitations. Does not touch auth.users, profiles, or user_roles — the
-- linked client keeps their auth account so they can re-link later if a
-- new invitation is created.
CREATE OR REPLACE FUNCTION public.soft_delete_client(p_client_id UUID)
RETURNS TABLE(success BOOLEAN, error TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
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

  -- Revoke any pending invitations for this client so the email is not
  -- accidentally consumed by a stale link. Already-accepted invitations
  -- are left in place as an audit trail.
  UPDATE public.client_invitations
    SET revoked_at = now()
    WHERE client_id = p_client_id
      AND accepted_at IS NULL
      AND revoked_at IS NULL;

  -- Mark the client as archived.
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

REVOKE ALL ON FUNCTION public.soft_delete_client(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.soft_delete_client(UUID) TO authenticated;
