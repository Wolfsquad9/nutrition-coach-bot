# Client Onboarding & Invitation Flow — Repository-Wide Audit

**Date:** 2026-07-08  
**Scope:** Full trace from coach-created client → authenticated client portal user  
**Method:** Static code analysis of all migrations, services, pages, hooks, and Edge Functions  
**Rule:** No code modifications — description only.

---

## 1. When a coach creates a client, where is the client's email collected?

**Answer: The email is NOT collected in the coach UI.**

- The `Client` type (`src/types/index.ts`, inferred from `src/hooks/useSupabaseClients.ts` line 19) includes an `email: ''` field.
- The `clients` table has an `email TEXT` column (added by migration `20260129081000` line 18).
- However, the coach-facing client creation form in `src/pages/ClientPage.tsx` (lines 182–258) renders fields for: firstName, lastName, birthDate, gender, weight, height, primaryGoal, activityLevel, trainingDaysPerWeek, trainingExperience. **There is no `<Input>` for email.**
- The `createEmptyClient()` function in `src/hooks/useSupabaseClients.ts` (line 19) sets `email: ''` — an empty default that is never surfaced to the coach.
- The `clientToSupabaseRow()` function in `src/services/supabaseClientService.ts` (line 91) passes `email: client.email || null` to the DB insert, so it will always be `null`.

**Result:** The email field exists in the schema and data model but is invisible in the coach UI. Coaches cannot enter a client's email during creation.

---

## 2. Is a Supabase Auth user automatically created? If yes, where?

**Answer: NO. There is no automatic `auth.users` creation when a coach inserts a client row.**

- `src/services/supabaseClientService.ts` → `createClient()` (line 149) performs a simple `supabase.from('clients').insert(insertData)` with `user_profile_id: null` and `created_by: auth.uid()`.
- There is **no trigger on `public.clients` INSERT** that creates an `auth.users` entry.
- The only trigger on `auth.users` is `on_auth_user_created` (migration `20260131112805`), which fires **after** an auth user is created and inserts a `public.profiles` row. This is the reverse direction (auth → profile), not client → auth.

**Result:** A coach-created client row exists in `public.clients` with `user_profile_id = NULL` and has no corresponding `auth.users` entry. The client does not yet exist as a platform user.

---

## 3. Is there an invitation token system? Which tables and services implement it?

**Answer: YES. A complete invitation token system exists at the database and service layer.**

### Database

- **Table:** `public.client_invitations` (created in migration `20260530120000` lines 201–212)
  - `id UUID PRIMARY KEY`
  - `client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE`
  - `invited_email TEXT` (nullable — can be empty)
  - `invite_token_hash TEXT NOT NULL UNIQUE` (SHA-256 hash of the raw token)
  - `created_by UUID NOT NULL REFERENCES auth.users(id)`
  - `accepted_by UUID REFERENCES auth.users(id)` (set on claim)
  - `accepted_at TIMESTAMP WITH TIME ZONE`
  - `expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '14 days')`
  - `revoked_at TIMESTAMP WITH TIME ZONE`
  - `created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`

- **RPC — `create_client_invitation()`** (migration `20260530120000` lines 241–289):
  - Validates the caller owns the client (`c.created_by = v_user_id`)
  - Inserts a row into `client_invitations` with the hashed token
  - Returns the invitation UUID

- **RPC — `claim_client_invitation()`** (migration `20260530120000` lines 291–345):
  - Validates the token hash matches, not expired, not revoked, not already accepted
  - `UPDATE public.clients SET user_profile_id = v_user_id WHERE id = v_invitation.client_id`
  - `UPDATE public.profiles SET trainer_id = ..., role = 'client', email = ... WHERE id = v_user_id`
  - `UPDATE public.user_roles SET role = 'client' WHERE user_id = v_user_id`
  - `UPDATE public.client_invitations SET accepted_by = v_user_id, accepted_at = now()`
  - Returns the client UUID

- **RLS:** `client_invitations` has policies for coach management (created_by) and client read (accepted_by).

### Service Layer

- **File:** `src/services/clientInvitationService.ts`
  - `createInvitationToken()` — generates 32 random bytes as hex string
  - `hashInvitationToken(token)` — SHA-256 hash via `crypto.subtle.digest`
  - `createClientInvitation(input)` — calls `create_client_invitation` RPC, returns `{ token, inviteUrl, invitationId, error }`
  - `claimClientInvitation(token)` — calls `claim_client_invitation` RPC, returns `{ clientId, error }`

### Frontend Pages

- **`src/pages/SignupPage.tsx`** — reads `?invite=` from URL, after signup calls `claimClientInvitation()`, navigates to `/my-plan`
- **`src/pages/LoginPage.tsx`** — reads `?invite=` from URL, after login calls `claimClientInvitation()`, navigates to client route
- **`src/pages/ClientClaimPage.tsx`** — a standalone claim page (route `/claim/:token`), but **this route is NOT registered in `App.tsx`** (no `<Route path="/claim/:token">` exists). This page is dead code.

---

## 4. Is there an email invitation system? If yes, which Edge Function or service sends it?

**Answer: NO. There is no email sending for invitations.**

- The `createClientInvitation()` function generates an `inviteUrl` string but **never sends it**.
- The Edge Functions in `supabase/functions/` are:
  - `generate-coach-alerts/` — AI alert generation
  - `generate-fitness-plan/` — AI plan generation
  - `get-shared-plan/` — public plan sharing (requires auth)
  - `send-whatsapp/` — WhatsApp skeleton (not invitation-related)
- **There is no `send-invitation-email` Edge Function.**
- There is no integration with any email service (Resend, SendGrid, SMTP, etc.) for invitations.
- The `sharePlanService.ts` only handles plan sharing links, not invitations.

**Result:** The coach would need to manually copy the invite URL from the browser console or a future UI and send it to the client via their own email/WhatsApp.

---

## 5. How is `clients.user_profile_id` populated?

**Answer: Exclusively via the `claim_client_invitation()` RPC.**

- When a client signs up or logs in with a valid invitation token, `claimClientInvitation()` is called from either `SignupPage.tsx` (line 33) or `LoginPage.tsx` (line 34).
- The RPC executes (migration `20260530120000` lines 317–321):
  ```sql
  UPDATE public.clients
  SET user_profile_id = v_user_id,
      updated_at = now()
  WHERE id = v_invitation.client_id
    AND (user_profile_id IS NULL OR user_profile_id = v_user_id);
  ```
- There is **no other code path** that sets `user_profile_id`. It is not set during client creation (it's explicitly `null` in `clientToSupabaseRow()` line 93).

---

## 6. How is `user.user_metadata.role` assigned?

**Answer: There are two competing flows with different behavior.**

### Flow A: SignupPage.tsx (the primary invite flow)
- `supabase.auth.signUp({ email, password })` — **no `options.data` is passed** (line 24).
- The `handle_new_user()` trigger (migration `20260530120000` lines 68–87) creates:
  - `public.profiles` with `role = 'trainer'`
  - `public.user_roles` with `role = 'trainer'`
- The JWT `user_metadata.role` is **not set** (defaults to `'coach'` fallback in `useAuth.tsx` line 69).
- After signup, `claim_client_invitation()` updates `profiles.role` and `user_roles.role` to `'client'`, but **the JWT is not refreshed**, so `user_metadata.role` remains `'coach'` until the user logs out and back in.

### Flow B: ClientClaimPage.tsx (dead code — route not registered)
- `supabase.auth.signUp({ email, password, options: { data: { role: 'client', client_id: clientId } } })` (lines 71–79).
- This **does** set `user_metadata.role = 'client'` and `user_metadata.client_id = clientId` in the JWT at signup time.
- However, this page is **unreachable** because no route exists for it in `App.tsx`.

### Key Issue
- `useAuth.tsx` line 69: `const userRole = user ? (user.user_metadata?.role ?? 'coach') : null;`
- This reads from the JWT, not from the database. After the claim flow via SignupPage, the JWT still says `'coach'` (or undefined → `'coach'` fallback).
- `ProtectedRoute.tsx` uses `userRole` to enforce role-based access. A client who just signed up via the invite link will be treated as a coach and redirected to `/` (coach home) instead of `/my-plan` (client home).

---

## 7. How does a newly invited client reach the client portal?

**Answer: Via the `/signup?invite=TOKEN` URL, but with caveats.**

1. Coach generates invitation → gets `inviteUrl` = `https://app.example.com/signup?invite=TOKEN`
2. Coach manually sends this URL to the client (no automated email)
3. Client opens URL → `SignupPage.tsx` renders with `inviteToken` from search params
4. Client fills in email + password → `supabase.auth.signUp()`
5. **If email confirmation is disabled** (Supabase project setting): `data.session` is available
   - `claimClientInvitation(inviteToken)` is called immediately
   - On success → `navigate('/my-plan')`
   - **Problem:** JWT role is still `'coach'` → `ProtectedRoute` with `role="client"` will redirect to `/` instead
6. **If email confirmation is enabled** (Supabase default): `data.session` is `null`
   - Claim is skipped → user sees "Please confirm your email, then use the invitation link again" toast
   - User confirms email, clicks invite link again → this time they're already authenticated → `LoginPage.tsx` handles it
   - `LoginPage.tsx` calls `claimClientInvitation()` → on success navigates to `/clients/{clientId}/nutrition` (coach route!) instead of `/my-plan`
   - **Problem:** LoginPage navigates to a coach route, not the client portal

---

## 8. Is the onboarding flow complete, partially implemented, or missing?

**Answer: PARTIALLY IMPLEMENTED — the database and service layer are complete, but the frontend integration and email delivery are missing.**

### What works:
- ✅ `client_invitations` table with proper schema, indexes, RLS
- ✅ `create_client_invitation()` RPC with ownership validation
- ✅ `claim_client_invitation()` RPC that atomically links client, updates roles, marks invitation accepted
- ✅ `clientInvitationService.ts` with token generation, hashing, RPC calls
- ✅ Invite URL generation (`/signup?invite=TOKEN`)
- ✅ SignupPage reads invite token and attempts claim
- ✅ LoginPage reads invite token and attempts claim

### What is missing or broken:
- ❌ **No coach UI to trigger invitation** — no "Invite Client" button anywhere in the coach dashboard
- ❌ **Email field not rendered** in client creation form (`ClientPage.tsx`)
- ❌ **No email sending** — no Edge Function, no service integration
- ❌ **`ClientClaimPage.tsx` is dead code** — route not registered in `App.tsx`
- ❌ **JWT role mismatch** — `user_metadata.role` is not set during SignupPage signup, and the JWT is not refreshed after `claim_client_invitation()` updates the DB role
- ❌ **LoginPage navigates to coach route** after claim (`/clients/{clientId}/nutrition`) instead of client portal (`/my-plan`)
- ❌ **No invitation status UI** — coach cannot see which invitations are pending, accepted, or expired

---

## 9. Can I realistically test the client portal today without manually creating a Supabase Auth user?

**Answer: NO.**

To test the client portal end-to-end, you would need to:

1. Create a client record in `public.clients` with `user_profile_id = NULL`
2. Manually create an `auth.users` entry (via Supabase dashboard or API)
3. Manually set `user_metadata.role = 'client'` and `user_metadata.client_id = <client-uuid>` on that auth user
4. Manually update `public.clients.user_profile_id` to the auth user's ID
5. Manually create `public.profiles` and `public.user_roles` entries with `role = 'client'`
6. Log in with that auth user's credentials

The invitation system is designed to automate steps 2–5, but:
- There is no coach UI to trigger it
- There is no email to deliver the invite URL
- The JWT role assignment is broken in the primary flow

**Without manual database manipulation, the client portal (`/my-plan`, `/checkin`, `/progress`, `/alerts`, `/messages`) is unreachable.**

---

## 10. If the flow is incomplete, identify exactly what is missing and estimate the implementation effort.

### Missing Components

| # | Component | Details | Effort |
|---|-----------|---------|--------|
| 1 | **Coach UI: Invite button** | Add "Invite Client" action in the coach client view. Calls `createClientInvitation()`, displays the invite URL (or copies to clipboard). | Small |
| 2 | **Coach UI: Email field** | Add email input to client creation form in `ClientPage.tsx`. | Small |
| 3 | **Email sending Edge Function** | Create a `send-invitation-email` Supabase Edge Function that uses Resend/SendGrid to deliver the invite URL. | Medium |
| 4 | **JWT role fix** | Either (a) pass `options.data.role = 'client'` in SignupPage when invite token is present, or (b) call `supabase.auth.refreshSession()` after `claim_client_invitation()` to reload the JWT with updated metadata. | Small |
| 5 | **LoginPage navigation fix** | Change line 39 from `navigate('/clients/${claimResult.clientId}/nutrition')` to `navigate('/my-plan')` when an invite token is being claimed. | Trivial |
| 6 | **ClientClaimPage route** | Either register the route in `App.tsx` or remove the dead code. | Trivial |
| 7 | **Invitation status UI** | Show pending/accepted/expired invitations in the coach client detail view. | Medium |
| 8 | **Email confirmation handling** | Improve the UX when email confirmation is required — currently the user sees a confusing toast and must re-click the invite link. | Small |

### Total Estimated Effort: **Small–Medium** (2–5 days for a single developer)

The database foundation (tables, RPCs, RLS) is solid. The service layer is complete. The gaps are primarily in:
- Frontend UI (coach-facing invite trigger + status)
- Email delivery (new Edge Function)
- JWT metadata synchronization (small fix in SignupPage)
- Navigation correctness (small fix in LoginPage)

### Critical Path

1. Add email field to client creation form (trivial)
2. Add "Invite Client" button to coach UI (small)
3. Fix JWT role in SignupPage when invite token is present (small)
4. Fix LoginPage navigation for invite claims (trivial)
5. Create email sending Edge Function (medium — requires Resend/SendGrid setup)
6. Wire the invite button to call `createClientInvitation()` and trigger the email Edge Function

Steps 1–4 would make the flow testable end-to-end (with manual URL sharing). Step 5 is required for a production-ready experience.