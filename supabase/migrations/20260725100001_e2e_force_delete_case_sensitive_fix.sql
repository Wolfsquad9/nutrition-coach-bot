-- Fix: case-sensitivity bug in the E2E safety-net RPCs.
--
-- auth.users stores emails lowercase. generateCoachEmail()/generateClientEmail()
-- produce mixed-case timestamps (e.g. ...T14-51-26-254Z@example.com). The
-- original `where email = p_email` comparison silently matched zero rows
-- for any mixed-case input and returned early with no error — meaning the
-- fallback reported success (error: null) while deleting nothing. Confirmed
-- via auth.users row count growing across repeated test runs instead of
-- staying flat.
--
-- Fix: case-insensitive lookup and guard regex.

create or replace function public.e2e_force_delete_test_user(p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if p_email !~* '^e2e-test-(coach|client)-.*@example\.com$' then
    raise exception 'e2e_force_delete_test_user: refusing to operate on non-test email %', p_email
      using errcode = 'insufficient_privilege';
  end if;

  select id into v_user_id from auth.users where lower(email) = lower(p_email);
  if v_user_id is null then
    return;
  end if;

  delete from public.client_progress_entries where created_by = v_user_id;
  delete from public.daily_checkins where created_by = v_user_id;
  delete from public.weekly_reviews where created_by = v_user_id;
  delete from public.ai_summaries where created_by = v_user_id;
  delete from public.plan_overrides where created_by = v_user_id;
  delete from public.clients where created_by = v_user_id or archived_by = v_user_id;
  delete from public.profiles where id = v_user_id;
  delete from auth.users where id = v_user_id;
end;
$$;

create or replace function public.e2e_test_user_exists(p_email text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exists boolean;
begin
  if p_email !~* '^e2e-test-(coach|client)-.*@example\.com$' then
    raise exception 'e2e_test_user_exists: refusing to operate on non-test email %', p_email
      using errcode = 'insufficient_privilege';
  end if;

  select exists(select 1 from auth.users where lower(email) = lower(p_email)) into v_exists;
  return v_exists;
end;
$$;

revoke all on function public.e2e_force_delete_test_user(text) from public;
grant execute on function public.e2e_force_delete_test_user(text) to anon, authenticated;

revoke all on function public.e2e_test_user_exists(text) from public;
grant execute on function public.e2e_test_user_exists(text) to anon, authenticated;
