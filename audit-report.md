# Production Bug-Fix Audit Report

## Incident 1: Nutrition Plan Lock FK Violation

### Error
```
insert or update on table "nutrition_plans" violates foreign key constraint
"nutrition_plans_created_by_fkey"
```

### Root Cause

**The FK constraint on `nutrition_plans.created_by` references `public.profiles(id)`, but the RPC inserts `auth.uid()` (an `auth.users` UUID).**

When the `handle_new_user` trigger fails (due to `'coach'::app_role` not being in the `app_role` enum), no `profiles` row is created. The user exists in `auth.users` but not in `public.profiles`. The `lock_nutrition_plan` RPC (SECURITY DEFINER) sets `created_by = v_user_id` where `v_user_id = auth.uid()`. This UUID has no matching row in `public.profiles`, so the FK constraint fails.

### Ownership Model Evidence

The business model requires `created_by` to be an `auth.users` ID, NOT a `profiles` ID. Here is the proof:

| Evidence | Location | What it shows |
|----------|----------|---------------|
| RLS policy checks `created_by = auth.uid()` | `20260530120000` line 147 | Policy treats `created_by` as auth.users ID |
| RPC inserts `v_user_id := auth.uid()` | `20260530120000` line 521 | RPC writes auth.users UUID |
| `clients.created_by` FK target | `20260129081000` line 14 | `REFERENCES auth.users(id)` — same business meaning |
| `plan_versions.created_by` FK target | `20251120110128` line 83 | `REFERENCES auth.users(id)` — same table, same column name |
| `plan_overrides.created_by` FK target | `20251120110128` line 107 | `REFERENCES auth.users(id)` — same pattern |

**Conclusion**: The original FK to `public.profiles(id)` in migration `20251120110128` line 71 was a schema design error. Every subsequent migration treats `created_by` as an `auth.users` reference. The FK must be changed to `REFERENCES auth.users(id)`.

### Exact Failing Path

```
NutritionTabContent.tsx:141  handleLockPlan()
  → useNutritionPlanState.ts:279  lockPlan()
    → supabasePlanService.ts:264  supabase.rpc('lock_nutrition_plan', ...)
      → lock_nutrition_plan RPC (SECURITY DEFINER)
        → INSERT INTO nutrition_plans (client_id, created_by, plan_data, status)
          VALUES (p_client_id, v_user_id, ...)   -- v_user_id = auth.uid()
          -- v_user_id has no profiles row → FK VIOLATION
```

### Files Affected

| File | Line | Issue |
|------|------|-------|
| `supabase/migrations/20251120110128_8df2ce8c-85a8-4e93-b31d-9d731f883512.sql` | 71 | `nutrition_plans.created_by` FK → `profiles(id)` should be `auth.users(id)` |
| `supabase/migrations/20251120110128_8df2ce8c-85a8-4e93-b31d-9d731f883512.sql` | 144 | `training_plans.created_by` FK → `profiles(id)` should be `auth.users(id)` (same bug) |

### Database Fix Required

```sql
-- Migration: fix_nutrition_plan_ownership_fk.sql
ALTER TABLE public.nutrition_plans
  DROP CONSTRAINT IF EXISTS nutrition_plans_created_by_fkey;

ALTER TABLE public.nutrition_plans
  ADD CONSTRAINT nutrition_plans_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.training_plans
  DROP CONSTRAINT IF EXISTS training_plans_created_by_fkey;

ALTER TABLE public.training_plans
  ADD CONSTRAINT training_plans_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;
```

### Migration Impact

- **Existing data**: All existing `nutrition_plans.created_by` values are valid `auth.users` UUIDs (they were inserted by the RPC which uses `auth.uid()`). No data migration needed.
- **Existing data**: All existing `training_plans.created_by` values are valid `auth.users` UUIDs. No data migration needed.
- **Rollback**: Revert to `REFERENCES public.profiles(id)` — but this would re-introduce the bug.
- **Risk**: LOW. The FK target change is backward-compatible with all existing data.

---

## Incident 2: Client Management Actions Freeze

### Symptom 2a: "Creating invite" never completes

### Root Cause

**`supabase.rpc('create_client_invitation', ...)` has no timeout. If the RPC call hangs, the `finally` block that resets `isCreatingInvite` never executes.**

The `handleInviteClient` function in `ClientPage.tsx` (line 112-133) has a proper `try/catch/finally` with `setIsCreatingInvite(false)` in the `finally` block. However, the `await createClientInvitation(...)` call on line 116 hangs because `supabase.rpc()` has no configurable timeout. The `await` never resolves, so the `finally` block never runs.

### Exact Failing Path

```
ClientPage.tsx:112  handleInviteClient()
  → setIsCreatingInvite(true)                    -- button shows spinner
  → clientInvitationService.ts:30  supabase.rpc('create_client_invitation', ...)
    → [RPC HANGS — no timeout, no abort signal]
    → setIsCreatingInvite(false) in finally      -- NEVER REACHED
    → button stays in "Creating..." state forever
```

### Symptom 2b: Delete client does nothing

### Root Cause

**`supabase.rpc('soft_delete_client', ...)` has no timeout. The `finally` block that resets `isDeleting` never executes.**

Same pattern as 2a. The `handleConfirmDelete` function (line 149-170) calls `deleteClientFromHook(activeClientId)` which calls `archiveClient(clientId)` which calls `supabase.rpc('soft_delete_client', ...)`. If the RPC hangs, the entire promise chain hangs, and the `finally` block never runs.

### Exact Failing Path

```
ClientPage.tsx:149  handleConfirmDelete()
  → setIsDeleting(true)                          -- button shows spinner
  → useSupabaseClients.ts:148  archiveClient(clientId)
    → supabaseClientService.ts:290  supabase.rpc('soft_delete_client', ...)
      → [RPC HANGS — no timeout, no abort signal]
      → setIsDeleting(false) in finally          -- NEVER REACHED
      → button stays in "Deleting..." state forever
```

### Files Affected

| File | Line | Issue |
|------|------|-------|
| `src/services/clientInvitationService.ts` | 30 | `supabase.rpc('create_client_invitation', ...)` — no timeout, no abort signal |
| `src/services/supabaseClientService.ts` | 290 | `supabase.rpc('soft_delete_client', ...)` — no timeout, no abort signal |
| `src/pages/ClientPage.tsx` | 112-133 | `handleInviteClient` — no timeout guard on RPC call |
| `src/pages/ClientPage.tsx` | 149-170 | `handleConfirmDelete` — no timeout guard on RPC call |

### Frontend Fix Required

Add `AbortController` with 15-second timeout to both RPC calls:

**`src/services/clientInvitationService.ts`** (around line 30):
```typescript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 15000);
try {
  const { data, error } = await supabase.rpc('create_client_invitation', {
    p_client_id: input.clientId,
    p_invited_email: input.invitedEmail ?? null,
    p_invite_token_hash: tokenHash,
    p_expires_at: input.expiresAt ?? null,
  }, { signal: controller.signal });
  // ... existing code
} catch (error) {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return { token: null, inviteUrl: null, invitationId: null, error: 'Request timed out' };
  }
  throw error;
} finally {
  clearTimeout(timeoutId);
}
```

**`src/services/supabaseClientService.ts`** (around line 290):
```typescript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 15000);
try {
  const { data, error } = await supabase.rpc(
    'soft_delete_client' as never,
    { p_client_id: clientId } as never,
    { signal: controller.signal } as never,
  );
  // ... existing code
} catch (error) {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return { success: false, error: 'Request timed out' };
  }
  throw error;
} finally {
  clearTimeout(timeoutId);
}
```

### Database Fix Required

Add `statement_timeout` to both RPC functions to prevent server-side hangs:

```sql
-- In create_client_invitation RPC (migration 20260530120000):
BEGIN
  PERFORM set_config('statement_timeout', '10000', true); -- 10s
  -- ... existing function body

-- In soft_delete_client RPC (migration 20260710000000):
BEGIN
  PERFORM set_config('statement_timeout', '10000', true); -- 10s
  -- ... existing function body
```

---

## Incident 3: Nutrition Generation Infinite Loading

### Symptom
"Loading plan from database" spinner never resolves. Other tabs work.

### Root Cause

**Race condition in `loadRequestIdRef` causes all concurrent load requests to return early without clearing the LOADING state.**

The `loadPlanForClient` function in `usePlanFetch.ts` uses a request ID counter to invalidate stale concurrent calls:

```typescript
// Line 109: Capture current request ID
const currentRequestId = ++loadRequestIdRef.current;
setUiState("LOADING");

// Line 120: If another call incremented the counter, this call is stale
if (currentRequestId !== loadRequestIdRef.current) return;  // ← BUG: returns without setUiState("IDLE")
```

When `loadPlanForClient` is called multiple times in quick succession (e.g., React StrictMode double-mount, rapid client switching, or the `useEffect` in `NutritionTabContent` re-firing):

1. Call 1: `currentRequestId = 1`, `setUiState("LOADING")`, starts `await Promise.all(...)`
2. Call 2: `currentRequestId = 2`, `setUiState("LOADING")`, starts `await Promise.all(...)`
3. Call 1 resumes: `currentRequestId (1) !== loadRequestIdRef.current (2)` → **returns early, UI stays at LOADING**
4. Call 2 resumes: `currentRequestId (2) === loadRequestIdRef.current (2)` → proceeds normally

If a third call happens before call 2 completes, call 2 also returns early. This creates a cascade where ALL requests return early, and the UI is permanently stuck at "LOADING".

### Exact Failing Path

```
NutritionTabContent.tsx:77  useEffect → loadPlanForClient(activeClientId)
  → usePlanFetch.ts:109  currentRequestId = ++loadRequestIdRef.current  (e.g., 1)
  → usePlanFetch.ts:111  setUiState("LOADING")
  → usePlanFetch.ts:115  await Promise.all([fetchCurrentPlan, checkPlanLockStatus])
    [React StrictMode double-mount triggers second call]
  → usePlanFetch.ts:109  currentRequestId = ++loadRequestIdRef.current  (e.g., 2)
  → usePlanFetch.ts:111  setUiState("LOADING")
  → usePlanFetch.ts:115  await Promise.all([fetchCurrentPlan, checkPlanLockStatus])
    [First call resumes]
  → usePlanFetch.ts:120  currentRequestId (1) !== loadRequestIdRef.current (2)
  → return  -- UI stays at "LOADING" forever
```

### Files Affected

| File | Line | Issue |
|------|------|-------|
| `src/hooks/usePlanFetch.ts` | 120 | Stale request returns without clearing LOADING state |
| `src/hooks/usePlanFetch.ts` | 146 | Same bug in second `Promise.all` block |
| `src/hooks/usePlanFetch.ts` | 107 | `!clientId` early return — no UI state reset (minor, only on empty clientId) |

### Frontend Fix Required

**`src/hooks/usePlanFetch.ts`** — Add `setUiState("IDLE")` before every early return:

```typescript
// Line 107: Early return for empty clientId
if (!clientId) {
  setUiState("IDLE");  // ← ADD
  return;
}

// Line 120: Stale request check after first Promise.all
if (currentRequestId !== loadRequestIdRef.current) {
  setUiState("IDLE");  // ← ADD
  return;
}

// Line 146: Stale request check after second Promise.all
if (currentRequestId !== loadRequestIdRef.current) {
  setUiState("IDLE");  // ← ADD
  return;
}

// Line 184: Stale request check in catch block
if (currentRequestId !== loadRequestIdRef.current) {
  setUiState("IDLE");  // ← ADD
  return;
}
```

### No Database Fix Required

This is a frontend-only race condition. No database changes needed.

---

## Validation Steps

### Incident 1 — FK Fix

1. Run the migration to change FK targets
2. Verify: `SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'public.nutrition_plans'::regclass AND conname LIKE '%created_by%'` → shows `REFERENCES auth.users(id)`
3. Verify: `SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'public.training_plans'::regclass AND conname LIKE '%created_by%'` → shows `REFERENCES auth.users(id)`
4. Test: Lock a nutrition plan for a coach who signed up during the broken trigger period → lock succeeds
5. Test: Lock a nutrition plan for a coach with a valid profiles row → lock succeeds (regression check)

### Incident 2 — Timeout Fix

1. Test: Click "Invite Client" → invitation created or error returned within 15 seconds
2. Test: Click "Delete Client" → client archived or error returned within 15 seconds
3. Test: Disconnect network, click "Invite Client" → error returned within 15 seconds (not infinite hang)
4. Test: Disconnect network, click "Delete Client" → error returned within 15 seconds (not infinite hang)

### Incident 3 — Race Condition Fix

1. Test: Navigate to Nutrition tab for a client with a locked plan → plan loads, spinner resolves
2. Test: Navigate to Nutrition tab for a client without a plan → "No nutrition plan" message shown
3. Test: Rapidly switch between clients in the client selector → plan loads correctly for each client
4. Test: Navigate away from Nutrition tab while loading → no console errors, no stuck state
5. Test: Refresh page on Nutrition tab → plan loads on re-mount

### Integration Validation

1. Full flow: Create client → generate plan → lock plan → verify no FK error
2. Full flow: Create client → invite client → client claims invitation → client views plan
3. Full flow: Create client → delete client → client removed from list, invitations revoked