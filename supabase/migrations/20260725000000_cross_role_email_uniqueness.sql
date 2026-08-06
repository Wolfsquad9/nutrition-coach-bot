-- Cross-role email uniqueness guard.
--
-- Prevents the same email address from being associated with both a coach
-- (trainer) account and a client account. Enforced at two entry points:
--   1. Coach signup (client-side RPC call before auth.signUp)
--   2. Client invite claim (inside claim_client_invitation RPC)
--
-- The check_email_role_conflict function is callable by public (unauthenticated)
-- so the signup page can check before the user exists in auth.users. It is
-- SECURITY DEFINER and only returns a boolean — no data exposure.

-- Drop the old function if it exists (we changed p_exclude_user_id from uuid to text
-- to avoid PostgREST null-UUID serialization issues).
drop function if exists public.check_email_role_conflict(text, text, uuid);
drop function if exists public.check_email_role_conflict(text, text);

-- ------------------------------------------------------------------
-- Function: check_email_role_conflict
-- Returns true if p_email already exists under a DIFFERENT role than
-- p_intended_role.  p_intended_role accepts 'coach' or 'client' (the
-- frontend-facing names); internally 'coach' is mapped to 'trainer'.
--
-- p_exclude_user_id is optional (text, cast to uuid internally): when provided
-- (e.g. from claim_client_invitation), the check skips the calling user's own
-- profile so that a client-invite claim does not false-positive on the profile
-- that handle_new_user just created.
-- ------------------------------------------------------------------
create or replace function public.check_email_role_conflict(
  p_email text,
  p_intended_role text,
  p_exclude_user_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_role text;
  v_mapped_role  text;
  v_exclude_uuid uuid;
begin
  -- Map frontend-facing role names to the app_role enum values
  v_mapped_role := case p_intended_role
    when 'coach'  then 'trainer'
    when 'client' then 'client'
    else p_intended_role
  end;

  -- Convert text to uuid if provided
  if p_exclude_user_id is not null then
    v_exclude_uuid := p_exclude_user_id::uuid;
  end if;

  -- Look for any profile with this email, optionally excluding the caller's own.
  -- Because auth.users may allow duplicate emails (different user_ids), there
  -- could be multiple rows. We only care whether ANY existing row (other than
  -- the caller's own) has a conflicting role.
  -- Use lower() for case-insensitive comparison since email addresses can be entered with mixed casing.
  select p.role::text into v_existing_role
  from public.profiles p
  where lower(p.email) = lower(p_email)
    and (v_exclude_uuid is null or p.id <> v_exclude_uuid)
  limit 1;

  if not found then
    return false;  -- No existing profile → no conflict
  end if;

  -- Conflict exists if the existing role differs from the intended one
  return v_existing_role is distinct from v_mapped_role;
end;
$$;

-- Grant execute to public so the signup page can call this before the user
-- is authenticated.  The function is SECURITY DEFINER and only returns a
-- boolean — safe for unauthenticated access.
revoke all on function public.check_email_role_conflict(text, text, text) from public;
grant execute on function public.check_email_role_conflict(text, text, text) to public;
grant execute on function public.check_email_role_conflict(text, text, text) to authenticated;
grant execute on function public.check_email_role_conflict(text, text, text) to service_role;

-- ------------------------------------------------------------------
-- Update claim_client_invitation to reject claims where the claiming
-- user's email already exists as a coach/trainer (excluding the caller's
-- own profile, which handle_new_user just created as 'trainer').
-- ------------------------------------------------------------------
create or replace function public.claim_client_invitation(p_invite_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id      uuid := auth.uid();
  v_invitation   record;
  v_user_email   text;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Get the claiming user's email from auth.users
  select email into v_user_email
  from auth.users
  where id = v_user_id;

  -- Cross-role check: if this email already belongs to a DIFFERENT user who
  -- is a coach/trainer, reject.  Exclude the caller's own profile (which
  -- handle_new_user just created as 'trainer' — it will be updated to 'client'
  -- below if the claim succeeds).
  if public.check_email_role_conflict(v_user_email, 'client', v_user_id::text) then
    raise exception 'This email is already registered as a coach account. Please use a different email to accept this invitation.';
  end if;

  select * into v_invitation
  from public.client_invitations
  where invite_token_hash = p_invite_token_hash
    and accepted_at is null
    and revoked_at is null
    and expires_at > now()
  for update;

  if not found then
    raise exception 'Invitation is invalid or expired';
  end if;

  update public.clients
  set user_profile_id = v_user_id,
      updated_at = now()
  where id = v_invitation.client_id
    and (user_profile_id is null or user_profile_id = v_user_id);

  if not found then
    raise exception 'Client is already linked to another account';
  end if;

  update public.profiles
  set trainer_id = v_invitation.created_by,
      role = 'client'::app_role,
      email = coalesce(email, v_invitation.invited_email)
  where id = v_user_id;

  update public.user_roles
  set role = 'client'::app_role,
      updated_at = now()
  where user_id = v_user_id;

  update public.client_invitations
  set accepted_by = v_user_id,
      accepted_at = now()
  where id = v_invitation.id;

  return v_invitation.client_id;
end;
$$;

-- Re-grant execute (the function was replaced, grants may be lost)
revoke all on function public.claim_client_invitation(text) from public;
grant execute on function public.claim_client_invitation(text) to authenticated;