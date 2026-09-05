# Sprint 1.9 Regression Report
## Baseline: Sprint 1.75 (main @ 904d806)
## Target: Sprint 1.9 (HEAD @ f55a5fc)

---

## Files Changed (18 files, +1783/-355 lines)

### Modified Files (8):
| File | Change |
|------|--------|
| `src/hooks/useAuth.tsx` | +177 lines, complete rewrite |
| `src/components/ProtectedRoute.tsx` | +35 lines, added role prop + isReady |
| `src/App.tsx` | +21 lines, added client routes |
| `src/pages/LoginPage.tsx` | +49 lines, replaced immediate navigation with useEffect |
| `src/pages/SignupPage.tsx` | +45 lines, replaced immediate navigation with useEffect |
| `src/pages/ClientPage.tsx` | +121 lines, added invitation/email UI and client layout link |
| `src/layouts/ClientLayout.tsx` | +6 lines (minor) |
| `src/services/sharePlanService.ts` | +31 lines, switched from apikey to bearer auth |
| `supabase/migrations/20260530120000_p0_ownership_bootstrap_client_linking.sql` | +15 lines, changed handle_new_user trigger |

### New Files (7):
| File | Lines |
|------|-------|
| `src/pages/ClientMyPlanPage.tsx` | 203 |
| `src/pages/ClientAlertsPage.tsx` | 141 |
| `src/pages/ClientMessagesPage.tsx` | 127 |
| `src/pages/ClientCheckinPage.tsx` | 68 |
| `src/pages/ClientProgressPage.tsx` | 45 |
| `src/services/checkin/alertService.ts` | 56 |
| `supabase/migrations/20260708090000_fix_coach_messages_client_rls.sql` | 58 |

---

## REGRESSION 1 (CRITICAL): clientId Resolution — Synchronous → Asynchronous

**Sprint 1.75:**
```tsx
const clientId = user ? (user.user_metadata?.client_id ?? null) : null;
```
Synchronous, zero database queries, available immediately on auth state change.

**Sprint 1.9:**
```tsx
const [clientId, setClientId] = useState<string | null>(null);
// DB query: supabase.from('clients').select('id').eq('user_profile_id', uid)
```

**Impact:** `clientId` now requires a network round-trip. During this window, every client page (ClientMyPlanPage, ClientCheckinPage, ClientProgressPage, ClientAlertsPage, ClientMessagesPage, ClientLayout) shows "Please sign in to view your plan." or a loading spinner.

**Broken scenario:** Auth state changes (token refresh, session restoration on browser reopen) → clientId is briefly null → consumer pages show error states → flicker on every re-auth.

---

## REGRESSION 2 (CRITICAL): Role Resolution — Synchronous → Asynchronous

**Sprint 1.75:**
```tsx
const userRole = user ? (user.user_metadata?.role ?? 'coach') : null;
```
Synchronous, zero DB queries.

**Sprint 1.9:**
```tsx
// Up to 3 sequential DB queries:
// 1. user_roles table
// 2. profiles table (fallback)
// 3. user_metadata (final fallback)
```
Asynchronous, adds network latency. During this window, `userRole` is null, causing ProtectedRoute to potentially redirect incorrectly.

---

## REGRESSION 3 (HIGH): Login Navigation — DEADLOCK RISK

**Sprint 1.75** (LoginPage.handleLogin):
```tsx
// After login with invite:
const claimResult = await claimClientInvitation(inviteToken);
navigate(claimResult.clientId ? `/clients/${claimResult.clientId}/nutrition` : '/');

// After login without invite:
navigate('/');
```
Immediate, deterministic navigation after login.

**Sprint 1.9** (LoginPage.handleLogin):
```tsx
if (inviteToken && data.session) {
  const claimResult = await claimClientInvitation(inviteToken);
  // ...toast...
  setSubmitting(false);
  // NOTE: NO navigation here — relies on useEffect below
  return;
}
setSubmitting(false);
// useEffect navigates based on AuthProvider resolution:
useEffect(() => {
  if (!isReady || !isAuthenticated) return;
  if (userRole === 'client') navigate('/my-plan', { replace: true });
  else if (userRole === 'coach') navigate('/', { replace: true });
}, [isReady, isAuthenticated, userRole, inviteToken, navigate]);
```

**Impact:**
1. **DEADLOCK**: If `claimClientInvitation` succeeds, the DB is updated but the useEffect may fire BEFORE the AuthProvider re-resolves the role. `userRole` is still 'coach' (from signup metadata) → navigates to `/` instead of `/my-plan`.
2. **RACE CONDITION**: Original navigated immediately after claim. New relies on useEffect dependency array re-evaluation, which may not fire if `isReady` and `isAuthenticated` haven't changed.
3. **Invite-token guard**: The useEffect has `if (inviteToken) return;` — but the code after claim sets `setSubmitting(false)` and returns, never triggering a navigation at all.

---

## REGRESSION 4 (HIGH): Signup Navigation — BROKEN INVITE FLOW

**Sprint 1.75** (SignupPage.handleSignup):
```tsx
if (inviteToken && data.session) {
  const claimResult = await claimClientInvitation(inviteToken);
  navigate(claimResult.clientId ? `/clients/${claimResult.clientId}/nutrition` : '/');
  return;
}
navigate('/login');
```

**Sprint 1.9:**
```tsx
if (inviteToken && data.session) {
  const claimResult = await claimClientInvitation(inviteToken);
  setSubmitting(false);
  // NOTE: NO navigation — "AuthProvider will resolve the new clientId and role"
  return;
}
setSubmitting(false);
// No navigation at all for non-invite flow
```

**Impact:**
1. **BROKEN INVITE FLOW**: After signup with invite + claim, user sits on the signup page. The AuthProvider may never re-fire because the auth `SIGNED_IN` event already fired before the claim completed.
2. **MISSING POST-SIGNUP NAVIGATION**: Original navigated to `/login` after non-invite signup (to tell user to check email). New doesn't navigate at all — user sits on the signup form after clicking "Sign up".
3. **POTENTIAL STUCK STATE**: If `handleAuthChange` fires after signup but before claim, `isReady` becomes `true` with `userRole = 'coach'` (from metadata), and the useEffect navigates to `/` instead of showing the intended flow.

---

## REGRESSION 5 (HIGH): ProtectedRoute — Original Had NO Role Filtering

**Sprint 1.75:**
```tsx
export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  // Only checks isAuthenticated/isLoading
  // No role prop, no role gating
}
```

**Sprint 1.9:**
```tsx
export default function ProtectedRoute({ children, role }: ProtectedRouteProps) {
  // Added: isReady check, role-based access control
  // Coach routes: <ProtectedRoute role="coach"><AppLayout /></ProtectedRoute>
  // Client routes: <ProtectedRoute role="client"><ClientLayout /></ProtectedRoute>
}
```

**Impact:**
1. The role-gating in `App.tsx` wraps coach routes AND client routes in separate role-based ProtectedRoute instances — this is new behavior not present in Sprint 1.75.
2. Any other code using `<ProtectedRoute>` without a `role` prop (e.g., from tests or future components) will still work, but the new `isReady` check may cause additional loading time.

---

## REGRESSION 6 (MEDIUM): Loading Flicker on Every Auth State Change

**Sprint 1.9** has a `handleAuthChange` that resets `isReady` to `false` on every auth state change:
```tsx
if (currentUser) {
  setIsReady(false);  // ← resets every time
  await resolveAuthState(currentUser, currentSession);
}
```

This means every `onAuthStateChange` event (including token refresh, which happens periodically) causes:
- `isReady` → false
- All ProtectedRoute instances → loading spinner
- All page content → unmounts
- After DB queries complete → content remounts

**Sprint 1.75:** No `isReady` — `isLoading` only set once.

---

## REGRESSION 7 (MEDIUM): Shared Plan Public Access Broken

**Sprint 1.75:** `fetchSharedPlan` used `apikey` header — no authentication required. Shared plan links worked for anyone.

**Sprint 1.9:** `fetchSharedPlan` now sends `Authorization: Bearer ${token}` and returns error "Not authenticated. Please sign in" if no token found.

**Impact:** The `/plan/:shareId` route in `App.tsx` is PUBLIC (no ProtectedRoute wrapper), but the service now requires authentication. Anonymous users visiting a shared plan link see an error.

---

## REGRESSION 8 (MEDIUM): ClientPage invitation/email UI — Functional but FRAGILE

Sprint 1.9 added 121 lines to `src/pages/ClientPage.tsx`. The original Sprint 1.75 ClientPage was purely client CRUD. The additions include invitation creation UI, email entry, and a link to the client layout.

**Fragility:** The new invitation UI calls `createClientInvitation()` which relies on the `client_id` from the `clients` table. If the client record doesn't have `user_profile_id` set yet (invited but not claimed), the invitation creation is still valid, but the RLS policies depend on `created_by = auth.uid()`.

---

## REGRESSION 9 (LOW): handle_new_user Trigger — app_role Cast Safety

**Sprint 1.9 change:**
```sql
v_role := COALESCE(
  (NEW.raw_user_meta_data->>'role')::app_role,
  'coach'::app_role
);
```

The cast `(NEW.raw_user_meta_data->>'role')::app_role` will FAIL if signup metadata contains a value that is not in the `app_role` enum. The original hardcoded `'trainer'` never had this risk.

---

## REGRESSION 10 (LOW): ClientClaimPage Unchanged — Inconsistent Routing

`src/pages/ClientClaimPage.tsx` was NOT updated in Sprint 1.9 (no changes shown in git diff). It still navigates to `/checkin` after signup:
```tsx
navigate('/checkin', { replace: true });
```

But the new routing structure has client routes under `<ProtectedRoute role="client"><ClientLayout /></ProtectedRoute>`, and `/checkin` IS a valid client route. However, the new `ProtectedRoute` checks `isReady` which the old `ClientClaimPage` doesn't account for.

---

## Summary Table

| # | Severity | Category | Description |
|---|----------|----------|-------------|
| 1 | **CRITICAL** | Auth | clientId resolution changed from synchronous to asynchronous — all pages now have a network-dependent delay |
| 2 | **CRITICAL** | Auth | role resolution changed from synchronous to asynchronous — all route guards have a network-dependent delay |
| 3 | **HIGH** | Login | Login with invite may deadlock: useEffect skips navigation, AuthProvider may not re-fire |
| 4 | **HIGH** | Signup | Signup with invite doesn't navigate after claim — user stuck on signup page |
| 5 | **HIGH** | Routing | ProtectedRoute added `isReady` check — any component not using `isReady` sees inconsistent state |
| 6 | **MEDIUM** | Loading | Every auth state change resets `isReady` causing loading spinner flicker |
| 7 | **MEDIUM** | Shared Plan | Public share links broken — now requires authentication |
| 8 | **MEDIUM** | ClientPage | New invitation/email UI added but has RLS dependency on coaches being `created_by` |
| 9 | **LOW** | DB | `handle_new_user` trigger may fail on invalid app_role metadata cast |
| 10 | **LOW** | ClientClaimPage | Old page still navigates to `/checkin` without considering `isReady` |

---

## Features Lost vs Sprint 1.75

1. **Deterministic post-login navigation** — Sprint 1.75 navigated immediately. Sprint 1.9 relies on async useEffect.
2. **Deterministic post-signup navigation** — Sprint 1.75 navigated immediately. Sprint 1.9 doesn't navigate at all after non-invite signup.
3. **Public shared plan access** — Sprint 1.75 allowed anonymous viewing. Sprint 1.9 requires authentication.
4. **Synchronous auth state** — Sprint 1.75 had zero DB queries for role/clientId. Sprint 1.9 requires 2+ DB queries.

## Features Gained vs Sprint 1.75

1. Client portal pages (my-plan, checkin, progress, alerts, messages)
2. Role-based routing (coach vs client separation)
3. Database-backed role resolution (not just metadata)
4. Invitation/email UI on ClientPage
5. Client layout with navigation
6. Unread message count
7. Alert service