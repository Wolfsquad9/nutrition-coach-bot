# Authentication Incident Report

## Executive Summary

**Root Cause: The `handle_new_user` trigger attempts to cast `'coach'::app_role`, but `'coach'` is not a valid value in the `app_role` enum.**

The `app_role` enum is defined as `ENUM ('client', 'trainer', 'admin')` in migration `20251120110128`. The `handle_new_user` trigger (last updated in migration `20260530120000`) tries to assign `'coach'::app_role` as a fallback default. This cast throws a PostgreSQL error because `'coach'` is not in the enum. The exception handler also tries `'coach'::app_role`, which also fails. The entire trigger aborts, no `profiles` or `user_roles` row is created, and the user is left with no role in the database. The application then sees `userRole = null` and redirects the authenticated user back to the login page.

**Impact: Every new user sign-up is broken. Existing users who signed up before the trigger change (main branch baseline) may still work if their `user_roles` row was created by the old trigger.**

---

## Evidence

### Finding 1: `app_role` enum definition — `'coach'` does not exist

**File:** `supabase/migrations/20251120110128_8df2ce8c-85a8-4e93-b31d-9d731f883512.sql`
**Line:** 2

```sql
CREATE TYPE public.app_role AS ENUM ('client', 'trainer', 'admin');
```

The enum has exactly three values: `client`, `trainer`, `admin`. There is no `'coach'` value. No subsequent migration adds `'coach'` to the enum.

### Finding 2: `handle_new_user` trigger attempts invalid cast

**File:** `supabase/migrations/20260530120000_p0_ownership_bootstrap_client_linking.sql`
**Lines:** 71-103

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role app_role;
BEGIN
  -- Derive initial role from signup metadata, default to 'coach' (self-serve signups are coaches)
  -- Uses a safe cast to avoid errors if metadata contains an invalid app_role value
  BEGIN
    v_role := COALESCE(
      (NEW.raw_user_meta_data->>'role')::app_role,   -- Line 84: cast metadata to app_role
      'coach'::app_role                                -- Line 85: 'coach' is NOT in the enum!
    );
  EXCEPTION WHEN OTHERS THEN
    v_role := 'coach'::app_role;                       -- Line 88: ALSO fails — 'coach' not in enum
  END;

  INSERT INTO public.profiles (id, role, email, full_name)
  VALUES (NEW.id, v_role, ...);                        -- Line 92: never reached if cast fails

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, v_role)                              -- Line 98: never reached if cast fails
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$function$;
```

**Failure mechanism:**

1. `(NEW.raw_user_meta_data->>'role')::app_role` — If signup metadata has no `role` field (typical for self-serve signups), this evaluates to `NULL::app_role`, which is valid SQL (NULL cast to enum is NULL).
2. `COALESCE(NULL, 'coach'::app_role)` — This tries to cast the string `'coach'` to `app_role`. Since `'coach'` is not in the enum `('client', 'trainer', 'admin')`, PostgreSQL throws:
   ```
   ERROR: invalid input value for enum app_role: "coach"
   ```
3. The `EXCEPTION WHEN OTHERS THEN` block catches this and tries `v_role := 'coach'::app_role` — which throws the **same error**.
4. The exception propagates up, aborting the entire trigger function.
5. No `profiles` row is inserted. No `user_roles` row is inserted.
6. The `on_auth_user_created` trigger fails silently from the application's perspective (Supabase still creates the auth user).

### Finding 3: `useAuth.tsx` correctly queries DB but gets null

**File:** `src/hooks/useAuth.tsx`
**Lines:** 68-91

```tsx
const resolveAuthState = useCallback(async (uid: string) => {
    const [{ data: roleData }, { data: clientData }] = await Promise.all([
      supabase.from('user_roles').select('role').eq('user_id', uid).maybeSingle(),
      supabase.from('clients').select('id').eq('user_profile_id', uid).maybeSingle(),
    ]);

    const dbRole = roleData?.role;
    const mappedRole: 'coach' | 'client' | null =
      dbRole === 'client' ? 'client' :
      dbRole === 'trainer' ? 'coach' :
      null;    // ← This is the path taken when no user_roles row exists

    setUserRole(mappedRole);  // ← Sets to null
    setClientId(clientData?.id ?? null);
}, []);
```

When the trigger fails, `user_roles` has no row for this user. `roleData` is `null`. `mappedRole` is `null`. `userRole` is set to `null`.

### Finding 4: `ProtectedRoute` redirects authenticated users with null role to login

**File:** `src/components/ProtectedRoute.tsx`
**Lines:** 52-57

```tsx
if (role && !userRole) {
    if (lastRedirectRef.current !== '/login') {
      lastRedirectRef.current = '/login';
    }
    return <Navigate to="/login" replace />;
}
```

The user IS authenticated (session exists), but `userRole` is `null`. ProtectedRoute redirects to `/login`. The user sees the login page despite being signed in.

### Finding 5: `has_role_v2` cannot match `'coach'` even if it were stored

**File:** `supabase/migrations/20260204093412_f73c3f6a-9840-4869-a511-dfe4df8a73d0.sql`
**Lines:** 31-44

```sql
CREATE OR REPLACE FUNCTION public.has_role_v2(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;
```

This function compares `user_roles.role` against the `_role` parameter. All RLS policies call `has_role_v2(auth.uid(), 'trainer')` or `has_role_v2(auth.uid(), 'admin')`. If a user somehow had `role = 'coach'` stored, `has_role_v2(auth.uid(), 'trainer')` would return `false`, and the user would have no access to coach resources.

### Finding 6: The `claim_client_invitation` function correctly uses `'client'::app_role`

**File:** `supabase/migrations/20260710002000_prevent_coach_self_claim.sql`
**Lines:** 56-59

```sql
UPDATE public.user_roles
SET role = 'client'::app_role,    -- 'client' IS in the enum — this works
    updated_at = now()
WHERE user_id = v_user_id;
```

The claim flow works correctly because `'client'` is a valid enum value. But the claim flow is never reached if the trigger fails at signup.

### Finding 7: Original trigger (before Sprint 1.9) used `'client'::app_role` — no bug

**File:** `supabase/migrations/20260204093412_f73c3f6a-9840-4869-a511-dfe4df8a73d0.sql`
**Lines:** 82-83

```sql
INSERT INTO public.profiles (id, role, email)
VALUES (NEW.id, 'client'::app_role, NEW.email)
```

The original trigger hardcoded `'client'::app_role` — a valid enum value. The Sprint 1.9 migration (`20260530120000`) changed this to derive from metadata with `'coach'` fallback, introducing the bug.

---

## Root Cause Ranking

### 1. MOST LIKELY: `handle_new_user` trigger casts `'coach'::app_role` which is not in the enum

**Probability: >95%**

- **Evidence:** The enum is `('client', 'trainer', 'admin')`. The trigger tries `'coach'::app_role`. This is a hard PostgreSQL type error.
- **Reproduction:** Sign up any new user. The trigger will fail. The user will have no `profiles` or `user_roles` row. The application will redirect them back to login.
- **Affected users:** ALL new sign-ups since the `20260530120000` migration was applied. Existing users who signed up before this migration may have valid `user_roles` rows from the old trigger.

### 2. SECOND MOST LIKELY: `handle_new_user` trigger exception handler also uses `'coach'::app_role`

**Probability: 100% (if #1 is confirmed)**

- The `EXCEPTION WHEN OTHERS THEN v_role := 'coach'::app_role;` block is supposed to be a safety net, but it uses the same invalid value. The exception handler itself throws an exception, which propagates up and aborts the trigger.
- **Fix:** Change the exception handler to use `'trainer'::app_role` (or `'client'::app_role`).

### 3. LESS LIKELY: RLS policy on `clients` table blocks `resolveAuthState`

**Probability: <5%**

- The `clients` SELECT policy in `20260710000000_clients_soft_delete.sql` adds `archived_at IS NULL`. If a client record has `archived_at` set, the query `supabase.from('clients').select('id').eq('user_profile_id', uid).maybeSingle()` would return no rows.
- This would only affect clientId resolution, not role resolution. The user would still have a valid role from `user_roles`.
- This is a secondary issue, not the primary cause of sign-in failure.

### 4. LESS LIKELY: `useAuth.tsx` race condition in `handleAuthChange`

**Probability: <5%**

- The `handleAuthChange` function is called from both the `onAuthStateChange` listener and the `getSession().then()` callback. Both can run in parallel.
- The code acknowledges this: "That double-resolution is wasteful but correct."
- This could cause a brief flash of incorrect state, but would self-correct on the next resolution. Not the primary cause.

---

## Remediation Plan

### Fix 1: Add `'coach'` to the `app_role` enum (IMMEDIATE — unblock sign-in)

**Why:** The trigger uses `'coach'::app_role`. Adding `'coach'` to the enum makes this cast valid. This is the minimal fix to unblock sign-in.

**File affected:** New migration (e.g., `20260715000000_add_coach_to_app_role.sql`)

**Implementation:**
```sql
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'coach';
```

**Risk:** LOW. Adding a value to a PostgreSQL enum is safe and does not require a table rewrite. Existing data with `'client'`, `'trainer'`, or `'admin'` is unaffected.

**Note:** This fix alone is sufficient to unblock sign-in, but it creates a data inconsistency: new users will have `role = 'coach'` in `user_roles`, but `has_role_v2(auth.uid(), 'trainer')` will return `false` for them. Fix 2 addresses this.

### Fix 2: Update `handle_new_user` trigger to use `'trainer'::app_role` (CORRECT — production quality)

**Why:** The intended behavior is that self-serve sign-ups become coaches/trainers. The database uses `'trainer'` (not `'coach'`) as the enum value. The trigger should use `'trainer'::app_role` which IS a valid enum value.

**File affected:** New migration (e.g., `20260715000001_fix_handle_new_user_trigger.sql`)

**Implementation:**
```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role app_role;
BEGIN
  -- Self-serve signups are trainers (coaches) by default.
  -- Client role is set by claim_client_invitation().
  -- Hardcode 'trainer' — do NOT read from metadata to avoid enum cast errors.
  v_role := 'trainer'::app_role;

  INSERT INTO public.profiles (id, role, email, full_name)
  VALUES (NEW.id, v_role, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email))
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, v_role)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$function$;
```

**Changes from current:**
1. Remove the `BEGIN/EXCEPTION/END` block — no longer needed
2. Remove the metadata cast — eliminates the enum mismatch risk entirely
3. Hardcode `'trainer'::app_role` — valid enum value, matches `has_role_v2` checks
4. Keep the `ON CONFLICT` for idempotency

**Risk:** LOW. This is a well-understood change. The trigger is only called on `INSERT` to `auth.users`, which happens during sign-up. Existing users are unaffected.

### Fix 3: Update `has_role_v2` to also match `'coach'` for backward compatibility (SAFETY NET)

**Why:** If any existing users have `role = 'coach'` in `user_roles` (from a partial trigger execution or manual data), they should still be recognized as trainers.

**File affected:** New migration (e.g., `20260715000002_update_has_role_v2.sql`)

**Implementation:**
```sql
CREATE OR REPLACE FUNCTION public.has_role_v2(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND (
        role = _role
        OR (_role = 'trainer' AND role = 'coach'::app_role)
      )
  )
$$;
```

**Risk:** LOW. This is a backward-compatible change. It only adds an additional match condition.

### Fix 4: Add migration to fix existing broken user rows (DATA REPAIR)

**Why:** Users who signed up while the bug was active have no `profiles` or `user_roles` rows. They need to be created retroactively.

**File affected:** New migration (e.g., `20260715000003_fix_orphaned_auth_users.sql`)

**Implementation:**
```sql
-- Insert missing profiles for auth users who signed up during the broken trigger period
INSERT INTO public.profiles (id, role, email, full_name, created_at, updated_at)
SELECT
  au.id,
  'trainer'::app_role,
  au.email,
  au.raw_user_meta_data->>'full_name',
  au.created_at,
  au.created_at
FROM auth.users au
WHERE au.id NOT IN (SELECT id FROM public.profiles)
ON CONFLICT (id) DO NOTHING;

-- Insert missing user_roles for those same users
INSERT INTO public.user_roles (user_id, role, created_at, updated_at)
SELECT
  au.id,
  'trainer'::app_role,
  au.created_at,
  au.created_at
FROM auth.users au
WHERE au.id NOT IN (SELECT user_id FROM public.user_roles)
ON CONFLICT (user_id) DO NOTHING;
```

**Risk:** MEDIUM. This modifies production data. Should be reviewed carefully and tested on a staging environment first. The `ON CONFLICT` clauses make it idempotent.

### Fix 5: Update `useAuth.tsx` role mapping to handle `'coach'` from DB (FRONTEND SAFETY)

**Why:** If any user has `role = 'coach'` in the database (from the broken trigger or manual data), the frontend should still map it correctly.

**File affected:** `src/hooks/useAuth.tsx`
**Lines:** 83-87

**Current code:**
```tsx
const mappedRole: 'coach' | 'client' | null =
  dbRole === 'client' ? 'client' :
  dbRole === 'trainer' ? 'coach' :
  null;
```

**Updated code:**
```tsx
const mappedRole: 'coach' | 'client' | null =
  dbRole === 'client' ? 'client' :
  dbRole === 'trainer' || dbRole === 'coach' ? 'coach' :
  null;
```

**Risk:** LOW. This is a defensive change. If no user has `role = 'coach'`, this code path is never hit.

---

## Validation Plan

### Automated Test: Trigger behavior verification

Create a test script that:
1. Creates a test user via `supabase.auth.signUp()` (or simulates the trigger by inserting into `auth.users`)
2. Verifies that `public.profiles` has a row for the new user
3. Verifies that `public.user_roles` has a row for the new user with `role = 'trainer'`
4. Verifies that `public.has_role_v2(new_user_id, 'trainer')` returns `true`

### Manual Verification Steps

1. **New coach sign-up:**
   - Navigate to `/signup`
   - Enter email and password
   - Submit
   - Verify redirect to `/login` with toast "Please check your email to confirm your account"
   - Confirm email (via Supabase dashboard or email link)
   - Sign in with email and password
   - Verify redirect to coach dashboard (`/`)
   - Verify `user_roles` has row: `SELECT * FROM public.user_roles WHERE user_id = '<new_user_id>'` → `role = 'trainer'`

2. **Client invitation flow:**
   - As a coach, create a client and send invitation
   - Open invitation link in incognito browser
   - Sign up with email and password
   - Verify redirect to `/my-plan` after claim
   - Verify `user_roles` has row: `SELECT * FROM public.user_roles WHERE user_id = '<client_user_id>'` → `role = 'client'`

3. **Existing user sign-in:**
   - Sign in as an existing coach who signed up before the fix
   - Verify redirect to coach dashboard
   - Verify `userRole` is `'coach'` in the application

4. **Session persistence:**
   - Sign in, close browser, reopen
   - Verify automatic session restoration
   - Verify no redirect loop

### Acceptance Criteria

| # | Criterion | How to Verify |
|---|-----------|---------------|
| 1 | New user sign-up creates `profiles` row | `SELECT * FROM public.profiles WHERE id = '<uid>'` returns 1 row |
| 2 | New user sign-up creates `user_roles` row with `role = 'trainer'` | `SELECT * FROM public.user_roles WHERE user_id = '<uid>'` returns `role = 'trainer'` |
| 3 | New user can sign in and reach coach dashboard | Manual: sign in → redirect to `/` |
| 4 | Client invitation claim sets `role = 'client'` | `SELECT * FROM public.user_roles WHERE user_id = '<uid>'` returns `role = 'client'` |
| 5 | Client can sign in and reach `/my-plan` | Manual: sign in → redirect to `/my-plan` |
| 6 | Existing users unaffected | Sign in as existing user → normal dashboard |
| 7 | No redirect loop on auth state change | Monitor `ProtectedRoute` redirects — should be exactly 0 or 1 per auth change |
| 8 | `has_role_v2` returns correct results | `SELECT public.has_role_v2('<uid>', 'trainer')` returns `true` for coaches |
| 9 | `has_role_v2` returns correct results for clients | `SELECT public.has_role_v2('<uid>', 'client')` returns `true` for clients |

### Rollback Plan

If the fix causes issues:

1. **Revert the migration:** `supabase migration repair --status reverted <migration_timestamp>`
2. **Re-apply the old trigger:** Run the previous `CREATE OR REPLACE FUNCTION public.handle_new_user()` from `20260204093412`
3. **Verify:** Sign-in flow returns to previous behavior

---

## Summary

The sign-in breakage is caused by a single line in the `handle_new_user` trigger:

```sql
'coach'::app_role  -- 'coach' is NOT in the app_role enum ('client', 'trainer', 'admin')
```

This causes the trigger to fail on every new user sign-up, leaving the user with no `profiles` or `user_roles` row. The application then sees `userRole = null` and redirects the authenticated user back to the login page.

**The fix is to change `'coach'::app_role` to `'trainer'::app_role` in the trigger, and add `'coach'` to the enum for backward compatibility.**

The remediation plan provides five ordered fixes, from the minimal enum addition to unblock sign-in immediately, to the production-quality trigger rewrite and data repair for affected users.