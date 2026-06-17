-- ============================================================================
-- Migration: harden coach_messages RLS
-- Purpose: fix the FOR ALL policy from 20260614200000_coach_messages.sql
--          that lacked a WITH CHECK clause and did not verify coach
--          ownership of the addressed client.
--
-- New policy rules (coach is the auth.uid() on the request):
--   SELECT:    coach can read messages where:
--                (a) coach_id = auth.uid() (sent by them), OR
--                (b) the addressed client is owned by them (clients.created_by = auth.uid())
--   INSERT:    coach can only insert if:
--                - coach_id = auth.uid()                            (no impersonation)
--                - the addressed client is owned by them            (no cross-coach spam)
--                - type and trigger_event (if present) are valid
--   UPDATE:    coach can only update their own messages
--                (used to mark is_read / re-send)
--   DELETE:    coach can only delete their own messages
--
-- Client-side read policy is unchanged (uses user_metadata.client_id which
-- the auth hook already validates at line 72 of useAuth.tsx).
--
-- This migration is additive and idempotent — safe to apply to environments
-- that already ran 20260614200000.
-- Created: 2026-06-17
-- Refs: AUDIT_AND_ROADMAP.md §3 C2
-- ============================================================================

ALTER TABLE public.coach_messages ENABLE ROW LEVEL SECURITY;

-- Drop the old, permissive "FOR ALL" policy.
DROP POLICY IF EXISTS "coach_manages_messages" ON public.coach_messages;

-- ---------------------------------------------------------------------------
-- SELECT — coach can read messages they sent OR messages addressed to a
--          client they own.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "coach_select_own_or_owned_client" ON public.coach_messages;
CREATE POLICY "coach_select_own_or_owned_client"
  ON public.coach_messages FOR SELECT
  USING (
    coach_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = coach_messages.client_id
        AND c.created_by = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- INSERT — strict WITH CHECK: coach_id must be the caller, AND the
--          addressed client must be owned by the caller.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "coach_insert_owned_client" ON public.coach_messages;
CREATE POLICY "coach_insert_owned_client"
  ON public.coach_messages FOR INSERT
  WITH CHECK (
    coach_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = coach_messages.client_id
        AND c.created_by = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- UPDATE — only the author can update (used to flip is_read, edit message).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "coach_update_own" ON public.coach_messages;
CREATE POLICY "coach_update_own"
  ON public.coach_messages FOR UPDATE
  USING (coach_id = auth.uid())
  WITH CHECK (coach_id = auth.uid());

-- ---------------------------------------------------------------------------
-- DELETE — only the author can delete.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "coach_delete_own" ON public.coach_messages;
CREATE POLICY "coach_delete_own"
  ON public.coach_messages FOR DELETE
  USING (coach_id = auth.uid());
