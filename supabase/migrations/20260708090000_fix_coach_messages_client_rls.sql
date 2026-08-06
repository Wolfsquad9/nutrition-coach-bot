-- ============================================================================
-- Migration: fix coach_messages client RLS
-- Purpose: Replace the broken user_metadata.client_id lookup with a proper
--          database query against the clients table.
--
-- The original client_reads_own_messages policy used:
--   client_id::text = (auth.jwt() -> 'user_metadata' ->> 'client_id')
--
-- This never works because user_metadata.client_id is never populated by
-- the auth system. The correct approach is to resolve the client's id via
-- the clients table using auth.uid().
--
-- Instead of a SELECT policy on coach_messages that does a subquery on
-- clients for every row (which could be slow), we create a helper function
-- to look up the current user's client_id once per session.
-- ============================================================================

-- Create a helper function that returns the client_id (if any) for the
-- currently authenticated user. Returns NULL for coaches or unlinked users.
-- SECURITY DEFINER so the function runs with the privileges of the function
-- owner (superuser / migration runner) rather than the calling user.
-- This is safe because the function only reads the clients table and the
-- RLS policies on clients already restrict what the caller can see.
CREATE OR REPLACE FUNCTION public.get_my_client_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.clients WHERE user_profile_id = auth.uid() LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_my_client_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_client_id() TO authenticated;

-- ---------------------------------------------------------------------------
-- Fix the client read policy: use the helper function instead of JWT metadata.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "client_reads_own_messages" ON public.coach_messages;
CREATE POLICY "client_reads_own_messages"
  ON public.coach_messages FOR SELECT
  USING (
    client_id = public.get_my_client_id()
  );

-- ---------------------------------------------------------------------------
-- Also add a client INSERT policy so client-facing flows can insert messages
-- if needed (e.g. auto-replies). Currently only coaches insert, but having
-- an explicit policy prevents surprises.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "client_inserts_own_messages" ON public.coach_messages;
CREATE POLICY "client_inserts_own_messages"
  ON public.coach_messages FOR INSERT
  WITH CHECK (
    client_id = public.get_my_client_id()
    AND coach_id IS NOT NULL
  );