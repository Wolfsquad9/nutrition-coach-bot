# FitPlan — Decisions Log

## D0 — Athlete-first direction, hybrid coach-business model (provisional)

FitPlan prioritizes athlete performance, competitive preparation, and measurable
outcomes while serving both owner-operated coaching and (eventually) independent
coaches. *Rationale:* owner-stated direction. *Evidence:* direction statement,
not code. *Consequences:* pillars in PROJECT_BRIEF §6 stay hypotheses until
validated. *Revisit when:* user evidence contradicts the prioritization or the
business model changes. (Recommendation — not an accepted, user-approved decision.)

**Status:** canonical, append-only · **Updated:** 2026-10-18 ·
**Baseline:** `main` @ `72c7862`

Rule: each entry records status (**accepted** / **provisional** / **open** /
**superseded**), rationale, evidence, consequences, and what would cause a
revisit. Never rewrite — supersede with a new entry. Strategic recommendations
are labelled as such, not as accepted decisions. No decision dates are invented:
implementation decisions below are evidenced by the commits that introduced them;
open questions carry the date they were recorded.

## D1 — JSONB payload convention (accepted, evidenced in `099ef2e`)

New recorded preferences are additive optional keys inside the `plan_payload`
JSONB document; no schema change required. Optional keys keep legacy payloads
valid and historical rows are never rewritten.
*Evidence:* `PlanPayload.mealVariety?` + conditional-spread builder
(`src/services/supabasePlanService.ts`); whole-payload `hashPlanPayload`.
*Consequences:* future preferences follow the same pattern. *Revisit if:* a
preference needs querying/indexing that JSONB cannot serve.

## D2 — Byte-identical legacy fallback rule (accepted, evidenced Phase 3C/4/5)

Every opt-in generation path keeps a byte-identical legacy path: omitted/false
flags route to the exact pre-existing generator output.
*Evidence:* `weeklyPlanGenerator` strips `weekUsedIngredientIds` when the flag is
off; `traditional` runs the legacy weekly path; regression suites
(`archetypeGeneration` omitted/false byte-identical; `CandidateGenerator` legacy
mode; `phase4Activation` same-allow-list fallback).
*Consequences:* optimizer/generation changes stay reviewable by diff.
*Revisit if:* a safety fix requires changing legacy output (then version it).

## D3 — Optimizer default: omitted diversity stays ON (accepted, evidenced in `099ef2e`)

`weekIngredientDiversity: input.weekIngredientDiversity ?? true` — omitted means
enabled, preserving the optimizer's established behaviour (candidates were always
generated with cross-day diversity on). Explicit `false` opts out.
*Evidence:* `SeededCandidateGenerator` + `GenerationInput` docs
(`src/services/optimization/`); threading test asserting the default.
*Consequences:* existing callers keep current output without changes.
*Revisit if:* user evidence favors Traditional as the safer default (see Open O3).

## D4 — Preference recorded at generation time, never inferred (accepted, evidenced in `099ef2e`)

The variety value persisted on lock is the generation-time selection stored on
the draft (`draftMealVariety` ref, same pattern as the weekly rate). A draft
generated without an explicit preference persists no key; absent key renders no
athlete label.
*Evidence:* `setDraftPlan(..., { mealVariety })`, `draftMealVarietyRef`,
conditional-spread in `buildLockedPlanPayload`, badge gated on `plan.mealVariety`.
*Consequences:* legacy payloads stay honest. *Revisit if:* a preference ever
needs backfill (requires explicit migration decision, never silent inference).

## D5 — Meal variety is coach control, athlete-visible (accepted, evidenced in `099ef2e`)

The toggle lives in the coach weekly-generation flow; athletes see only the
recorded-preference badge on `/my-plan`. Daily generation is deliberately
unaffected (weekly-only control).
*Evidence:* `NutritionTabContent` ToggleGroup (default `'more'`);
`ClientMyPlanPage` badge. *Revisit if:* user evidence supports athlete choice
(see Open O2).

## D6 — Roles resolve from the DB, never JWT claims (accepted, prior implementation)

`useAuth` sources `user_roles` + `clients.clientId`; JWT metadata explicitly not
used; resolution failure falls safe to sign-in.
*Evidence:* `src/hooks/useAuth.tsx:5-10,52-53,81`. *Revisit if:* auth model
changes (e.g. org-scoped roles under tenancy).

## Open O1 — Synthetic adherence (resolved 2026-10-19, P0-2)

`src/services/checkin/coachingIntelligenceService.ts` previously exported three
dev-only stubs (`getAdherenceTrend`, `getProgressTrajectory`,
`generateWeeklySummary`). Tracing all imports and routes confirmed none has a
production consumer: `getAdherenceTrend` and `getProgressTrajectory` have no
callers; `generateWeeklySummary` was imported only by the orphaned
`ClientDetailView` (no route points to it). All three stubs, their test file,
and the dead `generateWeeklySummary` dependency were removed — no production
path returns synthetic coaching metrics or summaries.

Canonical adherence metrics now live in `src/domain/coaching/adherenceMetrics.ts`
(pure) + `src/services/checkin/adherenceMetricsService.ts` (I/O), reading the
real `daily_checkins.meal_adherence` and `weekly_reviews.adherence_score`
columns with daily-over-weekly precedence per ISO week. Missing data is never
fabricated — the score is `null` and the UI renders `—`, not `0%`. The reachable
client ring (`ClientCheckinDashboard`) is labeled "7-day Adherence" (neutral,
never "verified compliance"), with coverage shown separately as "X/Y days
checked in." Pinned by 20 domain unit tests plus component-level null-handling
tests. **Decision: remove unused stubs; use canonical module for all displayed
metrics.**

## Open O2 — Preference ownership (open, recorded 2026-10-18)

Coach-only control (current, D5) vs athlete-visible choice. Affects `PlanPayload`
evolution and `/my-plan` UX. *Revisit when:* user evidence supports a change.

## Open O3 — Default variety policy (open, recorded 2026-10-18)

`'more'` preserves today's optimizer behavior — but is it the desired product
default, or should Traditional be default until variety is user-validated?
*Revisit when:* seeded-backend verification + user feedback exist.

## Open O4 — Observability posture (open, recorded 2026-10-18)

Real Sentry DSN via deployment-env config (PII-stripping already coded in
`main.tsx`) vs removal. Current `.env` value matches the `.env.example`
placeholder pattern, so the SDK sends nothing. *Revisit when:* a real project
receives a non-prod test event, or the SDK is removed.

## Open O5 — Multi-tenant readiness (open, recorded 2026-10-18)

"Independent coaches on their own businesses" implies org/workspace isolation;
current model is coach-owns-clients with no org entity. Decide before any
business-model work. *Revisit when:* a tenancy model passes design review
(ROADMAP P3-1).


## Open O6 — No broad performance-aware nutrition engine before discovery (open, recorded 2026-10-18)

No training↔nutrition coupling exists and no athlete performance model exists in
schema or domain. Recommendation: discovery study + ONE narrow flagged prototype
with pre-registered success metric first (ROADMAP P2). *Revisit when:* P2-1/P2-2
produce evaluated evidence.

## Open O7 — Phase 3A scope (open, recorded 2026-10-18)

Unknown — the label appears only as a "Phase 5 3A" comment prefix; no documented
commitment found. Do not invent its intended scope. *Revisit when:* author
intent or new evidence establishes what 3A denoted.