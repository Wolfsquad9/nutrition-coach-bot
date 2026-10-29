-- ============================================================================
-- REMEDIATION — Remove anonymous/privileged roles from E2E test-only RPCs
-- ============================================================================
--
-- Vulnerability
-- -------------
-- public.e2e_force_delete_test_user(p_email text)
-- public.e2e_test_user_exists(p_email text)
--
-- Both are SECURITY DEFINER and directly callable by the `anon` and
-- `authenticated` Postgres roles, which in Supabase means any unauthenticated
-- browser client (anon) and any logged-in user (authenticated). The only
-- protection is an email regex guard; an anonymous caller can execute an
-- account-deletion RPC and all associated data with the owner-equivalent
-- privileges of the function.
--
-- Remediation
-- -----------
-- 1. Revoke EXECUTE from public, anon, authenticated.
-- 2. Grant EXECUTE to service_role only (trusted admin context).
-- 3. E2E tests must use the service_role key for cleanup.
--
-- Migration convention: additive forward migration. This does not rewrite or
-- delete any previously applied migration; it only tightens object-level
-- privileges on existing functions.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- e2e_force_delete_test_user: remove anonymous/authenticated grants
-- ---------------------------------------------------------------------------
revoke all on function public.e2e_force_delete_test_user(text) from public;
revoke all on function public.e2e_force_delete_test_user(text) from anon;
revoke all on function public.e2e_force_delete_test_user(text) from authenticated;

grant execute on function public.e2e_force_delete_test_user(text) to service_role;

-- ---------------------------------------------------------------------------
-- e2e_test_user_exists: remove anonymous/authenticated grants
-- ---------------------------------------------------------------------------
revoke all on function public.e2e_test_user_exists(text) from public;
revoke all on function public.e2e_test_user_exists(text) from anon;
revoke all on function public.e2e_test_user_exists(text) from authenticated;

grant execute on function public.e2e_test_user_exists(text) to service_role;
