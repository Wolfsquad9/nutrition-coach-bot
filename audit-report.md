# Production Architecture Audit Report
## Date: 2026-07-09
## Scope: Authentication, Authorization, Onboarding, Navigation
## Addendum: Single Source of Truth Design

---

## SSOT Design: The Simplification

### The Core Problem
The current system has **four competing sources of truth** for role and clientId:

| Source | Role | ClientId | When Set | Trust Level |
|--------|------|----------|----------|-------------|
| `auth.users.raw_user_meta_data` | `'client'` or missing | Never set | Signup | LOW (stale) |
| `profiles.role` | `'client'`, `'trainer'`, `'admin'` | N/A | Trigger + claim | MEDIUM (deprecated) |
| `user_roles.role` | `'client'`, `'trainer'`, `'admin'` | N/A | Trigger + claim | HIGH (authoritative) |
| `clients.user_profile_id` | N/A | client record UUID | Claim only | HIGH (authoritative) |

The application attempts to read from all four, in sequence, creating race conditions, double renders, and stale state.

---

### Decision: Single Source of Truth = Database

**Eliminate `user_metadata` as a role/clientId source entirely.**

The JWT is set at signup and never updated when the claim mutates the database. The `user_metadata.role` and `user_metadata.client_id` values are **always wrong** for invitation-based signups. There is no scenario where reading from metadata produces the correct answer and reading from the database produces the wrong answer. The converse is not true.

| Value | SSOT | Location | Why |
|-------|------|----------|-----|
| **Role** | `user_roles.role` | Database | Only authoritative source; `profiles.role` is a stale copy |
| **ClientId** | `clients.id` via `user_profile_id` | Database | Only set after claim; cannot be known at signup |
| **Coach ID** | `clients.created_by` | Database | Set at client creation, never changes |

**What belongs in JWT for performance (only):**
- `email` — always correct, no DB query needed for display
- `sub` (user ID) — always correct, set by Supabase auth
- Nothing else. Two index lookups (user_roles + clients) cost <5ms each.

**What must always be read from the database:**
- `user_roles.role` — every auth state change
- `clients.id` via `clients.user_profile_id` — every auth state change

**What can be eliminated entirely:**
1. `resolveFromMetadata()` in `useAuth.tsx` — delete the function
2. `user_metadata.role` in `SignupPage.tsx` (line 41) — no longer needed
3. `refreshFromDb()` in `useAuth.tsx` — not needed after simplification
4. `isReady` state in `useAuth.tsx` — absorbed into `isLoading`
5. `profileService.ts` — entire file is dead code (trigger handles creation)
6. `ClientClaimPage.tsx` — entire file is unreachable
7. `useEffect` navigation in `LoginPage.tsx` and `SignupPage.tsx` — replaced by immediate navigation

---

### Simplified Flow

```
Auth State Change (SIGNED_IN / TOKEN_REFRESHED / session restored)
    │
    ▼
useAuth.handleAuthChange(session)
    │
    ├─ setUser(session.user)
    ├─ setSession(session)
    │
    ├─ Promise.all([
    │     supabase.from('user_roles').select('role').eq('user_id', uid).maybeSingle(),
    │     supabase.from('clients').select('id').eq('user_profile_id', uid).maybeSingle()
    │   ])
    │
    ├─ setUserRole(role ?? 'trainer')    ← ONLY from DB, no metadata fallback
    ├─ setClientId(clientId ?? null)     ← ONLY from DB, no metadata fallback
    ├─ setIsLoading(false)               ← SINGLE loading gate
    │
    ▼
ProtectedRoute sees resolved role + clientId
    │
    ├─ isLoading? → spinner
    ├─ !isAuthenticated? → /login
    ├─ role mismatch? → redirect
    └─ render children
```

**Key simplification**: No two-phase resolution. No background refresh. No stale state window. `isLoading` is the only gate, and it stays `true` until BOTH DB queries complete.

---

### The Invitation Claim Problem

The claim RPC runs AFTER the initial auth state change. With the simplified model, the sequence is:

```
1. Auth state change (SIGNED_IN)
2. useAuth queries DB → role='trainer', clientId=null  (pre-claim state)
3. setIsLoading(false)
4. LoginPage/SignupPage runs claimClientInvitation()
5. DB updated: role='client', clientId=set
6. useAuth still has old state
```

**Solution**: Expose a `refreshAuthState()` method from `useAuth` that re-runs the DB queries and updates state. LoginPage and SignupPage call this AFTER successful claim.

```typescript
// In useAuth:
const refreshAuthState = useCallback(async () => {
  const uid = user?.id;
  if (!uid) return;

  const [{ data: roleData }, { data: clientData }] = await Promise.all([
    supabase.from('user_roles').select('role').eq('user_id', uid).maybeSingle(),
    supabase.from('clients').select('id').eq('user_profile_id', uid).maybeSingle(),
  ]);

  setUserRole((roleData?.role as 'trainer' | 'client') ?? 'trainer');
  setClientId(clientData?.id ?? null);
}, [user?.id]);
```

This is called AFTER claim, not in the background. It's explicit, deterministic, and synchronous from the caller's perspective (async but awaited).

---

### Code Paths to Eliminate

#### In `src/hooks/useAuth.tsx`:

| Current Code | Replace With |
|-------------|--------------|
| `resolveFromMetadata()` | DELETE entire function |
| `refreshFromDb()` | REPLACE with `refreshAuthState()` (explicit, not automatic) |
| `isReady` state | DELETE. `isLoading` is the only gate. |
| `useEffect` with `onAuthStateChange` | Keep, but simplified to single DB query path |
| Metadata derivation in `handleAuthChange` | Remove. Only use DB values. |

#### In `src/components/ProtectedRoute.tsx`:

| Current Code | Replace With |
|-------------|--------------|
| `isLoading` check (already correct) | Keep |
| `isReady` (not currently used) | Not needed. Removed from useAuth. |

ProtectedRoute becomes simpler: only check `isLoading` and `isAuthenticated`.

#### In `src/pages/LoginPage.tsx`:

| Current Code | Replace With |
|-------------|--------------|
| `useEffect` for navigation | DELETE entire effect |
| `handleLogin` invite flow | Navigate to `/my-plan` after claim + `refreshAuthState()` |
| `handleLogin` no invite | Navigate to `/` immediately |

No more race between useEffect and AuthProvider.

#### In `src/pages/SignupPage.tsx`:

| Current Code | Replace With |
|-------------|--------------|
| `useEffect` for navigation | DELETE entire effect |
| `handleSignup` invite flow | Navigate to `/my-plan` after claim + `refreshAuthState()` |
| `handleSignup` no invite | Navigate to `/login` immediately |
| `options.data.role = 'client'` | DELETE. Metadata is no longer used. |

#### In `src/services/profileService.ts`:

| Current Code | Replace With |
|-------------|--------------|
| Entire file | DELETE. The `handle_new_user` trigger creates profiles. `lockNutritionPlan` should not call `ensureProfileExists()`. |

#### In `src/pages/ClientClaimPage.tsx`:

| Current Code | Replace With |
|-------------|--------------|
| Entire file | DELETE. Routes don't reference it. Invitation flow uses LoginPage or SignupPage. |

#### In `src/pages/ClientCheckinPage.tsx`:

| Current Code | Replace With |
|-------------|--------------|
| `const currentUserId = userId ?? clientId` | CHANGE to `const currentUserId = userId`. If `userId` is null, the page should not render. |

---

### Database Changes Required

#### Fix the `handle_new_user` trigger:
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
  -- Always default to 'trainer' for self-serve signups
  -- client role is set by claim_client_invitation()
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

**Changes:**
1. Hardcode `'trainer'::app_role` instead of casting metadata — eliminates the enum mismatch bug
2. Remove the exception handler (no longer needed with hardcoded value)
3. Metadata `role` field is ignored entirely

#### Fix the `app_role` enum (add 'coach' for backward compatibility):
```sql
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'coach';
```
This ensures any existing data with 'coach' doesn't break. New code uses only 'trainer' and 'client'.

#### Add anonymous SELECT policy for `plan_versions`:
```sql
CREATE POLICY "Anyone can view locked plan versions"
  ON public.plan_versions FOR SELECT
  TO anon, authenticated
  USING (locked_snapshot_json IS NOT NULL AND archived = false);
```
This fixes shared plan public access.

---

### Complete File Change List

| File | Action |
|------|--------|
| `supabase/migrations/...` (new) | Fix trigger, add 'coach' to enum, add anonymous policy |
| `src/hooks/useAuth.tsx` | Rewrite: remove metadata resolution, remove isReady, add refreshAuthState() |
| `src/components/ProtectedRoute.tsx` | Remove isReady dependency (no longer exists) |
| `src/pages/LoginPage.tsx` | Remove useEffect navigation, add refreshAuthState() after claim |
| `src/pages/SignupPage.tsx` | Remove useEffect navigation, add refreshAuthState() after claim, remove metadata role |
| `src/pages/ClientCheckinPage.tsx` | Remove `userId ?? clientId` fallback |
| `src/services/profileService.ts` | DELETE entire file |
| `src/pages/ClientClaimPage.tsx` | DELETE entire file |
| `src/services/supabasePlanService.ts` | Remove `ensureProfileExists()` call in `lockNutritionPlan` |

---

### After Fix Architecture

```
                    ┌─────────────────────────────────────────┐
                    │           AUTH STATE CHANGE             │
                    │  (signin, signup, refresh, restore)     │
                    └────────────────┬────────────────────────┘
                                     │
                                     ▼
                    ┌─────────────────────────────────────────┐
                    │         useAuth.handleAuthChange        │
                    │                                         │
                    │  1. Store session + user                │
                    │  2. Query DB in parallel:               │
                    │     ├─ user_roles.role                  │
                    │     └─ clients.id (via user_profile_id) │
                    │  3. Set role, clientId, isLoading=false │
                    └────────────────┬────────────────────────┘
                                     │
                                     ▼
                    ┌─────────────────────────────────────────┐
                    │   ProtectedRoute checks:                │
                    │   - isLoading → spinner                 │
                    │   - !authenticated → /login             │
                    │   - role mismatch → redirect            │
                    │   - render children                     │
                    └─────────────────────────────────────────┘
                                     │
              ┌──────────────────────┼──────────────────────┐
              │                      │                      │
              ▼                      ▼                      ▼
    ┌─────────────────┐   ┌──────────────────┐   ┌──────────────────┐
    │ LoginPage/      │   │ Client Pages     │   │ Coach Pages      │
    │ SignupPage      │   │ (my-plan, etc.)  │   │ (clients, etc.)  │
    │                 │   │                  │   │                  │
    │ After claim:    │   │ clientId is      │   │ role is          │
    │ refreshAuthState│   │ always resolved  │   │ always resolved  │
    │ navigate(/my-   │   │ before render    │   │ before render    │
    │ plan)           │   │                  │   │                  │
    └─────────────────┘   └──────────────────┘   └──────────────────┘

    NO MORE:
    ─────────
    • Two-phase resolution
    • Metadata vs DB conflicts
    • Background refresh race conditions
    • Double redirects
    • Stale clientId
    • isReady concept
    • profileService.ts
    • ClientClaimPage.tsx
    • useEffect navigation in auth pages
    • user_metadata.role as any kind of source
```

---

### What This Simplifies (Quantified)

| Metric | Before | After |
|--------|--------|-------|
| DB queries per auth change | 3-4 (clients, user_roles, profiles, metadata) | 2 (user_roles, clients) |
| State variables in useAuth | 6 (user, session, isLoading, isReady, clientId, userRole) | 5 (user, session, isLoading, clientId, userRole) |
| Code paths for role resolution | 3 (metadata, user_roles, profiles) | 1 (user_roles) |
| Code paths for clientId resolution | 2 (metadata, clients) | 1 (clients) |
| Files to maintain | 3 auth files (useAuth, ProtectedRoute, profileService) | 2 auth files (useAuth, ProtectedRoute) |
| Race conditions | 3+ (metadata vs DB, claim vs refresh, useEffect vs ProtectedRoute) | 0 (explicit refreshAuthState after claim) |
| Redirects per auth change | Up to 2 (metadata role → DB role) | 1 (after DB resolution) |

---

### Risk Assessment for This Approach

**Risk: Initial load latency**
- Before: metadata renders instantly, DB updates 5-50ms later
- After: waits 5-50ms for DB before rendering
- Mitigation: This is acceptable. The loading spinner already shows during auth initialization. Adding 5-50ms to account for DB queries is negligible compared to the network round-trip for the auth call itself (200-500ms).

**Risk: `refreshAuthState()` creates auth event loop**
- Using `supabase.auth.updateUser()` to update metadata could trigger another `onAuthStateChange` event, causing a loop.
- Mitigation: `refreshAuthState()` does NOT touch auth metadata. It only reads from the database. No auth event is triggered.

**Risk: Claim runs before `refreshAuthState()` is called**
- If the user navigates away before the claim completes, `refreshAuthState()` is never called.
- Mitigation: This is the same risk as the current system. The navigation happens AFTER the claim + refreshAuthState complete, so this is safe.

**Risk: Losing 'coach' role backward compatibility**
- Existing users may have `user_roles.role = 'coach'` from the broken trigger.
- Mitigation: Add 'coach' to the enum. New code writes 'trainer'. Old data with 'coach' still works with `has_role_v2` checks if we update that function to also check for 'coach'.

---

### Summary

The simplification is:

1. **Database is the ONLY source of truth** for role and clientId
2. **JWT metadata is ignored** for role and clientId
3. **`isLoading` is the only loading gate** — no isReady, no two-phase resolution
4. **`refreshAuthState()` is explicit** — called only when the caller knows the DB changed
5. **Four files are deleted** (profileService.ts, ClientClaimPage.tsx, resolveFromMetadata, refreshFromDb)
6. **Two files are simplified** (ProtectedRoute removes isReady, useAuth removes 3 code paths)
7. **The trigger is simplified** — hardcoded 'trainer', no metadata cast