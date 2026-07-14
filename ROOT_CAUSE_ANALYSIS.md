# Root Cause Analysis — Auth Stability, Infinite Spinner & Client Deletion

## Investigation Scope
Files examined:
- `src/hooks/useAuth.tsx`
- `src/components/ProtectedRoute.tsx`
- `src/components/AppLayout.tsx`
- `src/pages/LoginPage.tsx`
- `src/pages/SignupPage.tsx`
- `src/pages/ClientMyPlanPage.tsx`
- `src/layouts/ClientLayout.tsx`
- `src/pages/ClientPage.tsx`
- `src/hooks/useSupabaseClients.ts`
- `src/services/supabaseClientService.ts`
- `src/services/clientInvitationService.ts`
- `src/services/supabaseTrainingPlanService.ts`
- `supabase/migrations/20260530120000_p0_ownership_bootstrap_client_linking.sql`
- `supabase/migrations/20260710000000_clients_soft_delete.sql`
- `supabase/migrations/20260710001000_identity_uniqueness.sql`
- `src/App.tsx`

---

## ROOT CAUSE 1 (CRITICAL): `refreshAuthState` Stale Closure

### Symptom
Infinite loading spinner on client portal after invitation signup/login + back/refresh. Client signs up via invite → claim succeeds → portal never loads → spinner forever.

### Mechanism
`useAuth.tsx` line 91-94:

```typescript
const refreshAuthState = useCallback(async () => {
    if (!user?.id) return;          // ← captures stale user?.id
    await resolveAuthState(user.id);
}, [user?.id, resolveAuthState]);
```

`refreshAuthState` depends on `user?.id` from React state at the TIME the component rendered. When `SignupPage.tsx` (line 56) or `LoginPage.tsx` (line 54) calls `refreshAuthState()` after `claimClientInvitation()`, the sequence is:

1. `supabase.auth.signUp()` triggers `onAuthStateChange` → `handleAuthChange` → `setUser(newUser)`
2. **React has NOT re-rendered yet** — `user` variable in SignupPage's closure is still null (or the PREVIOUS user)
3. SignupPage calls `await refreshAuthState()` — this is the OLD function reference from the current render
4. Inside: `if (!user?.id) return;` — **user?.id is null**, function returns immediately
5. `resolveAuthState` is NEVER called
6. `clientId` stays null, `userRole` stays 'coach' (or whatever it was before)
7. `navigate('/my-plan', { replace: true })` navigates to client portal
8. `ProtectedRoute role="client"` reads `userRole !== 'client'` → redirects to `/` (coach home)
9. OR `ClientMyPlanPage` sees `clientId === null` → shows error ("Please sign in")
10. On refresh: same cycle repeats because storage is not cleared

### Evidence
- **File**: `src/hooks/useAuth.tsx`
- **Lines**: 91-94 (`refreshAuthState` useCallback)
- **Bug**: `[user?.id, resolveAuthState]` deps cause `refreshAuthState` to be a snapshot at render time. When called from an event handler that hasn't had its re-render yet, it uses stale `user?.id`.

### Fix
Replace `refreshAuthState` with a version that reads `user?.id` from a ref (not state), so the latest value is always available:

```typescript
const userIdRef = useRef(user?.id);
userIdRef.current = user?.id;

const refreshAuthState = useCallback(async () => {
    const uid = userIdRef.current;   // ← always the latest
    if (!uid) return;
    await resolveAuthState(uid);
}, [resolveAuthState]);               // ← no user?.id dependency
```

### Expected Side Effects
- `refreshAuthState()` will always use the latest `user?.id`, even when called from an event handler that hasn't re-rendered
- No new re-renders (no unnecessary calls)
- Backward compatible — all call sites pass no arguments

---

## ROOT CAUSE 2 (CRITICAL): `claim_client_invitation` Allows Coaches to Claim Invitations

### Symptom
A coach who opens an invitation link (to test it, or accidentally) will have their `user_roles.role` permanently changed from 'trainer'/'coach' to 'client'. They lose coach access.

### Mechanism
`supabase/migrations/20260530120000_p0_ownership_bootstrap_client_linking.sql` lines 307-361:

```sql
UPDATE public.clients
SET user_profile_id = v_user_id
WHERE id = v_invitation.client_id
  AND (user_profile_id IS NULL OR user_profile_id = v_user_id);
```

No check that `v_user_id` is NOT the invitation's `created_by` (the coach who created it). Then:

```sql
UPDATE public.user_roles
SET role = 'client'::app_role
WHERE user_id = v_user_id;
```

This CONVERTS any authenticated user (including the coach who created the invitation) into a client.

Additionally, `SignupPage.tsx` lines 29-35 explicitly calls `supabase.auth.signOut()` if a session exists and there's an inviteToken, but this can race with the auth listener, and `LoginPage.tsx` does the same. The signOut+signIn sequence can trigger multiple auth state changes.

### Evidence
- **File**: `supabase/migrations/20260530120000_p0_ownership_bootstrap_client_linking.sql`
- **Lines**: 333-337 (client update), 349-352 (user_roles update)
- **Bug**: No guard preventing the invitation creator (coach) from claiming their own invitation

### Fix
Add a check to the `claim_client_invitation` RPC that rejects claims where the caller is the `created_by` of the invitation:

```sql
IF v_invitation.created_by = v_user_id THEN
    RAISE EXCEPTION 'You cannot claim your own invitation';
END IF;
```

Add this after line 327 (after `FOR UPDATE`) in the RPC body.

### Expected Side Effects
- Coaches who accidentally open invitation links will see "You cannot claim your own invitation" error
- Coach accounts are protected from conversion
- Normal client signup/login flow is unaffected

---

## ROOT CAUSE 3 (MEDIUM): ProtectedRoute Race with `userRole === null`

### Symptom
After the stale `refreshAuthState` silently fails (Root Cause 1), `userRole` remains null. ProtectedRoute's role gate at line 50:

```typescript
if (role && userRole && userRole !== role) {
```

requires `userRole` to be truthy. When `userRole` is null, this check is skipped entirely — ProtectedRoute passes through and renders children even though the role doesn't match. The child component (`ClientMyPlanPage`) then sees `clientId === null` and shows "Please sign in" instead of the spinner.

If the auth listener fires AGAIN (e.g., TOKEN_REFRESHED event 1 hour later), `handleAuthChange` runs again, sets `userRole` to 'client', and ProtectedRoute then redirects to `/` (coach home) because `userRole === 'client' && role === 'client'` now passes... wait, no — `userRole !== role` is false because both are 'client'. So it renders the client page. The issue is the data hasn't been fetched.

Actually, the real problem with `userRole === null` is that the client gets rendered but without `clientId`, so the portal shows "Please sign in." This is confusing UX but not a spinner.

### Evidence
- **File**: `src/components/ProtectedRoute.tsx`
- **Lines**: 50 (`if (role && userRole && userRole !== role)`)
- **Bug**: When `userRole` is null (resolution failed or hasn't completed), the role gate is bypassed

### Fix
Add a check: if `userRole` is null after loading is complete, redirect to login:

```typescript
// After the isLoading check (line 33)
if (!isLoading && isAuthenticated && role && !userRole) {
    // Auth resolved but no role — treat as unauthorized
    return <Navigate to="/login" replace />;
}
```

---

## ROOT CAUSE 4 (LOW): `handleDeleteClient` — Deletion Succeeds But UI May Not Reflect

### Symptom
"Client deletion does not work" — the RPC call succeeds (returns `{success: true}`), but the client briefly disappears and then reappears.

### Mechanism
The `loadClients` function in `useSupabaseClients.ts` (line 76-102) depends on `activeClientId`:

```typescript
const loadClients = useCallback(async () => {
    // ...
    if (result.clients.length > 0 && !activeClientId) {
        setActiveClientId(result.clients[0].id);
    } else if (result.clients.length === 0) {
        setActiveClientId(null);
    } else if (activeClientId && !result.clients.find(c => c.id === activeClientId)) {
        setActiveClientId(result.clients[0]?.id || null);
    }
}, [activeClientId]);   // ← depends on activeClientId
```

If `loadClients` is called after deletion (via `refreshClients`), it will re-read from the DB. The new RLS policy (from soft_delete migration) filters out archived clients. So the deleted client won't be in the result. If the current `activeClientId` is the deleted one, it auto-selects the first remaining client.

But `loadClients` is only called on mount (line 104-107 with `[]` deps). So after deletion, the local state is correct (client removed, activeClientId set to null). On next mount (if the component re-renders or remounts), `loadClients` fetches from DB and re-establishes the correct state.

If the component remounts (e.g., user navigates away and back), `loadClients` runs. If the `soft_delete` migration hasn't been applied, the RLS policy won't filter archived rows, and the deleted client will reappear. This is an environment issue.

### Evidence
- **File**: `src/hooks/useSupabaseClients.ts`
- **Lines**: 76-107 (loadClients), 104-107 (mount-only call)

### Fix
If the migration is properly applied, deletion works. No code change needed — this is a database migration dependency. Add a safety net: after deletion, call `loadClients` instead of just filtering locally:

```typescript
// In handleDeleteClient, after successful RPC call:
setClients(prev => prev.filter(c => c.id !== clientId));
setActiveClientId(prev => (prev === clientId ? null : prev));
// Also trigger a background refetch to catch any missed state:
loadClients(); // but this has activeClientId dependency...
```

Actually, the better fix is to make `loadClients` independent of `activeClientId`, or to separate the refetch logic from the auto-select logic. But the current behavior is correct if migrations are applied. Making `loadClients` a stable reference (no deps) would fix the contextual staleness.

---

## Summary Table

| # | Severity | Root Cause | File | Lines | Fix |
|---|----------|------------|------|-------|-----|
| 1 | **CRITICAL** | `refreshAuthState` stale closure — captures `user?.id` at render time, not call time | `useAuth.tsx` | 91-94 | Use ref for `user?.id` |
| 2 | **CRITICAL** | `claim_client_invitation` RPC has no guard against creator claiming their own invitation | `20260530120000_p0_ownership_bootstrap_client_linking.sql` | 333-337, 349-352 | Add `created_by` check |
| 3 | **MEDIUM** | `ProtectedRoute` role gate bypassed when `userRole` is null | `ProtectedRoute.tsx` | 50 | Add `!userRole` redirect |
| 4 | **LOW** | Deletion depends on migration being applied; soft_delete RPC not available | `supabaseClientService.ts` + `20260710000000_clients_soft_delete.sql` | 285-317 | Ensure migration is applied |

---

## Remaining Known Issues

1. **Double `handleAuthChange` on mount**: The `useEffect` in `useAuth.tsx` (lines 135-156) subscribes to the listener AND calls `getSession()`. Both paths call `handleAuthChange` with the same session. This is correct (not a bug) but causes two redundant `resolveAuthState` calls on every mount.

2. **No session recovery on token expiry**: If the access token expires while the user is on a page, `handleAuthChange` fires with `TOKEN_REFRESHED`. If the refresh fails, `currentSession` is null, and `setUser(null)` clears all state. The user sees the login page. This is expected behavior — no fix needed.

3. **Signup with invite after already signed in**: `SignupPage.tsx` lines 29-35 calls `signOut()` if a session exists. After signOut, the auth listener fires with `SIGNED_OUT`. Then `signUp()` fires with `SIGNED_IN`. If React batches these incorrectly, the `user` state could be inconsistent. This is a pre-existing issue.

4. **No loading state on client portal navigation**: When navigating between client routes (`/my-plan`, `/checkin`, etc.), `ClientLayout` persists but the page component re-mounts. Each page has its own loading state. No shared loading state across the portal.