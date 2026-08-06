-- ============================================================================
-- E2E test-only safety net: SQL-level teardown RPCs.
--
-- Purpose
-- -------
-- The E2E suite cleans up by re-logging in as the tagged coach and clicking
-- the soft-delete UI. When a test fails *before* that UI path is reachable
-- (signup itself failed, an early assertion threw, etc.), the soft-delete
-- never runs and orphaned rows accumulate across:
--   auth.users, profiles, clients, client_progress_entries,
--   daily_checkins, weekly_reviews, ai_summaries, plan_overrides.
--
-- These RPCs are an unmovable safety net that the test fixture calls AFTER
-- the UI attempt, regardless of whether the UI succeeded. They are guarded
-- by a strict email-pattern check so they can never operate on a real user.
--
-- Grant target is `anon, authenticated` because the e2e fixture's Supabase
-- client is unauthenticated (no session, see e2e/helpers/supabase.ts). The
-- security boundary is the guard clause in the function body — the grant is
-- intentionally broad because this is a test-only toolbelt, not a
-- production API.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Force-delete a test user (purges all FK-referencing rows + auth.users).
-- ---------------------------------------------------------------------------
create or replace function public.e2e_force_delete_test_user(p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  -- Hard guard: refuse anything not matching the E2E test prefix used by
  -- generateCoachEmail() / generateClientEmail() in e2e/helpers/test-data.ts.
  if p_email !~ '^e2e-test-(coach|client)-.*@example\.com$' then
    raise exception 'e2e_force_delete_test_user: refusing to operate on non-test email %', p_email
      using errcode = 'insufficient_privilege';
  end if;

  select id into v_user_id from auth.users where email = p_email;
  if v_user_id is null then
    return; -- already gone, nothing to do
  end if;

  -- Delete in dependency order: leaf tables first, then the table that
  -- other rows reference via client_id (cascade handles the dependents,
  -- but we delete the parent row explicitly for clarity), then profiles,
  -- then the auth.users row itself last.
  delete from public.client_progress_entries where created_by = v_user_id;
  delete from public.daily_checkins          where created_by = v_user_id;
  delete from public.weekly_reviews          where created_by = v_user_id;
  delete from public.ai_summaries            where created_by = v_user_id;
  delete from public.plan_overrides          where created_by = v_user_id;
  delete from public.clients                 where created_by = v_user_id or archived_by = v_user_id;
  -- profiles.id is ON DELETE CASCADE, but delete explicitly for clarity
  delete from public.profiles                where id = v_user_id;
  delete from auth.users                     where id = v_user_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Existence check companion: same guard, just answers "does this user
-- exist?". Used by e2e/cleanup-fallback.spec.ts to assert the delete
-- actually purged the user, instead of inferring from a sign-in failure.
-- ---------------------------------------------------------------------------
create or replace function public.e2e_test_user_exists(p_email text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exists boolean;
begin
  if p_email !~ '^e2e-test-(coach|client)-.*@example\.com$' then
    raise exception 'e2e_test_user_exists: refusing to operate on non-test email %', p_email
      using errcode = 'insufficient_privilege';
  end if;

  select exists(select 1 from auth.users where email = p_email) into v_exists;
  return v_exists;
end;
$$;

-- Grants: anon + authenticated. The e2e fixture's client is unauthenticated
-- (no session); the guard clause is the real security boundary here, not
-- the grant, since this is an intentional test-only toolbelt.
revoke all on function public.e2e_force_delete_test_user(text) from public;
grant execute on function public.e2e_force_delete_test_user(text) to anon, authenticated;

revoke all on function public.e2e_test_user_exists(text) from public;
grant execute on function public.e2e_test_user_exists(text) to anon, authenticated;
