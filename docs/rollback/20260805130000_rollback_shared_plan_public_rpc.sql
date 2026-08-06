-- ============================================================================
-- Rollback: Shared Plan Public RPC
--
-- Supersedes 20260805120000_shared_plan_public_rpc.sql. Apply this if the
-- forward migration needs to be reversed without rewriting history.
--
-- This is the project's standard rollback pattern (see git log: every
-- earlier destructive change was reversed by a new forward migration that
-- supersedes the prior one, not by a separate _down.sql file). Forward-only
-- migrations keep `supabase db reset` and CI pipelines simple.
--
-- What this restores:
--   - Drops get_shared_plan_snapshot
--   - Re-grants anon SELECT on plan_versions (the Supabase default)
--
-- What this does NOT do:
--   - It does NOT restore service_role exposure. The pre-shared-plan state
--     used service_role in the Edge Function; that is already separately
--     reverted by commit 55f066f. Restoring shared-plan by going back to
--     service_role would re-create audit C1.
--
-- Pre-condition: forward migration 20260805120000 must already be applied.
-- This file is idempotent (DROP IF EXISTS, GRANT is idempotent).
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_shared_plan_snapshot(TEXT);

-- Restore anon SELECT on plan_versions to the Supabase default.
GRANT SELECT ON public.plan_versions TO anon;
