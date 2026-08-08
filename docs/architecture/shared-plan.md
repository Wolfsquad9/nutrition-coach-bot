# Shared Plan — Architecture

## What this feature is

The Shared Plan is a **public, read-only, immutable snapshot** of a coach's
locked nutrition plan. It is intentionally accessible **without authentication**
via an unguessable link. Anyone who possesses the URL can view the snapshot.
No one — authenticated or not — can mutate it.

This is a **core product capability**, not an edge case. Coaches share plans
with clients (who may not yet be onboarded), with gyms (printed handouts),
with themselves across devices, and with prospective clients as marketing
material. Removing it removes a product surface.

## Why this document exists

Sprint 1.77's "restore shared plan" patch shipped the Edge Function code but
not the database changes. The result: the function runs, but RLS rejects the
read. (See `sprint-1.9-regression-report.md`, REGRESSION 7.)

Sprint 1.95's previous attempt to fix this reintroduced the `service_role`
key — a CRITICAL exposure that audit C1 (commit `55f066f`) had explicitly
removed.

This document describes the **production-correct** architecture that
replaces both. It exists so that future contributors do not "fix" the
endpoint by re-introducing service_role, or by adding an over-broad anon
RLS policy.

---

## The two-domain security model

The FitPlan database has two security domains:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ DOMAIN 1 — AUTHENTICATED WORKSPACE                                      │
│                                                                         │
│   Who: coaches (trainer role), admins                                   │
│   Gate: Supabase JWT, RLS policies TO authenticated                     │
│   Reads: full plan_versions row, including plan_payload,                │
│          created_by, idempotency_key, payload_hash, etc.                │
│   Writes: yes — INSERT/UPDATE/DELETE all permitted by RLS               │
│   Endpoint: the standard anon-key client; auth headers attached         │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│ DOMAIN 2 — PUBLIC SHARING                                               │
│                                                                         │
│   Who: anyone with the URL                                              │
│   Gate: possession of a valid plan_versions.id (UUID v4)                │
│   Reads: ONLY (locked_snapshot_json, created_at) — nothing else         │
│   Writes: none                                                          │
│   Endpoint: get-shared-plan Edge Function → get_shared_plan_snapshot RPC│
└─────────────────────────────────────────────────────────────────────────┘
```

These domains are **deliberately separate**. They do not share code paths.
There is no SQL that crosses from Domain 2 into Domain 1. The Edge Function
deliberately does not forward the caller's JWT — even if the caller is
authenticated, the request uses the anon key. There is no admin client.

## Why a SECURITY DEFINER RPC, not a SELECT policy

We considered three approaches:

| Approach                                  | Verdict            |
| ----------------------------------------- | ------------------ |
| A. Restore `service_role` in the function | **REJECTED** — re-creates the C1 critical exposure |
| B. Add anon SELECT policy on plan_versions | **REJECTED** — exposes every column; relies on application-layer projection |
| C. SECURITY DEFINER RPC with hard-coded projection | **CHOSEN** — narrowest possible surface |

The chosen approach uses a SECURITY DEFINER function that SELECTs exactly two
columns and returns them. There is no `SELECT *`. A future column added to
`plan_versions` is **automatically not exposed** — it would only become
exposed if the function body is explicitly edited. This is the principle of
"the projection is the security boundary."

Additionally:

- `REVOKE SELECT ON public.plan_versions FROM anon` makes the wrong path
  syntactically impossible. A future developer cannot accidentally write a
  `from("plan_versions").select("*")` call that reaches the anon client.
- The function explicitly filters `locked_snapshot_json IS NOT NULL` and
  `archived = false`, so draft and archived plans are not shareable.
- The function takes a single TEXT argument and validates it as a UUID
  before doing anything else, so malformed input cannot leak through
  type-cast error messages.

## The read path

```
   Browser                Edge Function               Postgres
   ───────                ──────────────               ────────
   GET /plan/<UUID>  ──►  Deno.serve
                           │
                           │ createClient(URL, anonKey)  ← NO bearer
                           │ (single client, no branching)
                           │
                           │ validate UUID
                           │
                           │ supabase.rpc("get_shared_plan_snapshot",
                           │   { p_token: uuid })
                           │
                           │                        SECURITY DEFINER
                           │                        SELECT locked_snapshot_json,
                           │                               created_at
                           │                        FROM plan_versions
                           │                        WHERE id = uuid
                           │                          AND locked_snapshot_json IS NOT NULL
                           │                          AND archived = false
                           │                        LIMIT 1
                           │
                           ◄── { snapshot, created_at } (or empty)
                           │
   ◄── 200 { snapshot, createdAt }
```

## What is and isn't exposed

| Column on plan_versions          | Exposed via shared plan? | Why                                                  |
| -------------------------------- | :----------------------: | ---------------------------------------------------- |
| `locked_snapshot_json`           | ✅                       | This IS the shareable content                        |
| `created_at`                     | ✅                       | So the recipient sees when it was locked             |
| `plan_payload`                   | ❌                       | Internal duplicate; not for public                   |
| `created_by`                     | ❌                       | Coach identity                                       |
| `idempotency_key`                | ❌                       | Internal                                             |
| `payload_hash`                   | ❌                       | Internal                                             |
| any column added in the future   | ❌                       | Projection is the boundary                           |

Draft plans (no `locked_snapshot_json`) and archived plans (`archived = true`)
are not shareable even with the correct UUID.

## Files

| Concern               | File                                                            |
| --------------------- | --------------------------------------------------------------- |
| Database function     | `supabase/migrations/20260805120000_shared_plan_public_rpc.sql` |
| Edge Function         | `supabase/functions/get-shared-plan/index.ts`                   |
| Frontend service      | `src/services/sharePlanService.ts`                              |
| Frontend types        | `src/integrations/supabase/types.ts` (RPC declaration)           |
| Regression tests      | `e2e/shared-plan.spec.ts`                                       |

## Out of scope

- **Revocation.** Explicitly out of scope per the product decision. Rotation
  is handled at the URL level (the coach shares a fresh URL after locking a
  new version). Adding revocation would require a separate `share_tokens`
  table and is not in this design.
- **Audit logging.** Not in this design. If/when added, it MUST be in
  Domain 2 only — never log coach identity alongside a public token query.
- **Sharing drafts.** Explicitly forbidden. The function returns
  `404 Not Found` for any plan where `locked_snapshot_json IS NULL`.
- **Authenticated reads through this endpoint.** Possible but unnecessary;
  the same RPC works for authenticated callers, but the frontend uses a
  direct anon request. Do not couple these paths.

## How to audit this feature

1. Read the Edge Function. It must contain **no** `SUPABASE_SERVICE_ROLE_KEY`,
   **no** JWT branching, and **no** `from("plan_versions").select(...)`. The
   only database call is `.rpc("get_shared_plan_snapshot", ...)`.
2. Read the RPC. It must `SELECT` exactly two columns, filter for
   `locked_snapshot_json IS NOT NULL AND archived = false`, and reject
   malformed UUIDs at the top.
3. Verify with the anon key in psql:
   ```sql
   SET ROLE anon;
   SELECT * FROM plan_versions;           -- should fail
   SELECT * FROM get_shared_plan_snapshot('00000000-0000-0000-0000-000000000000');  -- empty
   ```
4. Run `npm run test:e2e -- shared-plan` (or the equivalent Playwright
   invocation). The eight regression tests must pass.