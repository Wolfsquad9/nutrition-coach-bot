-- ============================================================================
-- Shared Plan Public RPC
--
-- Purpose:
--   Restores the Sprint 1.75 product behavior — anonymous, no-auth sharing
--   of locked plan snapshots — without re-introducing the CRITICAL service_role
--   exposure that was removed in commit 55f066f (audit C1).
--
-- Architecture:
--   - The endpoint is intentionally PUBLIC.
--   - Authentication is OPTIONAL. The UUID is the authorization boundary.
--   - The SQL function is the entire security boundary.
--   - The function body explicitly SELECTs only the two columns that are
--     public. New columns on plan_versions are automatically NOT exposed.
--   - anon SELECT on plan_versions is REVOKED so the endpoint cannot be
--     widened to a SELECT * by accident.
--
-- Public surface (and ONLY this):
--   - locked_snapshot_json (jsonb)
--   - created_at           (timestamptz)
--
-- MUST NEVER be reachable through this endpoint:
--   - coach information
--   - client information
--   - emails
--   - plan_payload (a duplicate of the snapshot — internal use only)
--   - created_by
--   - idempotency_key
--   - payload_hash
--   - draft or archived plans
--
-- See: docs/architecture/shared-plan.md
-- ============================================================================

-- 1. Lookup function. SECURITY DEFINER so the function can read; the
--    GRANT below limits who can call it. The function body explicitly
--    SELECTs only the two columns that should be public. There is no
--    SELECT * — the projection is the security boundary.

CREATE OR REPLACE FUNCTION public.get_shared_plan_snapshot(p_token TEXT)
RETURNS TABLE(snapshot JSONB, created_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate token is a UUID before doing anything else. This rejects
  -- malformed input early and prevents surprising type-cast errors
  -- from leaking through the function.
  IF p_token IS NULL
     OR p_token !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT pv.locked_snapshot_json, pv.created_at
  FROM public.plan_versions pv
  WHERE pv.id = p_token::uuid
    AND pv.locked_snapshot_json IS NOT NULL
    AND pv.archived = false
  LIMIT 1;
END;
$$;

-- 2. Lock down who can call this function. PUBLIC is REVOKED first
--    (Postgres default is PUBLIC grant), then EXECUTE is granted to
--    anon and authenticated.

REVOKE ALL ON FUNCTION public.get_shared_plan_snapshot(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_plan_snapshot(TEXT) TO anon, authenticated;

-- 3. Defense in depth: REVOKE anon SELECT on plan_versions entirely.
--    The only way to read a snapshot is via the RPC. This makes the
--    wrong path syntactically impossible — a future developer cannot
--    accidentally write a SELECT that bypasses the projection.
--    Authenticated users retain their existing RLS-based access.

REVOKE SELECT ON public.plan_versions FROM anon;
